import PostalMime from "postal-mime";
import type { MailboxDO } from "../durableObject";
import type { Env } from "../types";
import { mapGmailLabels, parseGmailLabels } from "../../shared/mbox";
import type { StoredAttachment } from "./attachments";

export const IMPORT_MAX_MESSAGES = 50;
export const IMPORT_MAX_BYTES = 40 * 1024 * 1024;

const extractMsgId = (s: string) => { const m = s.match(/<([^>]+)>/); return m ? m[1] : s.trim().split(/\s+/)[0]; };

/**
 * Stores one raw message from a Gmail Takeout mbox. Unlike receiveEmail it
 * keeps the Date header and skips spam scoring, auto-drafts, and push.
 * The ID is a hash of the raw bytes, so a re-run finds the same message.
 */
export async function importMessage(env: Env, stub: DurableObjectStub<MailboxDO>, mailboxId: string, raw: Uint8Array<ArrayBuffer>): Promise<"imported" | "skipped"> {
	const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", raw));
	const id = `import-${[...hash.subarray(0, 16)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
	const parsed = await new PostalMime().parse(raw);
	const labels = parseGmailLabels(parsed.headers.find((header) => header.key === "x-gmail-labels")?.value ?? "");
	const { folder, read, starred } = mapGmailLabels(labels);
	const messageId = parsed.messageId ? extractMsgId(parsed.messageId) : null;
	const sender = (parsed.from?.address || "").toLowerCase();
	if (!folder || await stub.hasEmail(id, messageId, sender)) return "skipped";

	const attachments: StoredAttachment[] = [];
	for (const [index, att] of (parsed.attachments ?? []).entries()) {
		const attId = `${id}-${index}`;
		const filename = (att.filename || "untitled").replace(/[\/\\:*?"<>|\x00-\x1f]/g, "_");
		await env.BUCKET.put(`attachments/${id}/${attId}/${filename}`, att.content);
		attachments.push({ id: attId, email_id: id, filename, mimetype: att.mimeType,
			size: typeof att.content === "string" ? att.content.length : att.content.byteLength,
			content_id: att.contentId || null, disposition: att.disposition || "attachment" });
	}

	const inReplyTo = parsed.inReplyTo ? extractMsgId(parsed.inReplyTo) : null;
	const references = parsed.references ? parsed.references.split(/\s+/).filter(Boolean).map(extractMsgId) : [];
	let threadId = references[0] || inReplyTo || messageId || id;
	// Same rule as receiveEmail: reply headers come from the sender, so only join a conversation they are part of.
	// A forged Message-ID could also match a real thread, so the message's own Message-ID is checked too.
	if (threadId !== id && !(await stub.canJoinThread(threadId, sender))) threadId = id;
	const date = parsed.date ? new Date(parsed.date) : null;
	const addresses = (list?: { address?: string }[]) => (list ?? []).map((item) => item.address?.toLowerCase()).filter(Boolean).join(", ");
	await stub.createEmail(folder, {
		id, subject: parsed.subject || "",
		sender, recipient: addresses(parsed.to) || mailboxId,
		cc: addresses(parsed.cc) || null, bcc: addresses(parsed.bcc) || null,
		// ponytail: no Date header falls back to now; the mbox "From " line date is the upgrade.
		date: date && !Number.isNaN(date.getTime()) ? date.toISOString() : new Date().toISOString(),
		body: parsed.html || parsed.text || "", read, starred,
		in_reply_to: inReplyTo, email_references: references.length ? JSON.stringify(references) : null,
		thread_id: threadId, message_id: messageId,
		raw_headers: JSON.stringify(parsed.headers),
	}, attachments);
	return "imported";
}
