// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useKumoToastManager } from "@cloudflare/kumo";
import { ArrowBendUpLeftIcon, ArrowBendUpRightIcon, ArrowLeftIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import { Folders } from "shared/folders";
import EmailPanelDialogs from "~/components/email-panel/EmailPanelDialogs";
import EmailPanelHeader from "~/components/email-panel/EmailPanelHeader";
import EmailPanelToolbar from "~/components/email-panel/EmailPanelToolbar";
import SingleMessageView from "~/components/email-panel/SingleMessageView";
import ThreadMessage from "~/components/email-panel/ThreadMessage";
import { splitEmailList, toEmailListValue } from "~/lib/utils";
import api from "~/services/api";
import { useDeleteEmail, useEmail, useMarkThreadRead, useMarkNotSpam, useMarkSpam, useMoveEmail, useReplyToEmail, useSendEmail, useThreadReplies, useUpdateEmail } from "~/queries/emails";
import { useFolders } from "~/queries/folders";
import { useMailbox } from "~/queries/mailboxes";
import { useUIStore } from "~/hooks/useUIStore";
import type { Email, Folder, Mailbox } from "~/types";

function EmailPanelSkeleton() {
	return (
		<div className="animate-pulse p-5 space-y-4">
			<div className="h-5 w-2/3 rounded bg-kumo-fill" />
			<div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-kumo-fill" /><div className="space-y-2 flex-1"><div className="h-3 w-40 rounded bg-kumo-fill" /><div className="h-2.5 w-24 rounded bg-kumo-fill" /></div></div>
			<div className="space-y-2 pt-4"><div className="h-2.5 w-full rounded bg-kumo-fill" /><div className="h-2.5 w-5/6 rounded bg-kumo-fill" /><div className="h-2.5 w-4/6 rounded bg-kumo-fill" /><div className="h-2.5 w-3/4 rounded bg-kumo-fill" /></div>
		</div>
	);
}

export default function EmailPanel({ emailId, mailboxId: mailboxOverride, folder: folderOverride, onClose, onNavigate }: { emailId: string; mailboxId?: string; folder?: string; onClose?: () => void; onNavigate?: (direction: "next" | "previous") => void }) {
	const params = useParams<{ mailboxId: string; folder: string }>();
	const mailboxId = mailboxOverride ?? params.mailboxId;
	const folder = folderOverride ?? params.folder;
	const { data: email, isError, refetch } = useEmail(mailboxId, emailId);
	const { data: threadRepliesRaw } = useThreadReplies(mailboxId, email?.thread_id) as {
		data?: Email[];
	};
	const updateEmail = useUpdateEmail();
	const markThreadRead = useMarkThreadRead();
	const openedRef = useRef("");
	const panelRef = useRef<HTMLDivElement>(null);
	const touchStart = useRef<{ x: number; y: number; time: number } | null>(null);
	useEffect(() => {
		if (!email || !mailboxId) return;
		const key = `${mailboxId}/${email.id}`;
		if (openedRef.current === key) return;
		openedRef.current = key;
		if (email.thread_id) markThreadRead.mutate({ mailboxId, threadId: email.thread_id });
		else if (!email.read) updateEmail.mutate({ mailboxId, id: email.id, data: { read: true } });
	}, [email, mailboxId, markThreadRead.mutate, updateEmail.mutate]);
	useEffect(() => {
		const panel = panelRef.current;
		const swipe = (event: Event) => {
			if (window.matchMedia("(max-width: 767px)").matches) onNavigate?.((event as CustomEvent).detail);
		};
		panel?.addEventListener("email-swipe", swipe);
		return () => panel?.removeEventListener("email-swipe", swipe);
	}, [onNavigate, email?.id]);
	const deleteEmailMut = useDeleteEmail();
	const moveEmailMut = useMoveEmail();
	const markSpamMut = useMarkSpam();
	const markNotSpamMut = useMarkNotSpam();
	const sendEmailMut = useSendEmail();
	const replyMut = useReplyToEmail();
	const { data: folders = [] } = useFolders(mailboxId) as { data?: Folder[] };
	const { data: currentMailbox } = useMailbox(mailboxId) as {
		data?: Mailbox;
	};
	const { closePanel: closeStorePanel, startCompose } = useUIStore();
	const closePanel = onClose ?? closeStorePanel;
	const toastManager = useKumoToastManager();
	const [isSending, setIsSending] = useState(false);
	const [sourceViewEmail, setSourceViewEmail] = useState<Email | null>(null);
	const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
	const [previewImage, setPreviewImage] = useState<{ url: string; filename: string } | null>(null);
	const isDraftFolder = folder === Folders.DRAFT;

	const threadReplies = useMemo(() => {
		if (!threadRepliesRaw || !email) return [];
		return threadRepliesRaw.filter((e) => e.id !== email.id);
	}, [threadRepliesRaw, email]);

	const allMessages = useMemo(() => {
		if (!email) return [];
		return [email, ...threadReplies].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
	}, [email, threadReplies]);

	// Reset expanded state only when the selected email changes, not on every refetch.
	// Using allMessages as a dependency would reset user expand/collapse state on background refetches.
	const currentEmailId = email?.id;
	useEffect(() => { if (allMessages.length > 1) setExpandedMessages(new Set([allMessages[0].id])); }, [currentEmailId]); // eslint-disable-line react-hooks/exhaustive-deps

	const toggleExpand = (msgId: string) => { setExpandedMessages((prev) => { const next = new Set(prev); if (next.has(msgId)) next.delete(msgId); else next.add(msgId); return next; }); };

	const draftMessageIds = useMemo(() => {
		const ids = new Set<string>();
		for (const msg of allMessages) { if (msg.folder_id === Folders.DRAFT) ids.add(msg.id); else if (isDraftFolder && msg.id === emailId) ids.add(msg.id); }
		return ids;
	}, [allMessages, isDraftFolder, emailId]);

	const lastReceivedMessage = useMemo(() => {
		const ce = currentMailbox?.email;
		const received = allMessages.filter((msg) => !draftMessageIds.has(msg.id) && msg.sender !== ce);
		if (received.length > 0) return received[0];
		const nonDrafts = allMessages.filter((msg) => !draftMessageIds.has(msg.id));
		return nonDrafts.length > 0 ? nonDrafts[0] : email;
	}, [allMessages, draftMessageIds, currentMailbox?.email, email]);

	const moveToFolders = useMemo(() => { const cur = folder || email?.folder_id; return folders.filter((f) => f.id !== cur); }, [folders, folder, email?.folder_id]);

	if (!email) return <div className="mail-reader flex h-full flex-col"><div className="mail-reader-toolbar"><button type="button" className="mail-icon-button" aria-label="Back to list" onClick={closePanel}><ArrowLeftIcon size={24} /></button></div>{isError ? <div role="alert" className="p-6 text-sm text-kumo-subtle"><p>Could not load this message.</p><button type="button" className="mt-3 text-kumo-link" onClick={() => refetch()}>Try again</button></div> : <EmailPanelSkeleton />}</div>;

	const toggleStar = () => { if (mailboxId) updateEmail.mutate({ mailboxId, id: email.id, data: { starred: !email.starred } }); };
	const handleMove = (folderId: string) => { if (mailboxId) { moveEmailMut.mutate({ mailboxId, id: email.id, folderId }); closePanel(); } };
	const handleMarkSpam = async () => {
		if (!mailboxId) return;
		try {
			const result = await markSpamMut.mutateAsync({ mailboxId, id: email.id });
			toastManager.add({ title: `Moved to Junk. Future mail from ${result.domain} will go to Junk in all inboxes.` });
			closePanel();
		} catch (error) {
			toastManager.add({ title: error instanceof Error ? error.message : "Could not mark email as spam", variant: "error" });
		}
	};
	const handleMarkNotSpam = async () => {
		if (!mailboxId) return;
		try {
			const result = await markNotSpamMut.mutateAsync({ mailboxId, id: email.id });
			toastManager.add({ title: `Moved to Inbox. Future mail from ${result.sender} will be trusted. Its domain is unblocked across all inboxes.` });
			closePanel();
		} catch (error) {
			toastManager.add({ title: error instanceof Error ? error.message : "Could not mark email as not spam", variant: "error" });
		}
	};
	const handleDelete = () => { if (mailboxId) { if (!window.confirm("Are you sure you want to delete this email?")) return; deleteEmailMut.mutate({ mailboxId, id: email.id }); closePanel(); } };

	const handleEditDraft = (draftMsg?: Email) => {
		const target = draftMsg || email;
		if (target.in_reply_to) { startCompose({ mode: "reply", originalEmail: allMessages.find((msg) => msg.id === target.in_reply_to), draftEmail: target }); }
		else { startCompose({ mode: "new", originalEmail: undefined, draftEmail: target }); }
	};

	const handleDeleteDraft = async (draftMsg?: Email) => {
		const target = draftMsg || email;
		if (!mailboxId) return;
		if (!window.confirm("Discard this draft?")) return;
		deleteEmailMut.mutate({ mailboxId, id: target.id });
		toastManager.add({ title: "Draft discarded" });
		if (target.id === emailId) closePanel();
	};

	const handleSendDraft = async (draftMsg?: Email) => {
		let target = draftMsg || email;
		if (!mailboxId || !currentMailbox) return;
		setIsSending(true);
		try {
			if (!target.recipient || !target.subject) { try { const fresh = await api.getEmail(mailboxId, target.id) as Email; if (fresh) target = fresh; } catch {} }
			if (!target.recipient) { toastManager.add({ title: "Cannot send: no recipient set on this draft.", variant: "error" }); return; }
			const toRecipients = splitEmailList(target.recipient);
			if (toRecipients.length === 0) { toastManager.add({ title: "Cannot send: no valid recipient set on this draft.", variant: "error" }); return; }
			const fromName = currentMailbox.settings?.fromName || currentMailbox.name;
			const from = fromName && fromName !== currentMailbox.email ? { email: currentMailbox.email, name: fromName } : currentMailbox.email;
			const originalEmail = target.in_reply_to ? allMessages.find((msg) => msg.id === target.in_reply_to) : undefined;
			const emailData = {
				to: toEmailListValue(toRecipients),
				cc: toEmailListValue(splitEmailList(target.cc)),
				bcc: toEmailListValue(splitEmailList(target.bcc)),
				from,
				subject: target.subject || "(no subject)",
				html: target.body || "",
				text: target.body ? target.body.replace(/<[^>]*>/g, "").trim() : "",
			};
			if (originalEmail) await replyMut.mutateAsync({ mailboxId, emailId: originalEmail.id, email: emailData }); else await sendEmailMut.mutateAsync({ mailboxId, email: emailData });
			await deleteEmailMut.mutateAsync({ mailboxId, id: target.id });
			toastManager.add({ title: "Email sent!" });
			if (isDraftFolder) closePanel();
		} catch (err) {
			const message = (err instanceof Error ? err.message : null) || "Failed to send email.";
			toastManager.add({ title: message, variant: "error" });
		} finally { setIsSending(false); }
	};

	const hasThread = allMessages.length > 1;

	return (
		<div ref={panelRef} className="mail-reader flex min-h-0 min-w-0 flex-col h-full"
			onTouchStart={(event) => {
				const target = event.target as HTMLElement;
				touchStart.current = event.touches.length === 1 && !target.closest("button, a, input, textarea, select")
					? { x: event.touches[0].clientX, y: event.touches[0].clientY, time: Date.now() } : null;
			}}
			onTouchMove={(event) => { if (event.touches.length !== 1) touchStart.current = null; }}
			onTouchCancel={() => { touchStart.current = null; }}
			onTouchEnd={(event) => {
				const start = touchStart.current;
				touchStart.current = null;
				if (!start || event.touches.length || !window.matchMedia("(max-width: 767px)").matches) return;
				const dx = event.changedTouches[0].clientX - start.x;
				const dy = event.changedTouches[0].clientY - start.y;
				if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2 && Date.now() - start.time < 700) onNavigate?.(dx < 0 ? "next" : "previous");
			}}>
			<EmailPanelToolbar
				email={email}
				mailboxId={mailboxId}
				isDraftFolder={isDraftFolder}
				isSending={isSending}
				isMarkingSpam={markSpamMut.isPending}
				onMarkSpam={handleMarkSpam}
				isMarkingNotSpam={markNotSpamMut.isPending}
				moveToFolders={moveToFolders}
				onBack={closePanel}
				onSendDraft={() => handleSendDraft()}
				onEditDraft={() => handleEditDraft()}
				onReply={() =>
					startCompose({ mode: "reply", originalEmail: lastReceivedMessage })
				}
				onReplyAll={() =>
					startCompose({
						mode: "reply-all",
						originalEmail: lastReceivedMessage,
					})
				}
				onForward={() => startCompose({ mode: "forward", originalEmail: email })}
				onToggleStar={toggleStar}
				onToggleRead={() => {
					if (mailboxId) {
						updateEmail.mutate({
							mailboxId,
							id: email.id,
							data: { read: !email.read },
						});
					}
				}}
				onMove={handleMove}
				onMarkNotSpam={handleMarkNotSpam}
				onViewSource={() => setSourceViewEmail(email)}
				onDelete={handleDelete}
			/>

			<div className="mail-reader-scroll min-h-0 flex-1 overflow-y-auto">
			<EmailPanelHeader
				subject={email.subject}
				starred={email.starred}
				isSavingStar={updateEmail.isPending && updateEmail.variables?.data.starred !== undefined}
				onToggleStar={toggleStar}
				messageCount={allMessages.length}
				showThreadCount={hasThread}
			/>

			<div className="mail-reader-messages">
				{hasThread ? (
					allMessages.map((msg, idx) => {
						const isDraft = draftMessageIds.has(msg.id);
						return (
							<ThreadMessage
								key={msg.id}
								email={msg}
								mailboxId={mailboxId}
								mailboxEmail={currentMailbox?.email}
								isLast={idx === allMessages.length - 1}
								isDraft={isDraft}
								isSending={isDraft ? isSending : false}
								isExpanded={expandedMessages.has(msg.id)}
								onToggleExpand={() => toggleExpand(msg.id)}
								onSendDraft={isDraft ? () => handleSendDraft(msg) : undefined}
								onEditDraft={isDraft ? () => handleEditDraft(msg) : undefined}
								onDeleteDraft={isDraft ? () => handleDeleteDraft(msg) : undefined}
								onViewSource={() => setSourceViewEmail(msg)}
								onPreviewImage={(url, filename) =>
									setPreviewImage({ url, filename })
								}
							/>
						);
					})
				) : (
					<SingleMessageView
						email={email}
						mailboxId={mailboxId}
						onPreviewImage={(url, filename) =>
							setPreviewImage({ url, filename })
						}
					/>
				)}
			</div>

			</div>
			{!isDraftFolder && <div className="mail-reader-reply">
				<button type="button" onClick={() => startCompose({ mode: "reply", originalEmail: lastReceivedMessage })}><ArrowBendUpLeftIcon size={22} />Reply</button>
				<button type="button" onClick={() => startCompose({ mode: "forward", originalEmail: email })}><ArrowBendUpRightIcon size={22} />Forward</button>
			</div>}

			<EmailPanelDialogs
				sourceViewEmail={sourceViewEmail}
				previewImage={previewImage}
				onCloseSource={() => setSourceViewEmail(null)}
				onClosePreview={() => setPreviewImage(null)}
			/>
		</div>
	);
}
