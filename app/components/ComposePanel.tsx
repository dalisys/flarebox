// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Banner } from "@cloudflare/kumo";
import { ArrowLeftIcon, CaretDownIcon, DotsThreeVerticalIcon, FloppyDiskIcon, PaperPlaneTiltIcon, TextAaIcon, TrashIcon } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { useParams } from "react-router";
import { useComposeForm } from "~/hooks/useComposeForm";
import RichTextEditor from "./RichTextEditor";

export default function ComposePanel({ mailboxId: mailboxOverride }: { mailboxId?: string } = {}) {
	const { mailboxId: routeMailboxId, folder } = useParams<{
		mailboxId: string;
		folder: string;
	}>();

	const {
		to,
		setTo,
		cc,
		setCc,
		bcc,
		setBcc,
		showCcBcc,
		setShowCcBcc,
		subject,
		setSubject,
		body,
		setBody,
		error,
		isSavingDraft,
		isSending,
		formTitle,
		handleSaveDraft,
		handleSend,
		closeCompose,
		closePanel,
		senderMailboxId, setSenderMailboxId, senderLocked, mailboxes,
	} = useComposeForm(mailboxOverride ?? routeMailboxId, folder);

	const fieldId = useId();
	const [showFormatting, setShowFormatting] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);
	const menuButton = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		if (!menuOpen) return;
		const dismiss = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false); };
		const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setMenuOpen(false); menuButton.current?.focus(); } };
		document.addEventListener("pointerdown", dismiss);
		document.addEventListener("keydown", escape);
		return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
	}, [menuOpen]);

	return (
		<form className="mail-composer" aria-label={formTitle} onSubmit={(event) => handleSend(event, closePanel)}>
			<div className="mail-composer-toolbar">
				<button type="button" className="mail-icon-button" aria-label="Close compose" disabled={isSending || isSavingDraft} onClick={closeCompose}><ArrowLeftIcon size={24} /></button>
				<h2 className="sr-only md:not-sr-only md:ml-3 md:text-base md:font-medium">{formTitle}</h2>
				<div className="flex-1" />
				<button type="button" className="mail-icon-button" aria-label="Formatting options" aria-expanded={showFormatting} aria-controls={`${fieldId}-formatting`} aria-pressed={showFormatting} disabled={isSending} onClick={() => setShowFormatting((shown) => !shown)}><TextAaIcon size={24} /></button>
				<button type="submit" className="mail-icon-button mail-composer-send" aria-label={isSending ? "Sending email" : "Send"} disabled={isSending || isSavingDraft || !senderMailboxId} aria-busy={isSending}><PaperPlaneTiltIcon size={25} /></button>
				<div className="relative" ref={menuRef}>
					<button ref={menuButton} type="button" className="mail-icon-button" aria-label="More compose actions" aria-expanded={menuOpen} disabled={isSending} onClick={() => setMenuOpen((shown) => !shown)}><DotsThreeVerticalIcon size={24} /></button>
					{menuOpen && <div className="mail-reader-menu" role="group" aria-label="Compose actions">
						<button type="button" disabled={isSavingDraft || isSending} onClick={() => { setMenuOpen(false); handleSaveDraft(); }}><FloppyDiskIcon size={20} />Save draft</button>
						<button type="button" disabled={isSavingDraft || isSending} onClick={closeCompose}><TrashIcon size={20} />Discard</button>
					</div>}
				</div>
			</div>
			<div className="mail-composer-scroll">
				{error && <div role="alert" className="p-4"><Banner variant="error" text={error} /></div>}
				<div className="mail-compose-field">
					<label htmlFor={`${fieldId}-from`}>From</label>
					<div className="mail-compose-sender">
						<select id={`${fieldId}-from`} aria-label="Send from" value={senderMailboxId} onChange={(event) => setSenderMailboxId(event.target.value)} disabled={senderLocked || isSending}>
							{mailboxes.filter((mailbox) => !mailbox.retired || mailbox.id === senderMailboxId).map((mailbox) => <option key={mailbox.id} value={mailbox.id}>{mailbox.email}</option>)}
						</select>
						{!senderLocked && <CaretDownIcon size={20} aria-hidden="true" />}
					</div>
				</div>
				<div className="mail-compose-field">
					<label htmlFor={`${fieldId}-to`}>To</label>
					<input id={`${fieldId}-to`} type="text" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={to} onChange={(event) => setTo(event.target.value)} disabled={isSending} required />
					<button type="button" className="mail-icon-button" aria-label="CC and BCC" aria-expanded={showCcBcc} aria-controls={`${fieldId}-copies`} disabled={isSending} onClick={() => setShowCcBcc((shown) => !shown)}><CaretDownIcon size={20} className={showCcBcc ? "rotate-180" : ""} /></button>
				</div>
				<div id={`${fieldId}-copies`} hidden={!showCcBcc}>
					<div className="mail-compose-field"><label htmlFor={`${fieldId}-cc`}>Cc</label><input id={`${fieldId}-cc`} type="text" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={cc} onChange={(event) => setCc(event.target.value)} disabled={isSending} /></div>
					<div className="mail-compose-field"><label htmlFor={`${fieldId}-bcc`}>Bcc</label><input id={`${fieldId}-bcc`} type="text" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={bcc} onChange={(event) => setBcc(event.target.value)} disabled={isSending} /></div>
				</div>
				<div className="mail-compose-field mail-compose-subject"><label className="sr-only" htmlFor={`${fieldId}-subject`}>Subject</label><input id={`${fieldId}-subject`} type="text" placeholder="Subject" value={subject} onChange={(event) => setSubject(event.target.value)} disabled={isSending} required /></div>
				<RichTextEditor value={body} onChange={setBody} variant="compose" showToolbar={showFormatting} toolbarId={`${fieldId}-formatting`} disabled={isSending} />
				<p className="sr-only" role="status" aria-live="polite">{isSavingDraft ? "Saving draft" : isSending ? "Sending email" : ""}</p>
			</div>
		</form>
	);
}
