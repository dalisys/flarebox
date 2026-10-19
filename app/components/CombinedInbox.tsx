// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button } from "@cloudflare/kumo";
import { ArchiveIcon, ArrowsClockwiseIcon, EnvelopeOpenIcon, EnvelopeSimpleIcon, TrashIcon, TrayIcon } from "@phosphor-icons/react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import SenderAvatar, { senderName } from "~/components/SenderAvatar";
import EmailStarButton from "~/components/EmailStarButton";
import { buildSearchQuery, parseSearchQuery, searchQueryParams } from "~/lib/search-parser";
import { formatListDate } from "shared/dates";
import { Folders, getFolderDisplayName } from "shared/folders";
import { getSnippetText } from "~/lib/utils";
import api from "~/services/api";
import type { Email, Mailbox } from "~/types";

interface AccountMessages { mailboxId: string; emails: Email[]; totalCount: number; }
interface CombinedEmail extends Email { mailboxId: string; }
const PAGE_SIZE_PER_MAILBOX = 50;

export default function CombinedInbox({ mailboxes, folder, onSelect }: { mailboxes: Mailbox[]; folder: string; onSelect: (email: { id: string; mailboxId: string; folder: string }, messages: { id: string; mailboxId: string; folder: string }[]) => void }) {
	const queryClient = useQueryClient();
	const [searchParams, setSearchParams] = useSearchParams();
	const activeQuery = searchParams.get("q") ?? "";
	const sort = searchParams.get("sort") ?? "newest";
	const unreadOnly = parseSearchQuery(activeQuery).is_read === false;
	const [pages, setPages] = useState(1);
	const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	useEffect(() => { setPages(1); setSelectedKeys(new Set()); setError(""); }, [folder, activeQuery, unreadOnly, sort]);
	const searching = searchParams.has("q") || unreadOnly;
	const applySearch = (query: string) => {
		setSearchParams((params) => { params.set("q", query); return params; });
	};
	const clearSearch = () => {
		setSearchParams((params) => { params.delete("q"); params.delete("sort"); return params; });
	};
	const queries = useQueries({
		queries: mailboxes.flatMap((mailbox) => Array.from({ length: pages }, (_, index) => ({
			queryKey: ["combined-mail", mailbox.id, folder, index + 1, searching, activeQuery, unreadOnly, sort],
			queryFn: async (): Promise<AccountMessages> => {
				const pagination = { page: String(index + 1), limit: String(PAGE_SIZE_PER_MAILBOX) };
				const filters = searchQueryParams(activeQuery);
				if (!filters.folder && folder !== "activity") filters.folder = folder;
				const result = searching
					? await api.searchEmails(mailbox.id, { ...filters, ...pagination, sort }) as { emails: Email[]; totalCount: number }
					: await api.listEmails(mailbox.id, { folder, threaded: folder === "activity" ? "false" : "true", ...pagination });
				return { mailboxId: mailbox.id, emails: Array.isArray(result) ? result : result.emails, totalCount: Array.isArray(result) ? result.length : result.totalCount };
			},
			refetchInterval: 30_000,
			staleTime: 15_000,
		}))),
	});
	const loaded = queries.flatMap((query) => query.data ? [query.data] : []);
	const totals = new Map(loaded.map((item) => [item.mailboxId, item.totalCount]));
	const totalCount = [...totals.values()].reduce((sum, count) => sum + count, 0);
	const hasMore = [...totals.values()].some((count) => count > pages * PAGE_SIZE_PER_MAILBOX);
	const isLoading = queries.some((query) => query.isPending);
	// Load older messages when the end of the list scrolls into view.
	const loadMoreRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const target = loadMoreRef.current;
		if (!target || !hasMore || isLoading) return;
		const observer = new IntersectionObserver((entries) => {
			if (entries.some((entry) => entry.isIntersecting)) setPages((value) => value + 1);
		}, { rootMargin: "400px 0px" });
		observer.observe(target);
		return () => observer.disconnect();
	}, [hasMore, isLoading]);
	const hasError = queries.some((query) => query.isError);
	const isRefreshing = queries.some((query) => query.isFetching);
	const emails = loaded.flatMap((item) => item.emails.map((email): CombinedEmail => ({ ...email, mailboxId: item.mailboxId })))
		.sort((a, b) => {
			const dateOrder = sort === "oldest" ? Date.parse(a.date) - Date.parse(b.date) : Date.parse(b.date) - Date.parse(a.date);
			if (searching && (sort === "sender" || sort === "subject")) return (a[sort] ?? "").toLowerCase().localeCompare((b[sort] ?? "").toLowerCase()) || dateOrder || a.id.localeCompare(b.id);
			return dateOrder || a.id.localeCompare(b.id);
		});
	const visibleEmails = emails;

	const title = folder === "activity" ? "Activity" : getFolderDisplayName(folder);
	const refresh = () => queryClient.invalidateQueries({ queryKey: ["combined-mail"] });
	const keyOf = (email: CombinedEmail) => `${email.mailboxId}/${email.id}`;
	const visibleKeys = visibleEmails.map(keyOf);
	const selectedEmails = emails.filter((email) => selectedKeys.has(keyOf(email)));
	const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((key) => selectedKeys.has(key));
	const runBulk = async (action: "archive" | "read" | "unread" | "delete") => {
		if (!selectedEmails.length) return;
		if (action === "delete" && !window.confirm(`Delete ${selectedEmails.length} selected conversation${selectedEmails.length === 1 ? "" : "s"}? Messages in Trash will be permanently deleted.`)) return;
		setBusy(true); setError("");
		const groups = new Map<string, { mailboxId: string; folderId: string; ids: string[] }>();
		for (const email of selectedEmails) {
			const folderId = folder === "activity" || searching ? email.folder_id || Folders.INBOX : folder;
			const key = `${email.mailboxId}\u0000${folderId}`;
			if (!groups.has(key)) groups.set(key, { mailboxId: email.mailboxId, folderId, ids: [] });
			groups.get(key)!.ids.push(email.id);
		}
		const results = await Promise.allSettled([...groups.values()].flatMap(({ mailboxId, folderId, ids }) =>
			Array.from({ length: Math.ceil(ids.length / 100) }, (_, index) => api.bulkEmails(mailboxId, action, folderId, ids.slice(index * 100, (index + 1) * 100), folder !== "activity" && !searching))));
		await Promise.all([...new Set(selectedEmails.map((email) => email.mailboxId))].map((mailboxId) => Promise.all([
			queryClient.invalidateQueries({ queryKey: ["combined-mail", mailboxId] }),
			queryClient.invalidateQueries({ queryKey: ["emails", mailboxId] }),
			queryClient.invalidateQueries({ queryKey: ["folders", mailboxId] }),
		])));
		if (results.some((result) => result.status === "rejected")) setError("Some messages could not be updated. Refresh and try again.");
		else setSelectedKeys(new Set());
		setBusy(false);
	};
	const emptyJunk = async () => {
		if (!window.confirm(`Permanently delete all Junk messages in ${mailboxes.length} account${mailboxes.length === 1 ? "" : "s"}?`)) return;
		setBusy(true); setError("");
		const results = await Promise.allSettled(mailboxes.map((mailbox) => api.emptyJunk(mailbox.id)));
		await Promise.all(mailboxes.map((mailbox) => Promise.all([
			queryClient.invalidateQueries({ queryKey: ["combined-mail", mailbox.id] }),
			queryClient.invalidateQueries({ queryKey: ["emails", mailbox.id] }),
			queryClient.invalidateQueries({ queryKey: ["folders", mailbox.id] }),
		])));
		if (results.some((result) => result.status === "rejected")) setError("Junk could not be emptied in every account. Refresh and try again.");
		else setSelectedKeys(new Set());
		setBusy(false);
	};

	return <section className="mail-list flex h-full min-w-0 flex-col bg-kumo-base">
		<div className="mail-list-heading flex flex-wrap items-center justify-between gap-3 px-5 py-4">
			<div><h1 className="text-lg font-medium text-kumo-default">{title}</h1><p className="mt-0.5 text-xs text-kumo-subtle">All accounts · {hasError ? "Some accounts could not be loaded" : `${totalCount} ${searching ? "matching messages" : "messages"}`}</p></div>
			<div className="flex items-center gap-2"><button type="button" onClick={() => { const filters = parseSearchQuery(activeQuery); filters.is_read = unreadOnly ? undefined : false; applySearch(buildSearchQuery(filters)); }} className={`min-h-11 shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${unreadOnly ? "border-kumo-brand bg-kumo-tint text-kumo-default" : "border-kumo-line text-kumo-subtle hover:bg-kumo-tint"}`} aria-pressed={unreadOnly}>Unread only</button>{folder === Folders.SPAM && <Button variant="secondary" size="sm" icon={<TrashIcon size={16} />} disabled={busy || totalCount === 0} onClick={emptyJunk}>Empty Junk</Button>}<Button variant="ghost" shape="square" size="sm" className="mail-icon-button" aria-label="Refresh" icon={<ArrowsClockwiseIcon size={16} className={isRefreshing ? "animate-spin" : ""} />} onClick={refresh} /></div>
		</div>
		{searching && <div className="mail-list-filters flex flex-wrap items-center gap-2 border-b border-kumo-line px-4 pb-3">

			{searching && <Button variant="ghost" size="sm" className="min-h-11" onClick={clearSearch}>Clear</Button>}
			{searching && <select aria-label="Sort search results" value={sort} className="min-h-11 min-w-40 max-w-full flex-[1_1_10rem] rounded-md border border-kumo-line bg-kumo-base px-2 py-1.5 text-base sm:text-sm text-kumo-default" onChange={(event) => setSearchParams((params) => { params.set("sort", event.target.value); return params; })}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="sender">Sender A–Z</option><option value="subject">Subject A–Z</option></select>}

		</div>}
		{(visibleEmails.length > 0 || selectedKeys.size > 0) && <div className={`mail-selection-toolbar ${selectedKeys.size ? "has-selection" : ""} flex flex-wrap items-center gap-2 border-b border-kumo-line px-4 py-2`}>
			<label className="flex items-center gap-2 text-sm text-kumo-subtle"><input type="checkbox" aria-label="Select all visible messages" checked={allVisibleSelected} onChange={() => setSelectedKeys((current) => { const next = new Set(current); if (allVisibleSelected) visibleKeys.forEach((key) => next.delete(key)); else visibleKeys.forEach((key) => next.add(key)); return next; })} />{selectedKeys.size ? `${selectedKeys.size} selected` : "Select visible"}</label>
			{selectedKeys.size > 0 && <div className="ml-auto flex flex-wrap items-center gap-1">
				{folder !== Folders.ARCHIVE && folder !== Folders.TRASH && <Button variant="ghost" size="sm" icon={<ArchiveIcon size={16} />} disabled={busy} onClick={() => runBulk("archive")}>Archive</Button>}
				<Button variant="ghost" size="sm" icon={<EnvelopeOpenIcon size={16} />} disabled={busy} onClick={() => runBulk("read")}>Mark read</Button>
				<Button variant="ghost" size="sm" icon={<EnvelopeSimpleIcon size={16} />} disabled={busy} onClick={() => runBulk("unread")}>Mark unread</Button>
				<Button variant="ghost" size="sm" icon={<TrashIcon size={16} />} disabled={busy} onClick={() => runBulk("delete")}>Delete</Button>
				<Button variant="ghost" size="sm" onClick={() => setSelectedKeys(new Set())}>Clear</Button>
			</div>}
		</div>}
		{hasError && <p role="alert" className="border-b border-kumo-line px-4 py-2 text-sm text-kumo-destructive">Some accounts could not be searched or loaded. Refresh to try again.</p>}
		{error && <p role="alert" className="border-b border-kumo-line px-4 py-2 text-sm text-kumo-destructive">{error}</p>}
		<div className="mail-message-scroll min-h-0 flex-1 overflow-y-auto">
			{isLoading && loaded.length === 0 ? <p className="p-8 text-sm text-kumo-subtle">Loading messages…</p> : visibleEmails.length === 0 ? <div className="flex flex-col items-center justify-center px-6 py-16 text-center text-kumo-subtle"><TrayIcon size={32} weight="thin" /><p className="mt-2 text-sm">{searching ? "No matching messages" : "No messages yet"}</p></div> : visibleEmails.map((email) => {
				const unread = email.thread_unread_count !== undefined ? email.thread_unread_count > 0 : !email.read;
				const emailFolder = folder === "activity" || searching ? email.folder_id || "inbox" : folder;
				const sender = folder === "sent" || folder === "draft" ? email.recipient : email.sender;
				return <div key={keyOf(email)} className={`mail-message-row ${unread ? "is-unread" : ""} ${selectedKeys.has(keyOf(email)) ? "is-checked" : ""}`}>
					<input type="checkbox" aria-label={`Select ${email.subject || "message"} in ${email.mailboxId}`} checked={selectedKeys.has(keyOf(email))} onChange={() => setSelectedKeys((current) => { const next = new Set(current); const key = keyOf(email); if (next.has(key)) next.delete(key); else next.add(key); return next; })} className="mail-row-checkbox" />
					<button type="button" onClick={() => onSelect({ id: email.id, mailboxId: email.mailboxId, folder: emailFolder }, visibleEmails.map((item) => ({ id: item.id, mailboxId: item.mailboxId, folder: folder === "activity" || searching ? item.folder_id || "inbox" : folder })))} className="mail-message-open flex min-w-0 flex-1 items-start gap-4 text-left">
						<SenderAvatar sender={sender} />
						<span className="min-w-0 flex-1">
							<span className="flex min-w-0 items-center gap-2"><span className="mail-message-sender truncate">{senderName(sender)}</span>{(email.thread_count ?? 1) > 1 && <span className="text-xs text-kumo-subtle">{email.thread_count}</span>}<span className="mail-message-date ml-auto shrink-0">{formatListDate(email.date)}</span></span>
							<span className="mail-message-subject block truncate">{email.subject || "(no subject)"}</span>
							<span className="mail-message-snippet block truncate">{getSnippetText(email.snippet)}</span>
							<span className="mail-message-account block truncate">{email.mailboxId}{(folder === "activity" || searching) ? ` · ${getFolderDisplayName(emailFolder)}` : ""}</span>
						</span>
					</button>
					<EmailStarButton mailboxId={email.mailboxId} id={email.id} starred={email.starred} />
				</div>;
			})}
			{hasMore && <div ref={loadMoreRef} className="p-4 text-center"><Button variant="secondary" size="sm" disabled={isLoading} onClick={() => setPages((value) => value + 1)}>{isLoading ? "Loading…" : "Load older messages"}</Button></div>}
		</div>
	</section>;
}
