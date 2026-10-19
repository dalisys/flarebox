// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Loader, Tooltip } from "@cloudflare/kumo";
import {
	ArchiveIcon,
	ArrowBendUpLeftIcon,
	ArrowsClockwiseIcon,
	EnvelopeOpenIcon,
	EnvelopeSimpleIcon,
	FileIcon,
	PaperPlaneTiltIcon,
	PencilSimpleIcon,
	TrashIcon,
	TrayIcon,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { Folders } from "shared/folders";
import { formatListDate } from "shared/dates";
import MailboxSplitView from "~/components/MailboxSplitView";
import EmailStarButton from "~/components/EmailStarButton";
import SenderAvatar, { senderName } from "~/components/SenderAvatar";
import { getSnippetText } from "~/lib/utils";
import {
	useDeleteEmail,
	useBulkEmails,
	useEmptyJunk,
	useEmailPages,
	useMarkThreadRead,
	useUpdateEmail,
} from "~/queries/emails";
import { useFolders } from "~/queries/folders";
import { queryKeys } from "~/queries/keys";
import { useUIStore } from "~/hooks/useUIStore";
import api from "~/services/api";
import type { Email } from "~/types";

const PAGE_SIZE = 25;

const FOLDER_EMPTY_STATES: Record<
	string,
	{
		icon: React.ReactNode;
		title: string;
		description: string;
		showCompose?: boolean;
	}
> = {
	[Folders.INBOX]: {
		icon: <TrayIcon size={48} weight="thin" className="text-kumo-subtle" />,
		title: "Your inbox is empty",
		description:
			"New emails will appear here when they arrive. Send an email to get the conversation started.",
		showCompose: true,
	},
	[Folders.SENT]: {
		icon: (
			<PaperPlaneTiltIcon size={48} weight="thin" className="text-kumo-subtle" />
		),
		title: "No sent emails",
		description: "Emails you send will show up here.",
		showCompose: true,
	},
	[Folders.DRAFT]: {
		icon: <FileIcon size={48} weight="thin" className="text-kumo-subtle" />,
		title: "No drafts",
		description: "Emails you're still working on will be saved here.",
		showCompose: true,
	},
	[Folders.ARCHIVE]: {
		icon: <ArchiveIcon size={48} weight="thin" className="text-kumo-subtle" />,
		title: "Archive is empty",
		description:
			"Move emails here to keep your inbox clean without deleting them.",
	},
	[Folders.TRASH]: {
		icon: <TrashIcon size={48} weight="thin" className="text-kumo-subtle" />,
		title: "Trash is empty",
		description:
			"Deleted emails will appear here. You can restore them or permanently delete them.",
	},
	[Folders.SPAM]: {
		icon: <EnvelopeSimpleIcon size={48} weight="thin" className="text-kumo-subtle" />,
		title: "No junk mail",
		description: "Messages flagged by the junk filter appear here. You can move them back to Inbox.",
	},
};

function EmailListSkeleton() {
	return (
		<div className="animate-pulse space-y-1 p-2">
			{Array.from({ length: 8 }).map((_, i) => (
				<div key={i} className="flex items-center gap-3 px-3 py-3">
					<div className="w-4 h-4 rounded bg-kumo-fill" />
					<div className="w-5 h-5 rounded bg-kumo-fill" />
					<div className="flex-1 space-y-2">
						<div className="flex items-center gap-2">
							<div className="h-3 w-24 rounded bg-kumo-fill" />
							<div className="h-3 w-4 rounded bg-kumo-fill" />
							<div className="h-3 flex-1 rounded bg-kumo-fill" />
							<div className="h-3 w-12 rounded bg-kumo-fill" />
						</div>
						<div className="h-2.5 w-3/4 rounded bg-kumo-fill" />
					</div>
				</div>
			))}
		</div>
	);
}

function FolderEmptyState({
	folder,
	onCompose,
}: {
	folder?: string;
	onCompose: () => void;
}) {
	const config = (folder && FOLDER_EMPTY_STATES[folder]) || {
		icon: (
			<EnvelopeSimpleIcon size={48} weight="thin" className="text-kumo-subtle" />
		),
		title: "No emails",
		description: "This folder is empty.",
	};

	return (
		<div className="flex flex-col items-center justify-center py-24 px-6 text-center">
			<div className="mb-4">{config.icon}</div>
			<h3 className="text-base font-semibold text-kumo-default mb-1.5">
				{config.title}
			</h3>
			<p className="text-sm text-kumo-subtle max-w-xs mb-5">
				{config.description}
			</p>
			{"showCompose" in config && config.showCompose && (
				<Button
					variant="primary"
					size="sm"
					icon={<PencilSimpleIcon size={16} />}
					onClick={onCompose}
				>
					Compose
				</Button>
			)}
		</div>
	);
}

export default function EmailListRoute() {
	const { mailboxId, folder } = useParams<{
		mailboxId: string;
		folder: string;
	}>();
	const [searchParams] = useSearchParams();
	const openEmailId = searchParams.get("open");
	const composeOnOpen = searchParams.get("compose") === "true";
	const openedEmailRef = useRef<string | null>(null);
	const {
		selectedEmailId,
		isComposing,
		selectEmail,
		closePanel,
		startCompose,
	} = useUIStore();
	// Pages loaded so far; scrolling to the end of the list loads the next one.
	const [pageCount, setPageCount] = useState(1);
	const loadMoreRef = useRef<HTMLDivElement>(null);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [bulkError, setBulkError] = useState("");

	const queryClient = useQueryClient();
	const updateEmail = useUpdateEmail();
	const markThreadRead = useMarkThreadRead();
	const deleteEmail = useDeleteEmail();
	const bulkEmails = useBulkEmails();
	const emptyJunk = useEmptyJunk();

	const {
		emails,
		totalCount,
		isFetching: isRefreshing,
		isLoadingMore,
	} = useEmailPages(mailboxId, folder || "", pageCount, PAGE_SIZE, { refetchInterval: 30_000 });
	const hasMore = pageCount * PAGE_SIZE < totalCount;

	useEffect(() => {
		const target = loadMoreRef.current;
		if (!target || !hasMore || isLoadingMore) return;
		const observer = new IntersectionObserver((entries) => {
			if (entries.some((entry) => entry.isIntersecting)) setPageCount((count) => count + 1);
		}, { rootMargin: "400px 0px" });
		observer.observe(target);
		return () => observer.disconnect();
	}, [hasMore, isLoadingMore, emails.length]);

	const { data: folders = [] } = useFolders(mailboxId);

	const folderName = useMemo(() => {
		const found = folders.find((f) => f.id === folder);
		if (found) return found.name;
		return folder ? folder.charAt(0).toUpperCase() + folder.slice(1) : "Inbox";
	}, [folders, folder]);

	const isPanelOpen = selectedEmailId !== null || isComposing;

	// Track folder identity to detect folder changes vs page changes
	const prevFolderRef = useRef<string | undefined>(undefined);

	useEffect(() => {
		const folderChanged = prevFolderRef.current !== `${mailboxId}/${folder}`;
		prevFolderRef.current = `${mailboxId}/${folder}`;

		if (folderChanged) {
			closePanel();
			setPageCount(1);
			setSelectedIds(new Set());
			setBulkError("");
		}
	}, [mailboxId, folder, closePanel]);
	useEffect(() => { if (composeOnOpen) startCompose(); }, [composeOnOpen, startCompose]);

	const handleDelete = (e: React.MouseEvent, emailId: string) => {
		e.preventDefault();
		e.stopPropagation();
		if (mailboxId) {
			const confirmed = window.confirm("Are you sure you want to delete this email?");
			if (!confirmed) return;
			deleteEmail.mutate({ mailboxId, id: emailId });
			if (selectedEmailId === emailId) closePanel();
		}
	};

	const handleRefresh = () => {
		if (mailboxId) {
			queryClient.invalidateQueries({ queryKey: ["emails", mailboxId] });
			queryClient.invalidateQueries({
				queryKey: queryKeys.folders.list(mailboxId),
			});
		}
	};

	// Thread-aware helpers
	const hasUnread = (email: Email): boolean => {
		if (email.thread_unread_count !== undefined) {
			return email.thread_unread_count > 0;
		}
		return !email.read;
	};

	const handleRowClick = (email: Email) => {
		selectEmail(email.id);
		if (mailboxId && hasUnread(email)) {
			if (email.thread_id && email.thread_count && email.thread_count > 1) {
				markThreadRead.mutate({
					mailboxId,
					threadId: email.thread_id,
				});
			} else {
				updateEmail.mutate({
					mailboxId,
					id: email.id,
					data: { read: true },
				});
			}
		}
	};

	// The combined inbox links directly to a conversation in its mailbox.
	useEffect(() => {
		if (!mailboxId || !openEmailId || !emails.length) return;
		const key = `${mailboxId}/${openEmailId}`;
		if (openedEmailRef.current === key) return;
		const email = emails.find((item) => item.id === openEmailId);
		if (!email) return;
		openedEmailRef.current = key;
		selectEmail(email.id);
		if (email.thread_unread_count !== undefined ? email.thread_unread_count > 0 : !email.read) {
			if (email.thread_id && (email.thread_count ?? 1) > 1) {
				markThreadRead.mutate({ mailboxId, threadId: email.thread_id });
			} else {
				updateEmail.mutate({ mailboxId, id: email.id, data: { read: true } });
			}
		}
	}, [mailboxId, openEmailId, emails, selectEmail, markThreadRead, updateEmail]);

	const formatParticipants = (email: Email): string => {
		if (email.participants) {
			const names = email.participants
				.split(",")
				.map((participant) => senderName(participant.trim()))
				.filter((name, idx, arr) => arr.indexOf(name) === idx);
			if (names.length <= 3) return names.join(", ");
			return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
		}
		return senderName(folder === Folders.SENT || folder === Folders.DRAFT ? email.recipient : email.sender);
	};

	const toggleSelected = (id: string) => setSelectedIds((current) => {
		const next = new Set(current);
		if (next.has(id)) next.delete(id); else next.add(id);
		return next;
	});
	const visibleIds = emails.map((email) => email.id);
	const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
	const runBulk = async (action: "archive" | "read" | "unread" | "delete") => {
		if (!mailboxId || !folder || selectedIds.size === 0) return;
		if (action === "delete" && !window.confirm(`${folder === Folders.TRASH ? "Permanently delete" : "Move to Trash"} ${selectedIds.size} selected conversation${selectedIds.size === 1 ? "" : "s"}?`)) return;
		setBulkError("");
		try {
			if (folder === "activity") {
				const groups = new Map<string, string[]>();
				for (const email of emails.filter((item) => selectedIds.has(item.id))) {
					const folderId = email.folder_id || Folders.INBOX;
					groups.set(folderId, [...(groups.get(folderId) || []), email.id]);
				}
				const results = await Promise.allSettled([...groups].map(([folderId, ids]) => api.bulkEmails(mailboxId, action, folderId, ids, false)));
				await Promise.all([queryClient.invalidateQueries({ queryKey: ["emails", mailboxId] }), queryClient.invalidateQueries({ queryKey: queryKeys.folders.list(mailboxId) }), queryClient.invalidateQueries({ queryKey: ["combined-mail", mailboxId] })]);
				const failed = results.find((result) => result.status === "rejected");
				if (failed) throw failed.reason;
			} else await bulkEmails.mutateAsync({ mailboxId, folder, action, ids: [...selectedIds] });
			if (selectedEmailId && selectedIds.has(selectedEmailId) && (action === "archive" || action === "delete")) closePanel();
			setSelectedIds(new Set());
		} catch (error) { setBulkError(error instanceof Error ? error.message : "Could not update selected messages."); }
	};
	const runEmptyJunk = async () => {
		if (!mailboxId || !window.confirm(`Permanently delete all ${totalCount} junk conversation${totalCount === 1 ? "" : "s"} in this account?`)) return;
		setBulkError("");
		try {
			await emptyJunk.mutateAsync(mailboxId);
			closePanel();
			setSelectedIds(new Set());
			setPageCount(1);
		} catch (error) { setBulkError(error instanceof Error ? error.message : "Could not empty Junk."); }
	};

	return (
		<MailboxSplitView
			onNavigate={(direction) => {
				const index = emails.findIndex((email) => email.id === selectedEmailId);
				const next = emails[index + (direction === "next" ? 1 : -1)];
				if (index >= 0 && next) selectEmail(next.id);
			}}
			selectedEmailId={selectedEmailId}
			isComposing={isComposing}
		>
				{/* Folder header */}
				<div className="mail-list-heading flex items-center justify-between px-4 py-3.5 shrink-0 md:px-5">
					<h1 className="text-lg font-medium text-kumo-default">
						{folderName}
					</h1>
					<div className="flex items-center gap-1">
						{folder === Folders.SPAM && <Button variant="secondary" size="sm" icon={<TrashIcon size={16} />} disabled={emptyJunk.isPending || totalCount === 0} onClick={runEmptyJunk}>Empty Junk</Button>}
						{totalCount > 0 && (
							<span className="text-sm text-kumo-subtle mr-2 hidden sm:inline">
								{totalCount} {folder === "activity" ? `message${totalCount !== 1 ? "s" : ""}` : `conversation${totalCount !== 1 ? "s" : ""}`}
							</span>
						)}
						<Tooltip
							content={isRefreshing ? "Refreshing..." : "Refresh"}
							side="bottom"
							asChild
						>
							<Button
								variant="ghost"
								shape="square"
								size="sm"
								icon={
									<ArrowsClockwiseIcon
										size={18}
										className={isRefreshing ? "animate-spin" : ""}
									/>
								}
								onClick={handleRefresh}
								disabled={isRefreshing}
								aria-label="Refresh"
							/>
						</Tooltip>
					</div>
				</div>
				{(emails.length > 0 || selectedIds.size > 0) && <div className={`mail-selection-toolbar ${selectedIds.size ? "has-selection" : ""} flex flex-wrap items-center gap-2 border-b border-kumo-line px-4 py-2 md:px-5`}>
					<label className="flex items-center gap-2 text-sm text-kumo-subtle"><input type="checkbox" aria-label="Select all loaded messages" checked={allVisibleSelected} onChange={() => setSelectedIds(allVisibleSelected ? new Set() : new Set(visibleIds))} />{selectedIds.size ? `${selectedIds.size} selected` : "Select all"}</label>
					{selectedIds.size > 0 && <div className="flex flex-wrap items-center gap-1 ml-auto">
						{folder !== Folders.ARCHIVE && folder !== Folders.TRASH && <Button variant="ghost" size="sm" icon={<ArchiveIcon size={16} />} disabled={bulkEmails.isPending} onClick={() => runBulk("archive")}>Archive</Button>}
						<Button variant="ghost" size="sm" icon={<EnvelopeOpenIcon size={16} />} disabled={bulkEmails.isPending} onClick={() => runBulk("read")}>Mark read</Button>
						<Button variant="ghost" size="sm" icon={<EnvelopeSimpleIcon size={16} />} disabled={bulkEmails.isPending} onClick={() => runBulk("unread")}>Mark unread</Button>
						<Button variant="ghost" size="sm" icon={<TrashIcon size={16} />} disabled={bulkEmails.isPending} onClick={() => runBulk("delete")}>{folder === Folders.TRASH ? "Delete permanently" : "Delete"}</Button>
						<Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>Clear</Button>
					</div>}
				</div>}
				{bulkError && <p role="alert" className="border-b border-kumo-line px-4 py-2 text-sm text-kumo-destructive">{bulkError}</p>}

				{/* Email rows */}
				<div className="mail-message-scroll flex-1 overflow-y-auto">
				{isRefreshing && emails.length === 0 ? (
					<EmailListSkeleton />
				) : emails.length > 0 ? (
						<div>
							{emails.map((email) => {
								const isSelected = selectedEmailId === email.id;
								const snippet = getSnippetText(email.snippet);
								return (
									<div
										key={email.id}
										role="button"
										tabIndex={0}
										onClick={() => handleRowClick(email)}
										onKeyDown={(e) => {
											if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
												e.preventDefault();
												handleRowClick(email);
											}
										}}
										className={`mail-message-row group w-full text-left cursor-pointer ${hasUnread(email) ? "is-unread" : ""} ${selectedIds.has(email.id) ? "is-checked" : ""} ${
											isPanelOpen ? "md:px-4 md:py-2.5" : ""
										} ${isSelected ? "is-selected" : ""}`}
									>
										<input type="checkbox" aria-label={`Select ${email.subject || "message"}`} checked={selectedIds.has(email.id)} onClick={(event) => event.stopPropagation()} onChange={() => toggleSelected(email.id)} className="mail-row-checkbox" />
										<SenderAvatar sender={folder === "sent" || folder === "draft" ? email.recipient : email.sender} />

										{mailboxId && <EmailStarButton mailboxId={mailboxId} id={email.id} starred={email.starred} />}

										{/* Content */}
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-2">
												<span
													className={`mail-message-sender truncate ${hasUnread(email) ? "font-semibold text-kumo-default" : "text-kumo-strong"}`}
												>
													{formatParticipants(email)}
												</span>
												{(email.thread_count ?? 1) > 1 && (
													<span className="shrink-0 text-xs text-kumo-subtle bg-kumo-fill rounded-full px-1.5 py-0.5 font-medium">
														{email.thread_count}
													</span>
												)}
												{email.has_draft && (
													<span className="shrink-0 text-xs text-kumo-destructive font-medium">
														Draft
													</span>
												)}
												{email.needs_reply && !email.has_draft && (
													<Tooltip content="Needs reply" asChild>
														<span className="shrink-0 text-kumo-warning">
															<ArrowBendUpLeftIcon size={14} weight="bold" />
														</span>
													</Tooltip>
												)}
												<span className="mail-message-date text-kumo-subtle shrink-0 ml-auto">
													{formatListDate(email.date)}
												</span>
											</div>
											<div className="mail-message-preview text-sm mt-0.5">
												<span
													className={`mail-message-subject ${hasUnread(email) ? "font-medium text-kumo-default" : "text-kumo-default"}`}
												>
													{email.subject}
												</span>
											{snippet && (
												<span className="mail-message-snippet text-kumo-subtle font-normal">
													{snippet}
												</span>
											)}
										</div>
									</div>

										{/* Hover actions */}
										<div className="hidden items-center shrink-0 md:group-hover:flex">
											<Tooltip content={email.read ? "Mark unread" : "Mark read"} asChild>
												<Button
													variant="ghost"
													shape="square"
													size="sm"
													icon={email.read ? <EnvelopeSimpleIcon size={14} /> : <EnvelopeOpenIcon size={14} />}
													onClick={(e) => {
														e.stopPropagation();
														if (mailboxId)
															updateEmail.mutate({
																mailboxId,
																id: email.id,
																data: { read: !email.read },
															});
													}}
													aria-label={email.read ? "Mark unread" : "Mark read"}
												/>
											</Tooltip>
											<Tooltip content="Delete" asChild>
												<Button
													variant="ghost"
													shape="square"
													size="sm"
													icon={<TrashIcon size={14} />}
													onClick={(e) => handleDelete(e, email.id)}
													aria-label="Delete"
												/>
											</Tooltip>
										</div>
									</div>
								);
							})}
							{hasMore && <div ref={loadMoreRef} className="flex min-h-14 items-center justify-center py-4" aria-live="polite">{isLoadingMore ? <Loader size="sm" /> : <span className="sr-only">Scroll to load more</span>}</div>}
						</div>
					) : (
						<FolderEmptyState
							folder={folder}
							onCompose={() => startCompose()}
						/>
					)}
				</div>

		</MailboxSplitView>
	);
}
