import { Tooltip } from "@cloudflare/kumo";
import { ArrowBendDoubleUpLeftIcon, ArrowBendUpLeftIcon, ArrowBendUpRightIcon, ArrowLeftIcon, ArchiveIcon, ClockCountdownIcon, ClockIcon, CodeIcon, DotsThreeVerticalIcon, FolderSimpleIcon, ShieldCheckIcon, WarningOctagonIcon, XCircleIcon, EnvelopeOpenIcon, EnvelopeSimpleIcon, PaperPlaneTiltIcon, PencilSimpleIcon, TrashIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { Folders } from "shared/folders";
import { canSnooze, snoozePresets } from "shared/schedule-time";
import DateTimePicker from "~/components/DateTimePicker";
import type { Email, Folder } from "~/types";

interface EmailPanelToolbarProps {
	email: Email;
	mailboxId?: string;
	isDraftFolder: boolean;
	isSending: boolean;
	isMarkingSpam: boolean;
	onMarkSpam: () => void;
	isMarkingNotSpam: boolean;
	moveToFolders: Folder[];
	lastReceivedMessage?: Email;
	onBack: () => void;
	onSendDraft: () => void;
	onEditDraft: () => void;
	onReply: () => void;
	onReplyAll: () => void;
	onForward: () => void;
	onToggleStar: () => void;
	onToggleRead: () => void;
	onMove: (folderId: string) => void;
	onMarkNotSpam: () => void;
	onViewSource: () => void;
	onDelete: () => void;
	/** A UTC ISO time snoozes the conversation; null unsnoozes it. */
	onSnooze: (until: string | null) => void;
	isSnoozing: boolean;
	onSendScheduledNow: () => void;
	onCancelScheduled: () => void;
	isScheduleBusy: boolean;
}

export default function EmailPanelToolbar(props: EmailPanelToolbarProps) {
	const [open, setOpen] = useState(false);
	const menu = useRef<HTMLDivElement>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		if (!open) return;
		const dismiss = (event: MouseEvent) => { if (!menu.current?.contains(event.target as Node)) setOpen(false); };
		const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
		document.addEventListener("mousedown", dismiss);
		document.addEventListener("keydown", escape);
		return () => { document.removeEventListener("mousedown", dismiss); document.removeEventListener("keydown", escape); };
	}, [open]);
	const [snoozeOpen, setSnoozeOpen] = useState(false);
	const snoozeTrigger = useRef<HTMLButtonElement>(null);
	const folderId = props.email.folder_id || Folders.INBOX;
	const action = (callback: () => void) => { setOpen(false); callback(); };
	const isSpam = folderId === Folders.SPAM;
	const canMarkSpam = !props.isDraftFolder && !isSpam && folderId !== Folders.SENT;
	// Every icon gets a hover label. Desktop-only icons replace the ⋮ menu, which stays for phones.
	const tip = (label: string, button: ReactElement) => <Tooltip content={label} side="bottom" asChild>{button}</Tooltip>;
	return <div className="mail-reader-toolbar">
		{tip("Back to list", <button type="button" className="mail-icon-button" aria-label="Back to list" onClick={props.onBack}><ArrowLeftIcon size={24} /></button>)}
		<div className="flex-1" />
		{!props.isDraftFolder && <>
			{tip("Reply", <button type="button" className="mail-icon-button hidden md:inline-flex" aria-label="Reply" onClick={props.onReply}><ArrowBendUpLeftIcon size={22} /></button>)}
			{tip("Reply all", <button type="button" className="mail-icon-button hidden md:inline-flex" aria-label="Reply all" onClick={props.onReplyAll}><ArrowBendDoubleUpLeftIcon size={22} /></button>)}
			{tip("Forward", <button type="button" className="mail-icon-button hidden md:inline-flex" aria-label="Forward" onClick={props.onForward}><ArrowBendUpRightIcon size={22} /></button>)}
		</>}
		{props.isDraftFolder ? <>
			{tip("Send draft", <button type="button" className="mail-icon-button" aria-label="Send draft" disabled={props.isSending} onClick={props.onSendDraft}><PaperPlaneTiltIcon size={22} /></button>)}
			{tip("Edit draft", <button type="button" className="mail-icon-button" aria-label="Edit draft" onClick={props.onEditDraft}><PencilSimpleIcon size={22} /></button>)}
		</> : folderId !== Folders.ARCHIVE && folderId !== Folders.SCHEDULED && tip("Archive", <button type="button" className="mail-icon-button" aria-label="Archive" onClick={() => props.onMove("archive")}><ArchiveIcon size={22} /></button>)}
		{folderId === Folders.SCHEDULED && <>
			{tip("Send now", <button type="button" className="mail-icon-button" aria-label="Send now" disabled={props.isScheduleBusy} onClick={props.onSendScheduledNow}><PaperPlaneTiltIcon size={22} /></button>)}
			{tip("Cancel send (back to Drafts)", <button type="button" className="mail-icon-button" aria-label="Cancel scheduled send" disabled={props.isScheduleBusy} onClick={props.onCancelScheduled}><XCircleIcon size={22} /></button>)}
		</>}
		{folderId === Folders.SNOOZED
			? tip("Unsnooze", <button type="button" className="mail-icon-button" aria-label="Unsnooze" disabled={props.isSnoozing} onClick={() => props.onSnooze(null)}><ClockCountdownIcon size={22} /></button>)
			: !props.isDraftFolder && canSnooze(folderId) && tip("Snooze", <button ref={snoozeTrigger} type="button" className="mail-icon-button" aria-label="Snooze" aria-expanded={snoozeOpen} onClick={() => { setOpen(false); setSnoozeOpen((value) => !value); }}><ClockIcon size={22} /></button>)}
		{snoozeOpen && <DateTimePicker title="Snooze until" confirmLabel="Snooze" presets={snoozePresets()} anchor={snoozeTrigger} onClose={() => setSnoozeOpen(false)} onPick={(date) => { setSnoozeOpen(false); props.onSnooze(date.toISOString()); }} />}
		{tip("Delete", <button type="button" className="mail-icon-button" aria-label="Delete" onClick={props.onDelete}><TrashIcon size={22} /></button>)}
		{tip(props.email.read ? "Mark as unread" : "Mark as read", <button type="button" className="mail-icon-button" aria-label={props.email.read ? "Mark as unread" : "Mark as read"} onClick={props.onToggleRead}>{props.email.read ? <EnvelopeSimpleIcon size={22} /> : <EnvelopeOpenIcon size={22} />}</button>)}
		{canMarkSpam && tip("Mark as spam", <button type="button" className="mail-icon-button hidden md:inline-flex" aria-label="Mark as spam" disabled={props.isMarkingSpam} onClick={props.onMarkSpam}><WarningOctagonIcon size={22} /></button>)}
		{isSpam && tip("Not spam", <button type="button" className="mail-icon-button hidden md:inline-flex" aria-label="Not spam" disabled={props.isMarkingNotSpam} onClick={props.onMarkNotSpam}><ShieldCheckIcon size={22} /></button>)}
		{tip("Move to", <label className="mail-icon-button relative hidden cursor-pointer md:inline-flex"><FolderSimpleIcon size={22} /><select aria-label="Move to folder" value="" onChange={(event) => { if (event.target.value) props.onMove(event.target.value); }} className="absolute inset-0 cursor-pointer opacity-0"><option value="" disabled>Move to…</option>{props.moveToFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>)}
		{tip("View source", <button type="button" className="mail-icon-button hidden md:inline-flex" aria-label="View source" onClick={props.onViewSource}><CodeIcon size={22} /></button>)}
		<div ref={menu} className="relative md:hidden">
			<button ref={trigger} type="button" className="mail-icon-button" aria-label="More email actions" aria-expanded={open} onClick={() => { setSnoozeOpen(false); setOpen((value) => !value); }}><DotsThreeVerticalIcon size={24} /></button>
			{open && <div className="mail-reader-menu" role="group" aria-label="More email actions">
				{!props.isDraftFolder && <><button type="button" onClick={() => action(props.onReply)}><ArrowBendUpLeftIcon size={18} />Reply</button><button type="button" onClick={() => action(props.onReplyAll)}>Reply all</button><button type="button" onClick={() => action(props.onForward)}><ArrowBendUpRightIcon size={18} />Forward</button></>}
				<label className="block px-3 py-2 text-xs text-kumo-subtle">Move to<select aria-label="Move to folder" value="" onChange={(event) => { if (event.target.value) action(() => props.onMove(event.target.value)); }} className="mt-1 block w-full rounded border border-kumo-line bg-kumo-elevated p-2 text-sm text-kumo-default"><option value="" disabled>Choose a folder</option>{props.moveToFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
				{canMarkSpam && <button type="button" disabled={props.isMarkingSpam} onClick={() => action(props.onMarkSpam)}>Mark as spam</button>}
				{isSpam && <button type="button" disabled={props.isMarkingNotSpam} onClick={() => action(props.onMarkNotSpam)}>Not spam</button>}
				<button type="button" onClick={() => action(props.onViewSource)}>View source</button>
			</div>}
		</div>
		{tip("Close message", <button type="button" className="mail-icon-button hidden md:inline-flex" aria-label="Close message" onClick={props.onBack}><XIcon size={22} /></button>)}
	</div>;
}
