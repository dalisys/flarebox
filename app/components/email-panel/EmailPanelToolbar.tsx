import { ArrowBendUpLeftIcon, ArrowBendUpRightIcon, ArrowLeftIcon, ArchiveIcon, ClockCountdownIcon, ClockIcon, DotsThreeVerticalIcon, EnvelopeOpenIcon, EnvelopeSimpleIcon, PaperPlaneTiltIcon, PencilSimpleIcon, TrashIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Folders } from "shared/folders";
import { canSnooze } from "shared/snooze";
import SnoozeMenu from "~/components/SnoozeMenu";
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
}

// Close a popup on outside tap or Escape.
function useDismiss(open: boolean, close: () => void, box: RefObject<HTMLElement | null>, trigger: RefObject<HTMLElement | null>) {
	useEffect(() => {
		if (!open) return;
		const dismiss = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close(); };
		const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { close(); trigger.current?.focus(); } };
		document.addEventListener("mousedown", dismiss);
		document.addEventListener("keydown", escape);
		return () => { document.removeEventListener("mousedown", dismiss); document.removeEventListener("keydown", escape); };
	}, [open]); // eslint-disable-line react-hooks/exhaustive-deps
}

export default function EmailPanelToolbar(props: EmailPanelToolbarProps) {
	const [open, setOpen] = useState(false);
	const menu = useRef<HTMLDivElement>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	useDismiss(open, () => setOpen(false), menu, trigger);
	const [snoozeOpen, setSnoozeOpen] = useState(false);
	const snoozeBox = useRef<HTMLDivElement>(null);
	const snoozeTrigger = useRef<HTMLButtonElement>(null);
	useDismiss(snoozeOpen, () => setSnoozeOpen(false), snoozeBox, snoozeTrigger);
	const folderId = props.email.folder_id || Folders.INBOX;
	const action = (callback: () => void) => { setOpen(false); callback(); };
	return <div className="mail-reader-toolbar">
		<button type="button" className="mail-icon-button" aria-label="Back to list" onClick={props.onBack}><ArrowLeftIcon size={24} /></button>
		<div className="flex-1" />
		{props.isDraftFolder ? <>
			<button type="button" className="mail-icon-button" aria-label="Send draft" disabled={props.isSending} onClick={props.onSendDraft}><PaperPlaneTiltIcon size={22} /></button>
			<button type="button" className="mail-icon-button" aria-label="Edit draft" onClick={props.onEditDraft}><PencilSimpleIcon size={22} /></button>
		</> : props.email.folder_id !== "archive" && <button type="button" className="mail-icon-button" aria-label="Archive" onClick={() => props.onMove("archive")}><ArchiveIcon size={22} /></button>}
		{folderId === Folders.SNOOZED
			? <button type="button" className="mail-icon-button" aria-label="Unsnooze" title="Unsnooze" disabled={props.isSnoozing} onClick={() => props.onSnooze(null)}><ClockCountdownIcon size={22} /></button>
			: !props.isDraftFolder && canSnooze(folderId) && <button ref={snoozeTrigger} type="button" className="mail-icon-button" aria-label="Snooze" title="Snooze" aria-expanded={snoozeOpen} onClick={() => { setOpen(false); setSnoozeOpen((value) => !value); }}><ClockIcon size={22} /></button>}
		{snoozeOpen && <div ref={snoozeBox} className="mail-snooze-popover"><SnoozeMenu disabled={props.isSnoozing} onPick={(until) => { setSnoozeOpen(false); props.onSnooze(until); }} /></div>}
		<button type="button" className="mail-icon-button" aria-label="Delete" onClick={props.onDelete}><TrashIcon size={22} /></button>
		<button type="button" className="mail-icon-button" aria-label={props.email.read ? "Mark as unread" : "Mark as read"} onClick={props.onToggleRead}>{props.email.read ? <EnvelopeSimpleIcon size={22} /> : <EnvelopeOpenIcon size={22} />}</button>
		<div ref={menu} className="relative">
			<button ref={trigger} type="button" className="mail-icon-button" aria-label="More email actions" aria-expanded={open} onClick={() => { setSnoozeOpen(false); setOpen((value) => !value); }}><DotsThreeVerticalIcon size={24} /></button>
			{open && <div className="mail-reader-menu" role="group" aria-label="More email actions">
				{!props.isDraftFolder && <><button type="button" onClick={() => action(props.onReply)}><ArrowBendUpLeftIcon size={18} />Reply</button><button type="button" onClick={() => action(props.onReplyAll)}>Reply all</button><button type="button" onClick={() => action(props.onForward)}><ArrowBendUpRightIcon size={18} />Forward</button></>}
				<label className="block px-3 py-2 text-xs text-kumo-subtle">Move to<select aria-label="Move to folder" value="" onChange={(event) => { if (event.target.value) action(() => props.onMove(event.target.value)); }} className="mt-1 block w-full rounded border border-kumo-line bg-kumo-elevated p-2 text-sm text-kumo-default"><option value="" disabled>Choose a folder</option>{props.moveToFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
				{!props.isDraftFolder && props.email.folder_id !== "sent" && <button type="button" disabled={props.isMarkingSpam} onClick={() => action(props.onMarkSpam)}>Mark as spam</button>}
				{props.email.folder_id === "spam" && <button type="button" disabled={props.isMarkingNotSpam} onClick={() => action(props.onMarkNotSpam)}>Not spam</button>}
				<button type="button" onClick={() => action(props.onViewSource)}>View source</button>
			</div>}
		</div>
		<button type="button" className="mail-icon-button hidden md:inline-flex" aria-label="Close message" onClick={props.onBack}><XIcon size={22} /></button>
	</div>;
}
