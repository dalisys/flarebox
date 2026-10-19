// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useKumoToastManager } from "@cloudflare/kumo";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
	buildQuotedReplyBlock,
	escapeHtml,
	formatComposeDate,
	getSignatureBlock,
	htmlToPlainText,
	splitEmailList,
	stripHtml,
	toEmailListValue,
} from "~/lib/utils";
import { formatDetailDate } from "shared/dates";
import { useDeleteEmail, useForwardEmail, useReplyToEmail, useSaveDraft, useScheduleEmail, useSendEmail } from "~/queries/emails";
import { useMailbox, useMailboxes } from "~/queries/mailboxes";
import { useUIStore } from "~/hooks/useUIStore";
import api from "~/services/api";

function appendUniqueAddress(
	addresses: string[],
	seen: Set<string>,
	address: string,
	exclude?: string,
) {
	const trimmed = address.trim();
	if (!trimmed) return;

	const normalized = trimmed.toLowerCase();
	if (normalized === exclude || seen.has(normalized)) return;

	seen.add(normalized);
	addresses.push(trimmed);
}

interface ComposeFormFields {
	to: string;
	cc: string;
	bcc: string;
	showCcBcc: boolean;
	subject: string;
	body: string;
}

const EMPTY_FIELDS: ComposeFormFields = {
	to: "",
	cc: "",
	bcc: "",
	showCcBcc: false,
	subject: "",
	body: "",
};

function getPrefixedSubject(subject: string, prefix: "Re" | "Fwd") {
	const expectedPrefix = `${prefix}: `;
	return subject.startsWith(expectedPrefix)
		? subject
		: `${expectedPrefix}${subject}`;
}

function buildForwardBody(
	original: NonNullable<ReturnType<typeof useUIStore.getState>["composeOptions"]["originalEmail"]>,
	sigBlock: string,
) {
	const safeSender = escapeHtml(original.sender);
	const safeSubject = escapeHtml(original.subject);
	const safeBody = escapeHtml(stripHtml(original.body || "")).replace(/\n/g, "<br>");

	return `<p></p>${sigBlock ? `${sigBlock}<br>` : ""}<div style="border: 1px solid #ddd; padding: 1em; background-color: #f9f9f9; margin: 1em 0;"><strong>Forwarded message:</strong><br><strong>From:</strong> ${safeSender}<br><strong>Date:</strong> ${formatComposeDate(original.date)}<br><strong>Subject:</strong> ${safeSubject}<br><br>${safeBody}</div>`;
}

function buildReplyAllFields(
	original: NonNullable<ReturnType<typeof useUIStore.getState>["composeOptions"]["originalEmail"]>,
	selfAddress?: string,
) {
	const toRecipients: string[] = [];
	const toSeen = new Set<string>();
	appendUniqueAddress(toRecipients, toSeen, original.sender, selfAddress);

	for (const recipient of splitEmailList(original.recipient)) {
		appendUniqueAddress(toRecipients, toSeen, recipient, selfAddress);
	}

	const ccRecipients: string[] = [];
	const ccSeen = new Set<string>();
	for (const recipient of splitEmailList(original.cc)) {
		const normalized = recipient.toLowerCase();
		if (
			normalized === selfAddress ||
			toSeen.has(normalized) ||
			ccSeen.has(normalized)
		) {
			continue;
		}
		ccSeen.add(normalized);
		ccRecipients.push(recipient);
	}

	return {
		to: toRecipients.join(", "),
		cc: ccRecipients.join(", "),
		showCcBcc: ccRecipients.length > 0,
	};
}

function buildInitialComposeFields(
	composeOptions: ReturnType<typeof useUIStore.getState>["composeOptions"],
	mailboxEmail: string | undefined,
	sigBlock: string,
): ComposeFormFields {
	const { draftEmail: draft, originalEmail: original, mode } = composeOptions;

	if (draft) {
		return {
			to: draft.recipient || "",
			cc: draft.cc || "",
			bcc: draft.bcc || "",
			showCcBcc: Boolean(draft.cc || draft.bcc),
			subject: draft.subject || "",
			body: draft.body || "",
		};
	}

	if (!original) {
		return {
			...EMPTY_FIELDS,
			body: sigBlock ? `<p></p>${sigBlock}` : "",
		};
	}

	if (mode === "reply") {
		return {
			...EMPTY_FIELDS,
			to: original.sender,
			subject: getPrefixedSubject(original.subject, "Re"),
			body: `<p></p>${sigBlock ? `${sigBlock}<br>` : ""}${buildQuotedReplyBlock(original.date, original.sender, original.body || "")}`,
		};
	}

	if (mode === "reply-all") {
		const recipients = buildReplyAllFields(original, mailboxEmail?.toLowerCase());
		return {
			...EMPTY_FIELDS,
			...recipients,
			subject: getPrefixedSubject(original.subject, "Re"),
			body: `<p></p>${sigBlock ? `${sigBlock}<br>` : ""}${buildQuotedReplyBlock(original.date, original.sender, original.body || "")}`,
		};
	}

	if (mode === "forward") {
		return {
			...EMPTY_FIELDS,
			subject: getPrefixedSubject(original.subject, "Fwd"),
			body: buildForwardBody(original, sigBlock),
		};
	}

	return {
		...EMPTY_FIELDS,
		body: sigBlock ? `<p></p>${sigBlock}` : "",
	};
}

export function useComposeForm(mailboxId?: string, _folder?: string) {
	const toastManager = useKumoToastManager();
	const { composeOptions, closePanel, closeCompose } = useUIStore();
	const { data: mailboxes = [] } = useMailboxes();
	const [senderMailboxId, setSenderMailboxId] = useState(mailboxId || "");
	const selectedMailboxId = senderMailboxId || mailboxId || mailboxes.find((mailbox) => !mailbox.retired)?.id;
	const { data: currentMailbox, isLoading: mailboxLoading } = useMailbox(selectedMailboxId);
	const sendEmailMutation = useSendEmail();
	const saveDraftMutation = useSaveDraft();
	const replyMutation = useReplyToEmail();
	const forwardMutation = useForwardEmail();
	const deleteEmailMutation = useDeleteEmail();
	const scheduleMutation = useScheduleEmail();

	const [to, setTo] = useState("");
	const [cc, setCc] = useState("");
	const [bcc, setBcc] = useState("");
	const [showCcBcc, setShowCcBcc] = useState(false);
	const [subject, setSubject] = useState("");
	const [body, setBody] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isSavingDraft, setIsSavingDraft] = useState(false);
	const [isSending, setIsSending] = useState(false);
	const lastInitializedOptionsRef = useRef<typeof composeOptions | null>(null);
	const isDraftEdit = !!composeOptions.draftEmail;
	const senderLocked = composeOptions.mode !== "new" || isDraftEdit;
	useEffect(() => { setSenderMailboxId(mailboxId || ""); }, [composeOptions, mailboxId]);

	const formTitle = useMemo(() => {
		if (isDraftEdit) return "Edit Draft";
		switch (composeOptions.mode) { case "reply": return "Reply"; case "reply-all": return "Reply All"; case "forward": return "Forward"; default: return "New Message"; }
	}, [composeOptions.mode, isDraftEdit]);

	const sigBlock = useMemo(() => getSignatureBlock(currentMailbox?.settings), [currentMailbox]);

	useEffect(() => {
		// Wait for the mailbox settings, or the signature would be missing from the first render.
		if (mailboxLoading || lastInitializedOptionsRef.current === composeOptions) return;
		lastInitializedOptionsRef.current = composeOptions;

		const initialFields = buildInitialComposeFields(
			composeOptions,
			currentMailbox?.email,
			sigBlock,
		);
		setError(null);
		setTo(initialFields.to);
		setCc(initialFields.cc);
		setBcc(initialFields.bcc);
		setShowCcBcc(initialFields.showCcBcc);
		setSubject(initialFields.subject);
		setBody(initialFields.body);
	}, [composeOptions, currentMailbox?.email, sigBlock, mailboxLoading]);

	const handleSaveDraft = async () => {
		if (!selectedMailboxId || isSending) return; setIsSavingDraft(true); setError(null);
		try {
			await saveDraftMutation.mutateAsync({ mailboxId: selectedMailboxId, draft: {
				to,
				cc: cc || undefined,
				bcc: bcc || undefined,
				subject,
				body,
				in_reply_to: composeOptions.originalEmail?.id || composeOptions.draftEmail?.in_reply_to || undefined,
				thread_id: composeOptions.originalEmail?.thread_id || composeOptions.draftEmail?.thread_id || undefined,
				draft_id: composeOptions.draftEmail?.id || undefined,
			} });
			toastManager.add({ title: "Draft saved!" });
		}
		catch (err: unknown) {
			const message = (err instanceof Error ? err.message : null) || "Failed to save draft.";
			setError(message);
			toastManager.add({ title: message, variant: "error" });
		}
		finally { setIsSavingDraft(false); }
	};

	// The request body both Send and Send later use; null after showing an error.
	const buildSend = () => {
		if (!currentMailbox || !selectedMailboxId) { setError("No mailbox selected."); return null; }
		const toRecipients = splitEmailList(to);
		if (toRecipients.length === 0) { setError("Add at least one recipient."); return null; }
		const ccRecipients = splitEmailList(cc); const bccRecipients = splitEmailList(bcc);
		const fromName = currentMailbox.settings?.fromName || currentMailbox.name;
		const from = fromName && fromName !== currentMailbox.email ? { email: currentMailbox.email, name: fromName } : currentMailbox.email;
		const emailData = {
			to: toEmailListValue(toRecipients),
			cc: toEmailListValue(ccRecipients),
			bcc: toEmailListValue(bccRecipients),
			from,
			subject,
			html: body,
			text: htmlToPlainText(body),
		};
		const draftId = composeOptions.draftEmail?.id; const mode = composeOptions.mode; const originalId = composeOptions.originalEmail?.id || composeOptions.draftEmail?.in_reply_to;
		return { selectedMailboxId, emailData, draftId, mode, originalId };
	};

	const handleSend = async (e: FormEvent, onClose: () => void) => {
		e.preventDefault(); if (isSending) return; setError(null);
		const send = buildSend(); if (!send) return;
		const { selectedMailboxId, emailData, draftId, mode, originalId } = send;
		setIsSending(true); toastManager.add({ title: "Sending email..." });
		try {
			if ((mode === "reply" || mode === "reply-all") && originalId) await replyMutation.mutateAsync({ mailboxId: selectedMailboxId, emailId: originalId, email: emailData });
			else if (mode === "forward" && originalId) await forwardMutation.mutateAsync({ mailboxId: selectedMailboxId, emailId: originalId, email: emailData });
			else await sendEmailMutation.mutateAsync({ mailboxId: selectedMailboxId, email: emailData });
			if (draftId) deleteEmailMutation.mutate({ mailboxId: selectedMailboxId, id: draftId });
			toastManager.add({ title: "Email sent!" });
			onClose();
		} catch (err: unknown) { const message = (err instanceof Error ? err.message : null) || "Failed to send email."; setError(message); toastManager.add({ title: message, variant: "error" }); }
		finally { setIsSending(false); }
	};

	const handleSendLater = async (sendAt: Date, onClose: () => void) => {
		if (isSending) return; setError(null);
		const send = buildSend(); if (!send) return;
		const { selectedMailboxId, emailData, draftId, mode, originalId } = send;
		// Same route choice as handleSend: reply and forward need the original.
		const kind = (mode === "reply" || mode === "reply-all") && originalId ? "reply" : mode === "forward" && originalId ? "forward" : "new";
		setIsSending(true);
		try {
			await scheduleMutation.mutateAsync({ mailboxId: selectedMailboxId, data: { mode: kind, originalId: kind === "new" ? undefined : originalId || undefined, draftId: draftId || undefined, sendAt: sendAt.toISOString(), email: emailData } });
			toastManager.add({ title: `Scheduled for ${formatDetailDate(sendAt.toISOString())}` });
			onClose();
		} catch (err: unknown) { const message = (err instanceof Error ? err.message : null) || "Could not schedule this email."; setError(message); toastManager.add({ title: message, variant: "error" }); }
		finally { setIsSending(false); }
	};

	const [isWriting, setIsWriting] = useState(false);
	// Replace the user's own text with the assistant's draft; keep signature and quoted/forwarded original.
	const writeWithAi = async (instructions: string) => {
		if (!selectedMailboxId || isWriting) return false;
		setIsWriting(true); setError(null);
		try {
			const original = composeOptions.originalEmail;
			const draft = await api.aiWrite(selectedMailboxId, {
				instructions,
				mode: composeOptions.mode,
				emailId: original?.id || composeOptions.draftEmail?.in_reply_to || undefined,
				to,
				subject,
				fromName: currentMailbox?.settings?.fromName || currentMailbox?.name,
			});
			const text = draft.body.split(/\n{2,}/).map((part) => `<p>${escapeHtml(part).replace(/\n/g, "<br>")}</p>`).join("");
			const sig = sigBlock ? `<p></p>${sigBlock}` : "";
			const quoteStart = body.indexOf("<blockquote");
			const tail = composeOptions.mode === "forward" && original
				? buildForwardBody(original, sigBlock).replace(/^<p><\/p>/, "")
				: `${sig}${quoteStart >= 0 ? body.slice(quoteStart) : ""}`;
			setBody(`${text}<p></p>${tail}`);
			if (!subject.trim() && draft.subject) setSubject(draft.subject);
			return true;
		} catch (err: unknown) {
			setError((err instanceof Error ? err.message : null) || "The assistant could not write this email.");
			return false;
		} finally { setIsWriting(false); }
	};

	return { isWriting, writeWithAi, to, setTo, cc, setCc, bcc, setBcc, showCcBcc, setShowCcBcc, subject, setSubject, body, setBody, error, setError, isSavingDraft, isSending, formTitle, handleSaveDraft, handleSend, handleSendLater, closeCompose, closePanel, senderMailboxId: selectedMailboxId || "", setSenderMailboxId, senderLocked, mailboxes };
}
