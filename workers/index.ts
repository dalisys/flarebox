// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import PostalMime from "postal-mime";
import { z } from "zod";
import { sendEmail } from "./email-sender";
import { storeAttachments, type StoredAttachment } from "./lib/attachments";
import {
	validateSender,
	SenderValidationError,
	generateMessageId,
	buildThreadingHeaders,
	listMailboxes,
} from "./lib/email-helpers";
import { SendEmailRequestSchema } from "./lib/schemas";
import { handleReplyEmail, handleForwardEmail } from "./routes/reply-forward";
import { Folders } from "../shared/folders";
import type { Env } from "./types";
import { requireMailbox, type MailboxContext } from "./lib/mailbox";
import { canTrustedSenderOverride, classifySpam, isAuthenticatedSender, senderDomain, domainBlockKey, type SpamSettings } from "./lib/spam";
import { writeEmail } from "./lib/ai";
import { scanWithRspamd, type RspamdAction } from "./lib/rspamd";
import { addManagedAddress, addManagedDomain, clearMailboxOperation, getMailboxOperation, getManagedConfig, isRetiredAddress, removeManagedDomain, retireManagedAddress, saveMailboxOperation } from "./lib/managed-config";
import { disableCatchAll, enableRouting, ensureWorkerRule, inspectCatchAll, inspectRouting, removeWorkerRule } from "./lib/cloudflare-routing";
import { mailboxArchive } from "./lib/mailbox-export";
import { getNotifySettings, getVapidKeys, isPushEndpoint, removeSubscription, saveNotifySettings, saveSubscription } from "./lib/push";
import { defaultModel, getModelId, MODEL_ID_PATTERN, saveModelId } from "./lib/model";

type AppContext = Context<MailboxContext>;

// -- Request body schemas (kept for validation) ---------------------

const CreateMailboxBody = z.object({
	email: z.string().email(),
	name: z.string().min(1),
	settings: z.record(z.any()).optional(), // unvalidated — agentSystemPrompt goes straight to AI
});

const DraftBody = z.object({
	to: z.string().optional(),
	cc: z.string().optional(),
	bcc: z.string().optional(),
	subject: z.string().optional(),
	body: z.string(),
	in_reply_to: z.string().optional(),
	thread_id: z.string().optional(),
	draft_id: z.string().optional(),
});

const BulkEmailBody = z.object({
	action: z.enum(["archive", "read", "unread", "delete"]),
	folder: z.string().min(1),
	ids: z.array(z.string().min(1)).min(1).max(100).optional(),
	expandThreads: z.boolean().optional(),
});

// -- Helpers --------------------------------------------------------

function slugify(text: string) { // can return "" for non-alphanumeric input
	return text.toString().toLowerCase()
		.replace(/\s+/g, "-").replace(/[^\w-]+/g, "")
		.replace(/--+/g, "-").replace(/^-+/, "").replace(/-+$/, "");
}

function intQuery(c: AppContext, key: string): number | undefined {
	const v = c.req.query(key);
	if (!v) return undefined;
	const n = Number(v);
	return Number.isNaN(n) ? undefined : n;
}

function boolQuery(c: AppContext, key: string): boolean | undefined {
	const v = c.req.query(key);
	if (v === undefined || v === "") return undefined;
	return v === "true" || v === "1";
}

// -- App & middleware -----------------------------------------------

const app = new Hono<MailboxContext>();
app.use("/api/*", cors({
	origin: (origin) => {
		// Same-origin requests have no Origin header — allow them.
		if (!origin) return origin;
		// In development, allow localhost for Vite dev server.
		try {
			const url = new URL(origin);
			if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return origin;
		} catch { /* invalid origin */ }
		// Block all other cross-origin requests. The app is served from the
		// same origin as the API, so legitimate browser requests never send
		// an Origin header. Returning undefined omits Access-Control-Allow-Origin.
		return undefined;
	},
}));
app.use("/api/v1/mailboxes/:mailboxId/*", requireMailbox);

// -- Config ---------------------------------------------------------

app.get("/api/v1/config", async (c) => c.json({ ...(await getManagedConfig(c.env)), aiEnabled: Boolean(c.env.OPENROUTER_API_KEY) }));

// -- AI settings ----------------------------------------------------

app.get("/api/v1/ai/settings", async (c) => c.json({ model: await getModelId(c.env), defaultModel: defaultModel(c.env) }));
app.put("/api/v1/ai/settings", async (c) => {
	const parsed = z.object({ model: z.string().trim().max(200).regex(MODEL_ID_PATTERN).nullable() }).safeParse(await c.req.json());
	if (!parsed.success) return c.json({ error: "Enter a model ID like openai/gpt-4.1-mini" }, 400);
	await saveModelId(c.env, parsed.data.model);
	return c.json({ model: await getModelId(c.env), defaultModel: defaultModel(c.env) });
});
// OpenRouter's model list is public. Cached at the edge for an hour.
app.get("/api/v1/ai/models", async (c) => {
	const response = await fetch("https://openrouter.ai/api/v1/models", { cf: { cacheTtl: 3600, cacheEverything: true } });
	if (!response.ok) return c.json({ error: "Could not load OpenRouter models" }, 502);
	const { data } = await response.json<{ data: { id: string; name: string }[] }>();
	return c.json(data.map(({ id, name }) => ({ id, name })));
});

// -- Push notifications ---------------------------------------------

const PushSubscriptionBody = z.object({
	endpoint: z.string().url().refine(isPushEndpoint, "Unknown push service"),
	keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

// Block cross-site requests that could save an attacker's device as a push target.
app.use("/api/v1/push/subscriptions", async (c, next) => {
	if (c.req.header("sec-fetch-site") !== "same-origin" || !c.req.header("content-type")?.startsWith("application/json")) return c.json({ error: "Forbidden" }, 403);
	return next();
});
app.get("/api/v1/notifications/settings", async (c) => c.json({ ...(await getNotifySettings(c.env)), forwardTo: c.env.FORWARD_TO_EMAIL?.trim() || null }));
app.put("/api/v1/notifications/settings", async (c) => {
	const parsed = z.object({ skipForwarded: z.boolean() }).safeParse(await c.req.json());
	if (!parsed.success) return c.json({ error: "Invalid settings" }, 400);
	await saveNotifySettings(c.env, parsed.data);
	return c.json({ ...parsed.data, forwardTo: c.env.FORWARD_TO_EMAIL?.trim() || null });
});
app.get("/api/v1/push/key", async (c) => c.json({ publicKey: (await getVapidKeys(c.env)).publicKey }));
app.post("/api/v1/push/subscriptions", async (c) => {
	const parsed = PushSubscriptionBody.safeParse(await c.req.json());
	if (!parsed.success) return c.json({ error: "Invalid push subscription" }, 400);
	await saveSubscription(c.env, parsed.data);
	return c.json({ ok: true });
});
app.delete("/api/v1/push/subscriptions", async (c) => {
	const parsed = PushSubscriptionBody.pick({ endpoint: true }).safeParse(await c.req.json());
	if (!parsed.success) return c.json({ error: "Invalid push subscription" }, 400);
	await removeSubscription(c.env, parsed.data.endpoint);
	return c.json({ ok: true });
});

const DomainBody = z.object({ domain: z.string().trim().toLowerCase().regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/) });

app.post("/api/v1/domains", async (c) => {
	const parsed = DomainBody.safeParse(await c.req.json());
	if (!parsed.success) return c.json({ error: "Enter a valid domain name" }, 400);
	const config = await addManagedDomain(c.env, parsed.data.domain);
	return c.json({ config }, 201);
});

app.delete("/api/v1/domains/:domain", async (c) => {
	const domain = c.req.param("domain").toLowerCase();
	if (!(await getManagedConfig(c.env)).domains.includes(domain)) return c.json({ error: "Domain not found" }, 404);
	const mailboxes = await listMailboxes(c.env.BUCKET);
	if (mailboxes.some((mailbox) => mailbox.email.endsWith(`@${domain}`))) return c.json({ error: "Remove this domain’s mailboxes first" }, 409);
	await removeManagedDomain(c.env, domain);
	return c.body(null, 204);
});

app.get("/api/v1/domains/:domain/routing", async (c) => {
	const domain = c.req.param("domain").toLowerCase();
	if (!(await getManagedConfig(c.env)).domains.includes(domain)) return c.json({ error: "Domain not found" }, 404);
	try { return c.json(await inspectRouting(c.env, domain)); }
	catch (error) { return c.json({ error: (error as Error).message }, 502); }
});

app.post("/api/v1/domains/:domain/routing", async (c) => {
	const domain = c.req.param("domain").toLowerCase();
	if (!(await getManagedConfig(c.env)).domains.includes(domain)) return c.json({ error: "Domain not found" }, 404);
	try { return c.json(await enableRouting(c.env, domain)); }
	catch (error) { return c.json({ error: (error as Error).message }, 502); }
});

app.post("/api/v1/domains/:domain/rules", async (c) => {
	const domain = c.req.param("domain").toLowerCase();
	const config = await getManagedConfig(c.env);
	if (!config.domains.includes(domain)) return c.json({ error: "Domain not found" }, 404);
	const addresses = config.emailAddresses.filter((address) => address.endsWith(`@${domain}`));
	try {
		const results: { address: string; routing: "active" | "manual" }[] = [];
		for (const address of addresses) {
			if (!(await c.env.BUCKET.head(`mailboxes/${address}.json`))) continue;
			results.push({ address, routing: await ensureWorkerRule(c.env, address) });
		}
		return c.json({ results });
	} catch (error) { return c.json({ error: (error as Error).message }, 502); }
});

app.get("/api/v1/domains/:domain/catch-all", async (c) => {
	const domain = c.req.param("domain").toLowerCase();
	if (!(await getManagedConfig(c.env)).domains.includes(domain)) return c.json({ error: "Domain not found" }, 404);
	try { return c.json(await inspectCatchAll(c.env, domain)); }
	catch (error) { return c.json({ error: (error as Error).message }, 502); }
});

app.post("/api/v1/domains/:domain/catch-all/disable", async (c) => {
	const domain = c.req.param("domain").toLowerCase();
	if (!(await getManagedConfig(c.env)).domains.includes(domain)) return c.json({ error: "Domain not found" }, 404);
	try { return c.json(await disableCatchAll(c.env, domain)); }
	catch (error) { return c.json({ error: (error as Error).message }, 502); }
});

// -- Mailboxes ------------------------------------------------------

app.get("/api/v1/mailboxes", async (c) => {
	const allMailboxes = await listMailboxes(c.env.BUCKET);
	const states = await Promise.all(allMailboxes.map(async (mailbox) => ({
		retired: await isRetiredAddress(c.env, mailbox.id),
		operation: await getMailboxOperation(c.env, mailbox.id),
	})));
	return c.json(allMailboxes.map((mailbox, index) => ({ ...mailbox, name: mailbox.id, ...states[index] })));
});

app.post("/api/v1/mailboxes", async (c) => {
	const { name, settings, email: rawEmail } = CreateMailboxBody.parse(await c.req.json());
	const email = rawEmail.toLowerCase();
	const config = await getManagedConfig(c.env);
	if (!config.domains.includes(email.split("@")[1])) return c.json({ error: "Add this domain first" }, 400);
	const key = `mailboxes/${email}.json`;
	if (await c.env.BUCKET.head(key)) return c.json({ error: "Mailbox already exists" }, 409);
	let routing: "active" | "manual";
	try { routing = await ensureWorkerRule(c.env, email); }
	catch (error) { return c.json({ error: (error as Error).message }, 502); }
	const defaultSettings = { fromName: name, agentEnabled: true, autoDraftEnabled: false, forwarding: { enabled: false, email: "" }, signature: { enabled: false, text: "" }, autoReply: { enabled: false, subject: "", message: "" } };
	const finalSettings = { ...defaultSettings, ...settings };
	await addManagedAddress(c.env, email);
	await c.env.BUCKET.put(key, JSON.stringify(finalSettings));
	const stub = c.env.MAILBOX.get(c.env.MAILBOX.idFromName(email));
	await stub.getFolders();
	return c.json({ id: email, email, name, settings: finalSettings, routing }, 201);
});

app.get("/api/v1/mailboxes/:mailboxId", async (c) => {
	const mailboxId = c.req.param("mailboxId")!;
	const obj = await c.env.BUCKET.get(`mailboxes/${mailboxId}.json`);
	if (!obj) return c.json({ error: "Not found" }, 404);
	return c.json({ id: mailboxId, name: mailboxId, email: mailboxId, settings: await obj.json() });
});

app.put("/api/v1/mailboxes/:mailboxId", async (c) => {
	const mailboxId = c.req.param("mailboxId")!;
	const { settings } = (await c.req.json()) as { settings: Record<string, unknown> };
	const key = `mailboxes/${mailboxId}.json`;
	if (!(await c.env.BUCKET.head(key))) return c.json({ error: "Not found" }, 404);
	await c.env.BUCKET.put(key, JSON.stringify(settings));
	return c.json({ id: mailboxId, name: mailboxId, email: mailboxId, settings });
});

app.get("/api/v1/mailboxes/:mailboxId/trusted-senders", async (c: AppContext) => {
	return c.json({ senders: await c.var.mailboxStub.getTrustedSenders() });
});

app.delete("/api/v1/mailboxes/:mailboxId/trusted-senders/:address", async (c: AppContext) => {
	const removed = await c.var.mailboxStub.removeTrustedSender(c.req.param("address")!);
	return removed ? c.body(null, 204) : c.json({ error: "Trusted sender not found" }, 404);
});

app.delete("/api/v1/mailboxes/:mailboxId", async (c) => {
	return c.json({ error: "Choose move or export from the mailbox management screen before deleting" }, 400);
});

app.post("/api/v1/mailboxes/:mailboxId/retire", async (c) => {
	const mailboxId = c.req.param("mailboxId")!.toLowerCase();
	if (!(await c.env.BUCKET.head(`mailboxes/${mailboxId}.json`))) return c.json({ error: "Mailbox not found" }, 404);
	const operation = z.discriminatedUnion("mode", [
		z.object({ mode: z.literal("export") }),
		z.object({ mode: z.literal("move"), target: z.string().email() }),
	]).safeParse(await c.req.json());
	if (!operation.success) return c.json({ error: "Choose move or export" }, 400);
	const requested = operation.data.mode === "move" ? { mode: "move" as const, target: operation.data.target.toLowerCase() } : { mode: "export" as const };
	if (requested.mode === "move" && (requested.target === mailboxId || !(await c.env.BUCKET.head(`mailboxes/${requested.target}.json`)) || await isRetiredAddress(c.env, requested.target))) {
		return c.json({ error: "Choose a different active target mailbox" }, 400);
	}
	const existing = await getMailboxOperation(c.env, mailboxId);
	if (existing && JSON.stringify(existing) !== JSON.stringify(requested)) return c.json({ error: "Finish the existing mailbox move or export first" }, 409);
	try {
		const ruleCleanup = await removeWorkerRule(c.env, mailboxId);
		if (!(await isRetiredAddress(c.env, mailboxId))) await c.env.BUCKET.delete(`config/completed-exports/${mailboxId}.json`);
		await saveMailboxOperation(c.env, mailboxId, requested);
		await retireManagedAddress(c.env, mailboxId);
		return c.json({ retired: true, ruleCleanup });
	} catch (error) { return c.json({ error: (error as Error).message }, 502); }
});

app.get("/api/v1/mailboxes/:mailboxId/export", async (c) => {
	const mailboxId = c.req.param("mailboxId")!.toLowerCase();
	if (!(await isRetiredAddress(c.env, mailboxId))) return c.json({ error: "Retire this mailbox before exporting it" }, 409);
	if ((await getMailboxOperation(c.env, mailboxId))?.mode !== "export") return c.json({ error: "This mailbox has a move in progress" }, 409);
	const object = await c.env.BUCKET.get(`mailboxes/${mailboxId}.json`);
	if (!object) return c.json({ error: "Mailbox not found" }, 404);
	return new Response(mailboxArchive(c.env, mailboxId, await object.json()), {
		headers: {
			"Content-Type": "application/x-tar",
			"Content-Disposition": `attachment; filename="flarebox-${mailboxId.replace(/[^a-z0-9@.-]/g, "_")}.tar"`,
			"Cache-Control": "no-store",
		},
	});
});

const MoveMailboxBody = z.object({ target: z.string().email(), cursor: z.string().optional() });

app.post("/api/v1/mailboxes/:mailboxId/move", async (c) => {
	const mailboxId = c.req.param("mailboxId")!.toLowerCase();
	const parsed = MoveMailboxBody.safeParse(await c.req.json());
	if (!parsed.success) return c.json({ error: "Choose a valid target mailbox" }, 400);
	const targetId = parsed.data.target.toLowerCase();
	if (targetId === mailboxId) return c.json({ error: "Choose a different target mailbox" }, 400);
	if (!(await c.env.BUCKET.head(`mailboxes/${targetId}.json`)) || await isRetiredAddress(c.env, targetId)) return c.json({ error: "Target mailbox is not active" }, 400);
	const operation = await getMailboxOperation(c.env, mailboxId);
	if (!operation || operation.mode !== "move" || operation.target !== targetId || !(await isRetiredAddress(c.env, mailboxId))) {
		return c.json({ error: "Start or resume this move from mailbox management" }, 409);
	}
	const source = c.env.MAILBOX.get(c.env.MAILBOX.idFromName(mailboxId));
	const target = c.env.MAILBOX.get(c.env.MAILBOX.idFromName(targetId));
	try {
		const sourceFolders = await source.getFolders();
		const targetFolders = await target.getFolders();
		const folderMap = new Map<string, string>();
		for (const folder of sourceFolders) {
			let destination = targetFolders.find((item) => item.name === folder.name);
			if (!destination) {
				const created = await target.createFolder(crypto.randomUUID(), folder.name);
				if (!created) throw new Error(`Could not create target folder ${folder.name}`);
				destination = created;
				targetFolders.push(created);
			}
			folderMap.set(folder.id, destination.id);
		}
		const emails = await source.getExportPage(parsed.data.cursor ?? "", 10);
		for (const email of emails) {
			const existing = await target.getEmail(email.id);
			if (existing) {
				if (existing.message_id !== email.message_id || existing.sender !== email.sender || existing.date !== email.date || existing.subject !== email.subject) throw new Error(`Message ID collision for ${email.id}`);
				continue;
			}
			const folder = folderMap.get(email.folder_id);
			if (!folder) throw new Error(`Missing target folder for message ${email.id}`);
			await target.createEmail(folder, {
				...email,
				subject: email.subject ?? "",
				sender: email.sender ?? "",
				recipient: email.recipient ?? "",
				date: email.date ?? "",
				body: email.body ?? "",
			}, email.attachments);
		}
		if (emails.length < 10) {
			await source.purgeMailboxData(false);
			await c.env.BUCKET.delete(`mailboxes/${mailboxId}.json`);
			await clearMailboxOperation(c.env, mailboxId);
			return c.json({ done: true, copied: emails.length });
		}
		return c.json({ done: false, cursor: emails[emails.length - 1].id, copied: emails.length });
	} catch (error) { return c.json({ error: (error as Error).message }, 502); }
});

app.post("/api/v1/mailboxes/:mailboxId/finalize-delete", async (c) => {
	const mailboxId = c.req.param("mailboxId")!.toLowerCase();
	if (!(await isRetiredAddress(c.env, mailboxId))) return c.json({ error: "Retire and export this mailbox first" }, 409);
	if (!(await c.env.BUCKET.head(`mailboxes/${mailboxId}.json`))) return c.json({ error: "Mailbox not found" }, 404);
	if ((await getMailboxOperation(c.env, mailboxId))?.mode !== "export") return c.json({ error: "This mailbox has a move in progress" }, 409);
	if (!(await c.env.BUCKET.head(`config/completed-exports/${mailboxId}.json`))) return c.json({ error: "Download the complete export before deleting this mailbox" }, 409);
	try {
		const stub = c.env.MAILBOX.get(c.env.MAILBOX.idFromName(mailboxId));
		await stub.purgeMailboxData(true);
		await c.env.BUCKET.delete(`mailboxes/${mailboxId}.json`);
		await c.env.BUCKET.delete(`config/completed-exports/${mailboxId}.json`);
		await clearMailboxOperation(c.env, mailboxId);
		return c.body(null, 204);
	} catch (error) { return c.json({ error: (error as Error).message }, 502); }
});

// -- Emails ---------------------------------------------------------

app.post("/api/v1/mailboxes/:mailboxId/emails/bulk", async (c: AppContext) => {
	const parsed = BulkEmailBody.safeParse(await c.req.json());
	if (!parsed.success || !parsed.data.ids) return c.json({ error: "Select up to 100 messages" }, 400);
	const { count, attachments } = await c.var.mailboxStub.bulkEmails(parsed.data.action, parsed.data.folder, parsed.data.ids, parsed.data.expandThreads);
	for (let i = 0; i < attachments.length; i += 1000) await c.env.BUCKET.delete(attachments.slice(i, i + 1000));
	return c.json({ count });
});

app.post("/api/v1/mailboxes/:mailboxId/junk/empty", async (c: AppContext) => {
	const { count, attachments } = await c.var.mailboxStub.bulkEmails("purge", Folders.SPAM, "all");
	for (let i = 0; i < attachments.length; i += 1000) await c.env.BUCKET.delete(attachments.slice(i, i + 1000));
	return c.json({ count });
});

app.get("/api/v1/mailboxes/:mailboxId/emails", async (c: AppContext) => {
	const folder = c.req.query("folder");
	const thread_id = c.req.query("thread_id");
	const threaded = boolQuery(c, "threaded");
	const page = intQuery(c, "page");
	const limit = intQuery(c, "limit");
	const sortColumn = c.req.query("sortColumn") as any;
	const sortDirection = c.req.query("sortDirection") as "ASC" | "DESC" | undefined;
	const stub = c.var.mailboxStub;
	if (folder === "activity") {
		const emails = await stub.getEmails({ page, limit, sortColumn, sortDirection });
		return c.json({ emails, totalCount: await stub.countEmails() });
	}

	if (threaded && folder) {
		const emails = await (stub as any).getThreadedEmails({ folder, page, limit });
		const totalCount = await (stub as any).countThreadedEmails(folder);
		return c.json({ emails, totalCount });
	}
	const emails = await stub.getEmails({ folder, thread_id, page, limit, sortColumn, sortDirection });
	if (folder) {
		const totalCount = await stub.countEmails({ folder, thread_id });
		return c.json({ emails, totalCount });
	}
	return c.json(emails);
});

app.post("/api/v1/mailboxes/:mailboxId/emails", async (c: AppContext) => {
	const mailboxId = c.req.param("mailboxId")!;
	const body = SendEmailRequestSchema.parse(await c.req.json());
	const { to, cc, bcc, from, subject, html, text, attachments, in_reply_to, references, thread_id } = body;

	let toStr: string, fromEmail: string, fromDomain: string;
	try {
		({ toStr, fromEmail, fromDomain } = validateSender(to, from, mailboxId));
	} catch (e) {
		if (e instanceof SenderValidationError) return c.json({ error: e.message }, 400);
		throw e;
	}

	const { messageId, outgoingMessageId } = generateMessageId(fromDomain);
	const stub = c.var.mailboxStub;
	const rateLimitError = await (stub as any).checkSendRateLimit();
	if (rateLimitError) return c.json({ error: rateLimitError }, 429);
	const attachmentData = await storeAttachments(c.env.BUCKET, messageId, attachments);

	await stub.createEmail(Folders.SENT, {
		id: messageId, subject, sender: fromEmail, recipient: toStr,
		cc: cc ? (Array.isArray(cc) ? cc.join(", ") : cc).toLowerCase() : null,
		bcc: bcc ? (Array.isArray(bcc) ? bcc.join(", ") : bcc).toLowerCase() : null,
		date: new Date().toISOString(), body: html || text || "",
		in_reply_to: in_reply_to || null, email_references: references ? JSON.stringify(references) : null,
		thread_id: thread_id || in_reply_to || messageId, message_id: outgoingMessageId,
		raw_headers: JSON.stringify([
			{ key: "from", value: typeof from === "string" ? from : `${from.name} <${from.email}>` },
			{ key: "to", value: Array.isArray(to) ? to.join(", ") : to },
			...(cc ? [{ key: "cc", value: Array.isArray(cc) ? cc.join(", ") : cc }] : []),
			...(bcc ? [{ key: "bcc", value: Array.isArray(bcc) ? bcc.join(", ") : bcc }] : []),
			{ key: "subject", value: subject }, { key: "date", value: new Date().toISOString() },
			{ key: "message-id", value: `<${outgoingMessageId}>` },
		]),
	}, attachmentData);

	c.executionCtx.waitUntil(
		sendEmail(c.env.EMAIL, {
			to, cc, bcc, from, subject, html, text,
			attachments: attachments?.map((att) => ({ content: att.content, filename: att.filename, type: att.type, disposition: att.disposition || "attachment", contentId: att.contentId })),
			...(in_reply_to ? { headers: buildThreadingHeaders(in_reply_to, references || []) } : {}),
		}).catch((e) => console.error("Deferred email delivery failed:", (e as Error).message)),
	);
	return c.json({ id: messageId, status: "sent" }, 202);
});

app.post("/api/v1/mailboxes/:mailboxId/drafts", async (c: AppContext) => {
	const mailboxId = c.req.param("mailboxId")!;
	const { to, cc, bcc, subject, body, in_reply_to, thread_id, draft_id } = DraftBody.parse(await c.req.json());
	const stub = c.var.mailboxStub;
	if (draft_id) await stub.deleteEmail(draft_id); // not atomic — create-then-delete would be safer
	const messageId = crypto.randomUUID();
	const now = new Date().toISOString();
	await stub.createEmail(Folders.DRAFT, {
		id: messageId, subject: subject || "", sender: mailboxId.toLowerCase(),
		recipient: (to || "").toLowerCase(), cc: cc?.toLowerCase() || null, bcc: bcc?.toLowerCase() || null,
		date: now, body, in_reply_to: in_reply_to || null, email_references: null,
		thread_id: thread_id || in_reply_to || messageId,
	}, []);
	return c.json({ id: messageId, status: "draft", subject: subject || "", recipient: to || "", date: now }, 201);
});

app.get("/api/v1/mailboxes/:mailboxId/emails/:id", async (c: AppContext) => {
	const email = await c.var.mailboxStub.getEmail(c.req.param("id")!);
	if (!email) return c.json({ error: "Email not found" }, 404);
	return new Response(JSON.stringify(email), {
		headers: { "Content-Type": "application/json" },
	});
});

app.put("/api/v1/mailboxes/:mailboxId/emails/:id", async (c: AppContext) => {
	const { read, starred } = (await c.req.json()) as { read?: boolean; starred?: boolean };
	const email = await c.var.mailboxStub.updateEmail(c.req.param("id")!, { read, starred });
	return email ? c.json(email) : c.json({ error: "Email not found" }, 404);
});

app.delete("/api/v1/mailboxes/:mailboxId/emails/:id", async (c: AppContext) => {
	const id = c.req.param("id")!;
	const attachments = await c.var.mailboxStub.deleteEmail(id);
	if (attachments === null) return c.json({ error: "Not found" }, 404);
	if (attachments.length > 0) await c.env.BUCKET.delete(attachments.map((att: any) => `attachments/${id}/${att.id}/${att.filename}`));
	return c.body(null, 204);
});

app.post("/api/v1/mailboxes/:mailboxId/emails/:id/move", async (c: AppContext) => {
	const { folderId } = (await c.req.json()) as { folderId: string };
	const success = await c.var.mailboxStub.moveEmail(c.req.param("id")!, folderId);
	return success ? c.json({ status: "moved" }) : c.json({ error: "Folder not found" }, 400);
});

app.post("/api/v1/mailboxes/:mailboxId/emails/:id/spam", async (c: AppContext) => {
	const id = c.req.param("id")!;
	const email = await c.var.mailboxStub.getEmail(id);
	if (!email) return c.json({ error: "Email not found" }, 404);
	const domain = senderDomain(email.sender || "");
	if (!domain) return c.json({ error: "Email has no valid sender domain" }, 400);
	await c.env.BUCKET.put(domainBlockKey(domain), JSON.stringify({ domain }));
	await c.var.mailboxStub.moveEmail(id, Folders.SPAM);
	return c.json({ status: "moved", domain });
});

const AiWriteBody = z.object({
	instructions: z.string().trim().min(1).max(4000),
	mode: z.enum(["new", "reply", "reply-all", "forward"]),
	emailId: z.string().optional(),
	to: z.string().max(2000).optional(),
	subject: z.string().max(500).optional(),
	fromName: z.string().max(200).optional(),
});

app.post("/api/v1/mailboxes/:mailboxId/ai/write", async (c: AppContext) => {
	if (!c.env.OPENROUTER_API_KEY) return c.json({ error: "AI is not set up" }, 503);
	const parsed = AiWriteBody.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: "Tell the assistant what to write" }, 400);
	const { emailId, ...input } = parsed.data;
	const original = emailId ? await c.var.mailboxStub.getEmail(emailId) : null;
	const settings = await (await c.env.BUCKET.get(`mailboxes/${c.req.param("mailboxId")}.json`))?.json<{ agentSystemPrompt?: string }>();
	try {
		return c.json(await writeEmail(c.env, { ...input, mailboxInstructions: settings?.agentSystemPrompt, original: original && { sender: original.sender || "", subject: original.subject || "", body: original.body || "" } }));
	} catch (e) {
		console.error("AI write failed:", (e as Error).message);
		return c.json({ error: "The assistant could not write this email. Try again." }, 502);
	}
});

app.post("/api/v1/mailboxes/:mailboxId/emails/:id/not-spam", async (c: AppContext) => {
	const result = await c.var.mailboxStub.markNotSpam(c.req.param("id")!);
	if ("error" in result) {
		if (result.error === "not_found") return c.json({ error: "Email not found" }, 404);
		if (result.error === "not_junk") return c.json({ error: "Only Junk messages can be marked as not spam" }, 409);
		return c.json({ error: "Email has no valid sender address" }, 400);
	}
	const domain = senderDomain(result.sender);
	if (domain) await c.env.BUCKET.delete(domainBlockKey(domain));
	return c.json(result);
});

// -- Threads --------------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/threads/:threadId", async (c: AppContext) => {
	return c.json(await (c.var.mailboxStub as any).getThreadEmails(c.req.param("threadId")!));
});

app.post("/api/v1/mailboxes/:mailboxId/threads/:threadId/read", async (c: AppContext) => {
	await c.var.mailboxStub.markThreadRead(c.req.param("threadId")!);
	return c.json({ status: "marked_read" });
});

// -- Reply / Forward ------------------------------------------------

app.post("/api/v1/mailboxes/:mailboxId/emails/:id/reply", handleReplyEmail);
app.post("/api/v1/mailboxes/:mailboxId/emails/:id/forward", handleForwardEmail);

// -- Folders --------------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/folders", async (c: AppContext) => c.json(await c.var.mailboxStub.getFolders()));

app.post("/api/v1/mailboxes/:mailboxId/folders", async (c: AppContext) => {
	const { name } = (await c.req.json()) as { name: string };
	const slug = slugify(name);
	if (!slug) return c.json({ error: "Folder name must contain alphanumeric characters" }, 400);
	const f = await c.var.mailboxStub.createFolder(slug, name);
	return f ? c.json(f, 201) : c.json({ error: "Folder with this name already exists" }, 409);
});

app.put("/api/v1/mailboxes/:mailboxId/folders/:id", async (c: AppContext) => {
	const { name } = (await c.req.json()) as { name: string };
	const f = await c.var.mailboxStub.updateFolder(c.req.param("id")!, name);
	return f ? c.json(f) : c.json({ error: "Folder not found" }, 404);
});

app.delete("/api/v1/mailboxes/:mailboxId/folders/:id", async (c: AppContext) => {
	const ok = await c.var.mailboxStub.deleteFolder(c.req.param("id")!);
	return ok ? c.body(null, 204) : c.json({ error: "Folder not found or cannot be deleted" }, 400);
});

// -- Search ---------------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/search", async (c: AppContext) => {
	const searchOpts: Record<string, unknown> = {
		query: c.req.query("query") || "", folder: c.req.query("folder"), from: c.req.query("from"),
		to: c.req.query("to"), subject: c.req.query("subject"), filename: c.req.query("filename"), date_start: c.req.query("date_start"),
		date_end: c.req.query("date_end"), is_read: boolQuery(c, "is_read"),
		is_starred: boolQuery(c, "is_starred"), has_attachment: boolQuery(c, "has_attachment"),
	};
	const stub = c.var.mailboxStub as any;
	const emails = await stub.searchEmails({ ...searchOpts, sort: c.req.query("sort"), page: intQuery(c, "page"), limit: intQuery(c, "limit") });
	const totalCount = await stub.countSearchResults(searchOpts);
	return c.json({ emails, totalCount });
});

// -- Attachments ----------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/emails/:emailId/attachments/:attachmentId", async (c: AppContext) => {
	const emailId = c.req.param("emailId")!;
	const attachmentId = c.req.param("attachmentId")!;
	const attachment = await c.var.mailboxStub.getAttachment(attachmentId);
	if (!attachment) return c.json({ error: "Attachment not found" }, 404);
	const obj = await c.env.BUCKET.get(`attachments/${emailId}/${attachmentId}/${attachment.filename}`);
	if (!obj) return c.json({ error: "Attachment file not found" }, 404);
	const headers = new Headers();
	headers.set("Content-Type", attachment.mimetype);
	const sanitized = attachment.filename.replace(/[\x00-\x1f"\\]/g, "_");
	headers.set("Content-Disposition", `attachment; filename="${sanitized}"; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`);
	return new Response(obj.body, { headers });
});

// -- Receive inbound email ------------------------------------------

const MAX_EMAIL_SIZE = 25 * 1024 * 1024;

async function streamToArrayBuffer(stream: ReadableStream, streamSize: number) {
	if (streamSize > MAX_EMAIL_SIZE) throw new Error(`Email too large: ${streamSize} bytes exceeds ${MAX_EMAIL_SIZE} byte limit`);
	if (streamSize <= 0) throw new Error(`Invalid stream size: ${streamSize}`);
	const result = new Uint8Array(streamSize);
	let bytesRead = 0;
	const reader = stream.getReader();
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (bytesRead + value.length > streamSize) { reader.cancel(); throw new Error(`Stream exceeds declared size`); }
		result.set(value, bytesRead);
		bytesRead += value.length;
	}
	return result;
}

async function receiveEmail(event: { raw: ReadableStream; rawSize: number; to?: string; from?: string }, env: Env, ctx: ExecutionContext): Promise<{ mailboxId: string; emailId: string; spam: boolean; sender: string; subject: string } | undefined> {
	const rawEmail = await streamToArrayBuffer(event.raw, event.rawSize);
	const parsedEmail = await new PostalMime().parse(rawEmail);

	const allowedAddresses = (await getManagedConfig(env)).emailAddresses;
	const envelopeRecipient = event.to?.trim().toLowerCase();
	const allRecipients = (parsedEmail.to || []).map((t) => t.address?.toLowerCase()).filter(Boolean) as string[];
	const ccRecipients = (parsedEmail.cc || []).map((e) => e.address?.toLowerCase()).filter(Boolean) as string[];
	const bccRecipients = (parsedEmail.bcc || []).map((e) => e.address?.toLowerCase()).filter(Boolean) as string[];

	let mailboxId: string | undefined;
	mailboxId = envelopeRecipient && allowedAddresses.includes(envelopeRecipient)
		? envelopeRecipient
		: undefined;
	if (!mailboxId && envelopeRecipient) {
		const domain = envelopeRecipient.split("@")[1];
		const catchAll = env.CATCH_ALL_MAILBOXES?.[domain]?.toLowerCase();
		if (catchAll && allowedAddresses.includes(catchAll)) mailboxId = catchAll;
	}
	if (!mailboxId && !envelopeRecipient) {
		mailboxId = allRecipients.find((addr) => allowedAddresses.includes(addr));
	}
	if (!mailboxId) { console.log("Ignoring email: recipient is not configured."); return; }
	if (!mailboxId) throw new Error("received email with no valid recipient address");

	const messageId = crypto.randomUUID();
	const mailboxSettingsObject = await env.BUCKET.get(`mailboxes/${mailboxId}.json`);
	if (!mailboxSettingsObject) { console.log(`Ignoring email for ${mailboxId}: mailbox does not exist`); return; }
	const settings = await mailboxSettingsObject.json<{ agentEnabled?: boolean; autoDraftEnabled?: boolean; spamFiltering?: SpamSettings }>();
	const stub = env.MAILBOX.get(env.MAILBOX.idFromName(mailboxId));
	const domain = senderDomain(parsedEmail.from?.address || "");
	const blockedDomain = !!(domain && await env.BUCKET.head(domainBlockKey(domain)));
	let classification = blockedDomain
		? { spam: true, score: 100, reasons: ["Blocked sender domain"] }
		: classifySpam(parsedEmail, settings.spamFiltering);
	let rspamdAction: RspamdAction | undefined;
	let rspamdSymbols: string[] | undefined;
	let scannerUnavailable = false;
	if (env.RSPAMD_CHECK_URL && settings.spamFiltering?.enabled !== false && classification.score !== 100) {
		try {
			const verdict = await scanWithRspamd(rawEmail, { from: event.from, recipient: mailboxId }, env);
			rspamdAction = verdict.action;
			rspamdSymbols = verdict.symbolNames;
			console.info("Rspamd verdict", JSON.stringify({ messageId, action: verdict.action, score: verdict.score, symbols: verdict.symbols }));
			classification = { spam: verdict.action !== "no action", score: verdict.score, reasons: [`Rspamd: ${verdict.action}`] };
		} catch (error) {
			scannerUnavailable = true;
			console.error("Rspamd scan unavailable; holding message in Junk:", messageId, error instanceof Error ? error.message : "Unknown error");
			classification = { spam: true, score: 0, reasons: ["Rspamd unavailable"] };
		}
	}
	const sender = parsedEmail.from?.address || "";
	if (!blockedDomain && classification.spam && canTrustedSenderOverride(rspamdAction, scannerUnavailable) && sender
		&& isAuthenticatedSender({ headerFrom: sender, envelopeFrom: event.from, rspamdSymbols })
		&& await stub.isTrustedSender(sender)) {
		classification = { spam: false, score: classification.score, reasons: ["Trusted sender"] };
	}

	const attachmentData: StoredAttachment[] = [];
	if (parsedEmail.attachments) {
		for (const att of parsedEmail.attachments) {
			const attId = crypto.randomUUID();
			const filename = (att.filename || "untitled").replace(/[\/\\:*?"<>|\x00-\x1f]/g, "_");
			await env.BUCKET.put(`attachments/${messageId}/${attId}/${filename}`, att.content);
			attachmentData.push({ id: attId, email_id: messageId, filename, mimetype: att.mimeType,
				size: typeof att.content === "string" ? att.content.length : att.content.byteLength,
				content_id: att.contentId || null, disposition: att.disposition || "attachment" });
		}
	}

	const extractMsgId = (s: string) => { const m = s.match(/<([^>]+)>/); return m ? m[1] : s.trim().split(/\s+/)[0]; };
	const inReplyTo = parsedEmail.inReplyTo ? extractMsgId(parsedEmail.inReplyTo) : null;
	const emailReferences = parsedEmail.references ? parsedEmail.references.split(/\s+/).filter(Boolean).map(extractMsgId) : [];
	let threadId = emailReferences[0] || inReplyTo || messageId;

	if (!inReplyTo && emailReferences.length === 0) {
		const subjectThread = await (stub as any).findThreadBySubject(parsedEmail.subject || "", parsedEmail.from?.address || undefined);
		if (subjectThread) threadId = subjectThread;
	}

	const originalMessageId = parsedEmail.messageId ? extractMsgId(parsedEmail.messageId) : null;

	await stub.createEmail(classification.spam ? Folders.SPAM : Folders.INBOX, {
		id: messageId, subject: parsedEmail.subject || "",
		sender: (parsedEmail.from?.address || "").toLowerCase(), recipient: allRecipients.join(", ") || envelopeRecipient || mailboxId,
		cc: ccRecipients.join(", ") || null, bcc: bccRecipients.join(", ") || null,
		date: new Date().toISOString(), // uses receive time, not the email's Date header
		body: parsedEmail.html || parsedEmail.text || "",
		in_reply_to: inReplyTo, email_references: emailReferences.length > 0 ? JSON.stringify(emailReferences) : null,
		thread_id: threadId, message_id: originalMessageId, raw_headers: JSON.stringify(parsedEmail.headers),
	}, attachmentData);

	if (!classification.spam && env.OPENROUTER_API_KEY && settings.agentEnabled !== false && settings.autoDraftEnabled === true) {
		const agentStub = env.EMAIL_AGENT.get(env.EMAIL_AGENT.idFromName(mailboxId));
		ctx.waitUntil(agentStub.fetch(new Request("https://agents/onNewEmail", {
			method: "POST", headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ mailboxId, emailId: messageId, sender: (parsedEmail.from?.address || "").toLowerCase(), subject: parsedEmail.subject || "", threadId }),
		})).catch((e) => console.error("Auto-draft trigger failed:", (e as Error).message)));
	}
	// The push notification is sent by the email handler after forwarding, which may skip it.
	return { mailboxId, emailId: messageId, spam: classification.spam, sender: parsedEmail.from?.name || sender, subject: parsedEmail.subject || "" };
}

export { app, receiveEmail };
