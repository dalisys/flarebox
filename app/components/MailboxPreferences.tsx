// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Button, Input, Loader, Switch, useKumoToastManager } from "@cloudflare/kumo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useState } from "react";
import { useParams } from "react-router";
import { useAiEnabled, useMailbox, useUpdateMailbox } from "~/queries/mailboxes";
import api from "~/services/api";
import type { Mailbox } from "~/types";

// These instructions are added after the built-in prompt in workers/agent/index.ts.
const PROMPT_PLACEHOLDER = `Example:\nI am Sam, founder of Acme. Sign emails as "Sam".\nReply in the sender's language. Keep replies under 120 words.\nFor pricing questions, link to https://acme.com/pricing.`;

const fieldClass = "mt-1.5 block w-full rounded-md border border-kumo-line bg-kumo-base px-3 py-2 text-sm text-kumo-default placeholder:text-kumo-subtle focus:outline-none focus:ring-1 focus:ring-kumo-ring disabled:opacity-50";

const formFromMailbox = (mailbox: Mailbox) => ({
	displayName: mailbox.settings?.fromName || mailbox.name || "",
	agentEnabled: mailbox.settings?.agentEnabled !== false,
	autoDraftEnabled: mailbox.settings?.autoDraftEnabled === true,
	agentPrompt: mailbox.settings?.agentSystemPrompt || "",
	spamEnabled: mailbox.settings?.spamFiltering?.enabled !== false,
	spamThreshold: mailbox.settings?.spamFiltering?.threshold ?? 5,
	spamBlocklist: (mailbox.settings?.spamFiltering?.blocklist ?? []).join("\n"),
	signatureEnabled: mailbox.settings?.signature?.enabled === true,
	signatureText: mailbox.settings?.signature?.text || "",
	autoReplyEnabled: mailbox.settings?.autoReply?.enabled === true,
	autoReplySubject: mailbox.settings?.autoReply?.subject || "",
	autoReplyMessage: mailbox.settings?.autoReply?.message || "",
});

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
	return <section className="rounded-lg border border-kumo-line bg-kumo-base">
		<div className="border-b border-kumo-line px-5 py-4"><h3 className="text-sm font-semibold text-kumo-default">{title}</h3><p className="mt-0.5 text-xs text-kumo-subtle">{description}</p></div>
		<div className="divide-y divide-kumo-line">{children}</div>
	</section>;
}

function Row({ label, description, children }: { label: string; description?: ReactNode; children: ReactNode }) {
	return <div className="flex items-center justify-between gap-6 px-5 py-4">
		<div className="min-w-0"><p className="text-sm text-kumo-default">{label}</p>{description && <p className="mt-0.5 text-xs text-kumo-subtle">{description}</p>}</div>
		<div className="shrink-0">{children}</div>
	</div>;
}

export default function MailboxPreferences({ mailboxIdOverride, embedded = false }: { mailboxIdOverride?: string; embedded?: boolean } = {}) {
	const { mailboxId: routeMailboxId } = useParams<{ mailboxId: string }>();
	const mailboxId = mailboxIdOverride ?? routeMailboxId;
	const toastManager = useKumoToastManager();
	const { data: mailbox, isError: mailboxError, refetch: retryMailbox } = useMailbox(mailboxId, { retry: false, timeoutMs: 10_000 });
	const aiEnabled = useAiEnabled();
	const updateMailboxMutation = useUpdateMailbox();
	const queryClient = useQueryClient();
	const { data: trustedSenders = [], isError: trustedSendersError, refetch: retryTrustedSenders } = useQuery({
		queryKey: ["trusted-senders", mailboxId],
		queryFn: async ({ signal }) => (await api.getTrustedSenders(mailboxId!, AbortSignal.any([signal, AbortSignal.timeout(10_000)]))).senders,
		enabled: !!mailboxId,
		retry: false,
		refetchOnReconnect: false,
		staleTime: Infinity,
	});

	const [form, setForm] = useState<ReturnType<typeof formFromMailbox> | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [removingSender, setRemovingSender] = useState<string | null>(null);
	const set = <K extends keyof ReturnType<typeof formFromMailbox>>(key: K, value: ReturnType<typeof formFromMailbox>[K]) => setForm((current) => current && { ...current, [key]: value });

	useEffect(() => {
		if (mailbox) setForm(formFromMailbox(mailbox));
	}, [mailbox]);

	const removeTrustedSender = async (address: string) => {
		if (!mailboxId) return;
		setRemovingSender(address);
		try {
			await api.removeTrustedSender(mailboxId, address);
			await queryClient.invalidateQueries({ queryKey: ["trusted-senders", mailboxId] });
			toastManager.add({ title: `${address} removed from trusted senders` });
		} catch {
			toastManager.add({ title: "Could not remove trusted sender", variant: "error" });
		} finally {
			setRemovingSender(null);
		}
	};

	if (!mailbox || !form) {
		return (
			<div className="flex flex-col items-center gap-3 py-20 text-sm text-kumo-subtle">
				{mailboxError ? <><p>Could not load this account’s preferences.</p><Button variant="secondary" size="sm" onClick={() => void retryMailbox()}>Try again</Button></> : <Loader size="lg" />}
			</div>
		);
	}

	const isDirty = JSON.stringify(form) !== JSON.stringify(formFromMailbox(mailbox));
	const isCustomPrompt = form.agentPrompt.trim().length > 0;

	const handleSave = async () => {
		if (!mailboxId) return;
		setIsSaving(true);
		const settings = {
			...mailbox.settings,
			fromName: form.displayName,
			agentEnabled: form.agentEnabled,
			autoDraftEnabled: form.agentEnabled && form.autoDraftEnabled,
			agentSystemPrompt: form.agentPrompt.trim() || undefined,
			signature: { enabled: form.signatureEnabled, text: form.signatureText.trim() },
			autoReply: { enabled: form.autoReplyEnabled, subject: form.autoReplySubject.trim(), message: form.autoReplyMessage.trim() },
			spamFiltering: {
				enabled: form.spamEnabled,
				threshold: form.spamThreshold,
				blocklist: form.spamBlocklist.split(/[\n,]/).map((value) => value.trim().toLowerCase()).filter(Boolean),
			},
		};
		try {
			await updateMailboxMutation.mutateAsync({ mailboxId, settings });
			toastManager.add({ title: "Settings saved" });
		} catch {
			toastManager.add({ title: "Failed to save settings", variant: "error" });
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<div className={embedded ? "" : "h-full overflow-y-auto px-4 py-4 md:px-8 md:py-6"}>
			<div className="max-w-2xl space-y-6">
				{!embedded && <h1 className="text-lg font-semibold text-kumo-default">Settings</h1>}

				<Section title="Profile" description="How you appear to the people you email.">
					<div className="px-5 py-4 space-y-3">
						<Input label="Sender name" value={form.displayName} onChange={(e) => set("displayName", e.target.value)} />
						<Input label="Email address" type="email" value={mailbox.email} disabled />
					</div>
				</Section>

				<Section title="Signature" description="Added to new emails, replies, and forwards from this address.">
					<Row label="Add signature">
						<Switch aria-label="Add signature" checked={form.signatureEnabled} onCheckedChange={(value) => set("signatureEnabled", value)} />
					</Row>
					<div className="px-5 py-4">
						<label className="block text-sm text-kumo-default">Signature text
							<textarea value={form.signatureText} onChange={(e) => set("signatureText", e.target.value)} rows={4} placeholder={"Sam Lee\nAcme Inc."} disabled={!form.signatureEnabled} className={`${fieldClass} resize-y`} />
						</label>
					</div>
				</Section>

				<Section title="Automatic reply" description="Sends one reply to each sender every 4 days. Not sent to Junk, mailing lists, or no-reply addresses. Needs Rspamd to confirm the sender is real; without Rspamd no reply is sent.">
					<Row label="Send automatic reply">
						<Switch aria-label="Send automatic reply" checked={form.autoReplyEnabled} onCheckedChange={(value) => set("autoReplyEnabled", value)} />
					</Row>
					<div className="px-5 py-4 space-y-3">
						<Input label="Subject" value={form.autoReplySubject} placeholder="Re: original subject" disabled={!form.autoReplyEnabled} onChange={(e) => set("autoReplySubject", e.target.value)} />
						<label className="block text-sm text-kumo-default">Message
							<textarea value={form.autoReplyMessage} onChange={(e) => set("autoReplyMessage", e.target.value)} rows={5} placeholder={"I am away until Monday. I will reply when I am back."} disabled={!form.autoReplyEnabled} className={`${fieldClass} resize-y`} />
						</label>
						{form.autoReplyEnabled && !form.autoReplyMessage.trim() && <p className="text-xs text-kumo-error">Write a message. No reply is sent without one.</p>}
					</div>
				</Section>

				{aiEnabled && <Section title="AI assistant" description="Chat with an assistant that reads and drafts mail for this account.">
					<Row label="Enable AI assistant" description="Turns off all AI chat and drafting when off.">
						<Switch aria-label="Enable AI assistant" checked={form.agentEnabled} onCheckedChange={(value) => set("agentEnabled", value)} />
					</Row>
					<Row label="Draft replies when mail arrives" description="You can still ask for a draft in chat.">
						<Switch aria-label="Draft replies when mail arrives" checked={form.agentEnabled && form.autoDraftEnabled} disabled={!form.agentEnabled} onCheckedChange={(value) => set("autoDraftEnabled", value)} />
					</Row>
					<div className="px-5 py-4">
						<div className="flex items-center justify-between gap-3">
							<div className="flex items-center gap-2"><span className="text-sm text-kumo-default">Instructions</span>{isCustomPrompt && <Badge variant="primary">Custom</Badge>}</div>
							{isCustomPrompt && <Button variant="ghost" size="xs" icon={<ArrowCounterClockwiseIcon size={14} />} onClick={() => set("agentPrompt", "")}>Clear</Button>}
						</div>
						<p className="mt-0.5 text-xs text-kumo-subtle">Used for every reply and email the assistant writes from this address: who you are, tone, language, sign-off, facts to use.</p>
						<textarea
							value={form.agentPrompt}
							onChange={(e) => set("agentPrompt", e.target.value)}
							placeholder={PROMPT_PLACEHOLDER}
							rows={8}
							disabled={!form.agentEnabled}
							className={`${fieldClass} resize-y bg-kumo-recessed font-mono text-xs leading-relaxed`}
						/>
					</div>
				</Section>}

				<Section title="Junk mail" description="Suspicious mail goes to Junk. It is not forwarded or drafted.">
					<Row label="Filter junk mail">
						<Switch aria-label="Filter junk mail" checked={form.spamEnabled} onCheckedChange={(value) => set("spamEnabled", value)} />
					</Row>
					<Row label="Sensitivity" description="Applies to the built-in filter. Rspamd scores mail first.">
						<select aria-label="Sensitivity" className={`${fieldClass} mt-0 w-36`} value={form.spamThreshold} onChange={(e) => set("spamThreshold", Number(e.target.value))} disabled={!form.spamEnabled}>
							<option value={7}>Low</option><option value={5}>Balanced</option><option value={3}>High</option>
						</select>
					</Row>
					<div className="px-5 py-4">
						<label className="block text-sm text-kumo-default">Always send to Junk
							<textarea value={form.spamBlocklist} onChange={(e) => set("spamBlocklist", e.target.value)} rows={3} placeholder={"sender@example.com\n@example.com"} className={fieldClass} />
						</label>
						<p className="mt-1.5 text-xs text-kumo-subtle">One address or @domain per line.</p>
					</div>
					<div className="px-5 py-4">
						<p className="text-sm text-kumo-default">Trusted senders</p>
						<p className="mt-0.5 text-xs text-kumo-subtle">Mark a Junk message as Not spam to add its sender here. Serious threats still go to Junk.</p>
						{trustedSendersError ? <div className="mt-3 flex items-center gap-2"><p className="text-xs text-kumo-subtle">Could not load trusted senders.</p><Button variant="ghost" size="sm" onClick={() => void retryTrustedSenders()}>Try again</Button></div> : trustedSenders.length === 0 ? <p className="mt-3 text-xs text-kumo-subtle">No trusted senders yet.</p> : (
							<ul className="mt-3 divide-y divide-kumo-line rounded-md border border-kumo-line">
								{trustedSenders.map((address) => (
									<li key={address} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm text-kumo-default">
										<span className="break-all">{address}</span>
										<Button variant="ghost" size="sm" disabled={removingSender === address} onClick={() => removeTrustedSender(address)}>Remove</Button>
									</li>
								))}
							</ul>
						)}
					</div>
				</Section>

				{isDirty && <div role="status" className="sticky bottom-4 z-10 flex items-center justify-end gap-3 rounded-lg border border-kumo-line bg-kumo-base px-4 py-3 shadow-lg">
					<span className="mr-auto text-sm text-kumo-subtle">You have unsaved changes.</span>
					<Button variant="ghost" disabled={isSaving} onClick={() => setForm(formFromMailbox(mailbox))}>Discard</Button>
					<Button variant="primary" onClick={handleSave} loading={isSaving}>Save changes</Button>
				</div>}
			</div>
		</div>
	);
}
