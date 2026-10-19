// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Dialog, Input } from "@cloudflare/kumo";
import { SlidersHorizontalIcon, XIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { getFolderDisplayName, SYSTEM_FOLDER_IDS } from "shared/folders";
import { buildSearchQuery, parseSearchQuery, type ParsedSearch } from "~/lib/search-parser";
import { useFolders } from "~/queries/folders";

export default function AdvancedSearch({ query, mailboxId, onApply, compact = false }: {
	query: string;
	mailboxId?: string;
	onApply: (query: string) => void;
	compact?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const [filters, setFilters] = useState<ParsedSearch>({ query: "" });
	const [error, setError] = useState("");
	const { data: folders = [] } = useFolders(mailboxId, open);
	const folderOptions = folders.length ? folders : SYSTEM_FOLDER_IDS.map((id) => ({ id, name: id }));
	const update = <K extends keyof ParsedSearch>(key: K, value: ParsedSearch[K]) => {
		setFilters((current) => ({ ...current, [key]: value }));
		setError("");
	};
	const selectClass = "min-h-11 min-w-0 max-w-full w-full rounded-md border border-kumo-line bg-kumo-base px-3 py-2 text-base sm:text-sm text-kumo-default";
	const booleanSelect = (label: string, key: "is_read" | "is_starred" | "has_attachment", yes: string, no: string) => (
		<label className="min-w-0 space-y-1.5 text-sm text-kumo-strong">
			<span className="block font-medium">{label}</span>
			<select className={selectClass} value={filters[key] === undefined ? "" : String(filters[key])} onChange={(event) => update(key, event.target.value === "" ? undefined : event.target.value === "true")}>
				<option value="">Any</option><option value="true">{yes}</option><option value="false">{no}</option>
			</select>
		</label>
	);
	const textInput = (label: string, key: "query" | "from" | "to" | "subject" | "filename", placeholder: string) => (
		<label className="min-w-0 space-y-1.5 text-sm text-kumo-strong">
			<span className="block font-medium">{label}</span>
			<Input aria-label={label} className="w-full min-w-0 max-w-full min-h-11 text-base sm:text-sm" value={filters[key] ?? ""} placeholder={placeholder} onChange={(event) => update(key, event.target.value)} />
		</label>
	);

	return <>
		<Button type="button" variant="ghost" size="sm" className={compact ? "mail-icon-button shrink-0" : "min-h-11 shrink-0"} shape={compact ? "square" : undefined} icon={<SlidersHorizontalIcon size={20} />} aria-label="Advanced search" onClick={() => { setFilters(parseSearchQuery(query)); setError(""); setOpen(true); }}>{compact ? null : "Filters"}</Button>
		<Dialog.Root open={open} onOpenChange={setOpen}>
			<Dialog className="flex flex-col overflow-hidden p-0" style={{ minWidth: 0, width: "calc(100vw - 2rem)", maxWidth: "48rem", maxHeight: "calc(100dvh - 2rem)" }}>
				<div className="flex shrink-0 items-center justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-6">
					<Dialog.Title className="text-lg font-semibold">Advanced search</Dialog.Title>
					<Button variant="ghost" shape="square" size="sm" icon={<XIcon size={18} />} className="min-h-11 min-w-11 shrink-0" aria-label="Close advanced search" onClick={() => setOpen(false)} />
				</div>
				<p className="shrink-0 px-4 pb-4 pt-2 text-sm text-kumo-subtle sm:px-6">Match all selected filters across the full mailbox history.</p>
				<form className="flex min-h-0 flex-col" onSubmit={(event) => {
					event.preventDefault();
					event.stopPropagation();
					if (filters.date_start && filters.date_end && filters.date_start > filters.date_end) { setError("The start date must be on or before the end date."); return; }
					onApply(buildSearchQuery({ ...filters, folder: filters.folder ?? "activity" })); setOpen(false);
				}}>
					<div className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-6">
						<div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
							{textInput("Contains text", "query", "Subject, sender, recipients, or message body")}
							{textInput("Subject", "subject", "Words in the subject")}
							{textInput("From", "from", "Sender name or email")}
							{textInput("To / Cc / Bcc", "to", "Recipient name or email")}
							<label className="min-w-0 space-y-1.5 text-sm text-kumo-strong"><span className="block font-medium">Folder</span>
								<select className={selectClass} value={filters.folder ?? "activity"} onChange={(event) => update("folder", event.target.value)}>
									<option value="activity">All folders</option>
									{filters.folder && filters.folder !== "activity" && !folderOptions.some((folder) => folder.id === filters.folder || folder.name === filters.folder) && <option value={filters.folder}>{getFolderDisplayName(filters.folder)}</option>}
									{folderOptions.map((folder) => <option key={folder.id} value={folder.id}>{getFolderDisplayName(folder.name)}</option>)}
								</select>
							</label>
							{textInput("Attachment filename", "filename", "Filename or extension, e.g. .pdf")}
							<label className="min-w-0 space-y-1.5 text-sm text-kumo-strong"><span className="block font-medium">On or after (UTC)</span><Input className="w-full min-w-0 max-w-full min-h-11 text-base sm:text-sm" type="date" aria-label="On or after (UTC)" value={filters.date_start?.slice(0, 10) ?? ""} onChange={(event) => update("date_start", event.target.value ? `${event.target.value}T00:00:00.000Z` : undefined)} onInput={(event) => update("date_start", event.currentTarget.value ? `${event.currentTarget.value}T00:00:00.000Z` : undefined)} /></label>
							<label className="min-w-0 space-y-1.5 text-sm text-kumo-strong"><span className="block font-medium">On or before (UTC)</span><Input className="w-full min-w-0 max-w-full min-h-11 text-base sm:text-sm" type="date" aria-label="On or before (UTC)" value={filters.date_end?.slice(0, 10) ?? ""} onChange={(event) => update("date_end", event.target.value ? `${event.target.value}T23:59:59.999Z` : undefined)} onInput={(event) => update("date_end", event.currentTarget.value ? `${event.currentTarget.value}T23:59:59.999Z` : undefined)} /></label>
							{booleanSelect("Read status", "is_read", "Read", "Unread")}
							{booleanSelect("Starred status", "is_starred", "Starred", "Not starred")}
							{booleanSelect("Attachments", "has_attachment", "Has attachments", "No attachments")}
						</div>
						<p className="mt-4 text-xs text-kumo-subtle">You can also type filters: from:name, subject:"monthly report", is:unread, has:attachment, filename:pdf.</p>
						{error && <p role="alert" className="mt-3 text-sm text-kumo-destructive">{error}</p>}
					</div>
					<div className="flex shrink-0 items-center justify-between gap-3 border-t border-kumo-line bg-kumo-base px-4 py-3 sm:px-6">
						<Button type="button" variant="ghost" className="min-h-11" onClick={() => { setFilters({ query: "" }); setError(""); }}>Reset filters</Button>
						<Button type="submit" variant="primary" className="min-h-11 min-w-24">Search</Button>
					</div>
				</form>
			</Dialog>
		</Dialog.Root>
	</>;
}
