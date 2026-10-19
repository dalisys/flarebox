import { ArrowBendUpLeftIcon, ArrowBendUpRightIcon, ArrowLeftIcon, ArchiveIcon, DotsThreeVerticalIcon, EnvelopeOpenIcon, EnvelopeSimpleIcon, PaperPlaneTiltIcon, PencilSimpleIcon, TrashIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
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
	const action = (callback: () => void) => { setOpen(false); callback(); };
	return <div className="mail-reader-toolbar">
		<button type="button" className="mail-icon-button" aria-label="Back to list" onClick={props.onBack}><ArrowLeftIcon size={24} /></button>
		<div className="flex-1" />
		{props.isDraftFolder ? <>
			<button type="button" className="mail-icon-button" aria-label="Send draft" disabled={props.isSending} onClick={props.onSendDraft}><PaperPlaneTiltIcon size={22} /></button>
			<button type="button" className="mail-icon-button" aria-label="Edit draft" onClick={props.onEditDraft}><PencilSimpleIcon size={22} /></button>
		</> : props.email.folder_id !== "archive" && <button type="button" className="mail-icon-button" aria-label="Archive" onClick={() => props.onMove("archive")}><ArchiveIcon size={22} /></button>}
		<button type="button" className="mail-icon-button" aria-label="Delete" onClick={props.onDelete}><TrashIcon size={22} /></button>
		<button type="button" className="mail-icon-button" aria-label={props.email.read ? "Mark as unread" : "Mark as read"} onClick={props.onToggleRead}>{props.email.read ? <EnvelopeSimpleIcon size={22} /> : <EnvelopeOpenIcon size={22} />}</button>
		<div ref={menu} className="relative">
			<button ref={trigger} type="button" className="mail-icon-button" aria-label="More email actions" aria-expanded={open} onClick={() => setOpen((value) => !value)}><DotsThreeVerticalIcon size={24} /></button>
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
