import { Button, Input } from "@cloudflare/kumo";
import { ArrowRightIcon, CaretRightIcon, DownloadSimpleIcon, EnvelopeSimpleIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import MailboxPreferences from "~/components/MailboxPreferences";
import MailImportPanel from "~/components/MailImportPanel";
import api from "~/services/api";
import type { Mailbox } from "~/types";

type Action = "change" | "move" | "export";

export default function AccountSettingsPanel({ mailbox, mailboxes, domains, onChanged, onNotice }: {
	mailbox: Mailbox;
	mailboxes: Mailbox[];
	domains: string[];
	onChanged: (nextAccount?: string) => Promise<void>;
	onNotice: (message: string) => void;
}) {
	const targets = mailboxes.filter((item) => item.id !== mailbox.id && !item.retired);
	const lockedAction = mailbox.operation?.mode === "export" ? "export" : mailbox.operation?.mode === "move" ? "move" : null;
	const [action, setAction] = useState<Action>(lockedAction ?? "change");
	const [replacement, setReplacement] = useState("");
	const [target, setTarget] = useState(mailbox.operation?.mode === "move" ? mailbox.operation.target : targets[0]?.id ?? "");
	const [busy, setBusy] = useState(false);
	const [moved, setMoved] = useState(0);
	const [downloadStarted, setDownloadStarted] = useState(false);
	const [savedArchive, setSavedArchive] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [feedback, setFeedback] = useState<string | null>(null);
	const currentAction = lockedAction ?? action;

	useEffect(() => {
		if (mailbox.operation?.mode === "move") setTarget(mailbox.operation.target);
		else if (!targets.some((item) => item.id === target)) setTarget(targets[0]?.id ?? "");
	}, [mailbox.operation, mailboxes, target]);

	const move = async (destination: string) => {
		const retired = await api.retireMailbox(mailbox.id, { mode: "move", target: destination });
		await onChanged(mailbox.id);
		let cursor: string | undefined;
		let processed = 0;
		while (true) {
			const result = await api.moveMailbox(mailbox.id, destination, cursor);
			processed += result.copied;
			setMoved(processed);
			if (result.done) break;
			if (!result.cursor || result.cursor === cursor) throw new Error("The transfer stopped. Run it again to resume.");
			cursor = result.cursor;
		}
		await onChanged(destination);
		onNotice(`${mailbox.email} was moved to ${destination}.${retired.ruleCleanup === "manual" ? " Remove the old address rule in Cloudflare." : ""}`);
	};

	const handleMove = async () => {
		setBusy(true);
		setMoved(0);
		setError(null);
		setFeedback(null);
		let destination = target;
		try {
			if (currentAction === "change") {
				destination = replacement.trim().toLowerCase();
				if (!domains.includes(destination.split("@")[1])) throw new Error("Add the new address’s domain in Settings first.");
				if (destination === mailbox.id) throw new Error("Enter an address different from the current one.");
				if (mailboxes.some((item) => item.id === destination)) throw new Error("That address already exists. Choose Move into an existing account below.");
				const created = await api.createMailbox(destination, mailbox.settings?.fromName || destination.split("@")[0]);
				await onChanged(mailbox.id);
				if (created.routing !== "active") {
					setAction("move");
					setTarget(destination);
					setFeedback(`${destination} was created. Set up its Cloudflare Email Routing rule, then move the mail from this page. The old address is still active.`);
					return;
				}
			}
			if (!destination) throw new Error("Choose an account to receive the mail.");
			await move(destination);
		} catch (cause) {
			try {
				const remaining = await api.listMailboxes();
				if (!remaining.some((item) => item.id === mailbox.id)) {
					await onChanged(destination);
					onNotice(`${mailbox.email} was moved to ${destination}.`);
					return;
				}
			} catch { /* Show the original error. */ }
			setError(cause instanceof Error ? cause.message : "The transfer stopped. Run it again to resume.");
		} finally { setBusy(false); }
	};

	const prepareExport = async () => {
		setBusy(true);
		setError(null);
		try {
			const result = await api.retireMailbox(mailbox.id, { mode: "export" });
			await onChanged(mailbox.id);
			setFeedback(result.ruleCleanup === "manual" ? "The account has stopped receiving in the app. Remove its address rule in Cloudflare." : "The account has stopped receiving. Download the archive before deleting its stored mail.");
		} catch (cause) { setError(cause instanceof Error ? cause.message : "Could not prepare the export."); }
		finally { setBusy(false); }
	};

	const finishDelete = async () => {
		if (!savedArchive) return;
		setBusy(true);
		setError(null);
		try {
			await api.finalizeMailboxDelete(mailbox.id);
			await onChanged();
			onNotice(`${mailbox.email} and its stored mail were deleted.`);
		} catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete the account."); }
		finally { setBusy(false); }
	};

	return <div className="space-y-8">
		<div className="border-b border-kumo-line pb-6">
			<div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-kumo-subtle"><EnvelopeSimpleIcon size={15} /> Account</div>
			<h2 className="break-all text-2xl font-semibold tracking-tight text-kumo-default md:text-3xl">{mailbox.email}</h2>
			<p className="mt-2 text-sm text-kumo-subtle">{mailbox.retired ? "Mail delivery stopped · Finish the transfer below" : `Active address on ${mailbox.email.split("@")[1]}`}</p>
			{!mailbox.retired && <Link className="mt-4 inline-flex items-center gap-1 rounded-md border border-kumo-line px-3 py-1.5 text-sm text-kumo-default hover:bg-kumo-tint" to={`/mailbox/${encodeURIComponent(mailbox.id)}/emails/inbox`}>Open inbox <ArrowRightIcon size={15} /></Link>}
		</div>

		{!mailbox.retired && <MailboxPreferences mailboxIdOverride={mailbox.id} embedded />}

		{!mailbox.retired && <MailImportPanel mailboxId={mailbox.id} />}

		<details open={mailbox.retired || Boolean(lockedAction)} className="group max-w-2xl rounded-lg border border-kumo-line">
			<summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden"><CaretRightIcon size={14} className="text-kumo-subtle transition-transform group-open:rotate-90" /><span><span className="block text-sm font-semibold text-kumo-default">Change, move, or remove this address</span><span className="mt-0.5 block text-xs text-kumo-subtle">Rename the address, merge it into another account, or download and delete its mail.</span></span></summary>
			<div className="space-y-5 border-t border-kumo-line p-5">
			<div className="overflow-hidden rounded-lg border border-kumo-line bg-kumo-base">
				{([
					{ value: "change", label: "Change to a new address", description: "Create a replacement address and move the mail there." },
					{ value: "move", label: "Move into an existing account", description: "Keep the mail in another account and remove this address." },
					{ value: "export", label: "Download archive and remove", description: "Save a copy of the mail, then delete this account." },
				] as const).map((option) => <label key={option.value} className={`flex cursor-pointer items-start gap-3 border-b border-kumo-line px-4 py-4 last:border-b-0 ${currentAction === option.value ? "bg-kumo-tint" : "hover:bg-kumo-recessed"} ${lockedAction && lockedAction !== option.value ? "cursor-not-allowed opacity-50" : ""}`}>
					<input type="radio" name={`account-action-${mailbox.id}`} value={option.value} checked={currentAction === option.value} disabled={busy || Boolean(lockedAction && lockedAction !== option.value)} onChange={() => { setAction(option.value); setError(null); setFeedback(null); }} className="mt-1" />
					<span><span className="block text-sm font-medium text-kumo-default">{option.label}</span><span className="mt-0.5 block text-xs text-kumo-subtle">{option.description}</span></span>
				</label>)}
			</div>
			{lockedAction && <p className="text-sm text-kumo-subtle">This {lockedAction === "move" ? "move" : "export"} is in progress. Complete it before choosing another option.</p>}
			<div className="rounded-lg border border-kumo-line bg-kumo-recessed p-5">
				{currentAction === "change" && <div className="space-y-4"><Input label="New email address" type="email" placeholder="hello@example.com" value={replacement} onChange={(event) => setReplacement(event.target.value)} required /><p className="text-sm text-kumo-subtle">The new account is created first. Messages, folders, and attachments are moved, then {mailbox.email} is removed.</p><Button variant="primary" disabled={busy || !replacement.trim()} onClick={handleMove}>{busy ? `Moving mail… ${moved} processed` : "Change address"}</Button></div>}
				{currentAction === "move" && <div className="space-y-4"><label className="block text-sm font-medium text-kumo-default">Destination account<select className="mt-2 block w-full rounded-md border border-kumo-line bg-kumo-base px-3 py-2 text-sm" value={target} disabled={busy || Boolean(mailbox.operation)} onChange={(event) => setTarget(event.target.value)}>{targets.map((item) => <option key={item.id} value={item.id}>{item.email}</option>)}</select></label>{targets.length === 0 && <p className="text-sm text-kumo-subtle">Add another account first, then return here to move the mail.</p>}<p className="text-sm text-kumo-subtle">The destination keeps its own settings. Messages, folders, and attachments move with the mail.</p><Button variant="primary" disabled={busy || !target || !targets.some((item) => item.id === target)} onClick={handleMove}>{busy ? `Moving mail… ${moved} processed` : mailbox.operation ? "Resume move" : "Move mail and remove address"}</Button></div>}
				{currentAction === "export" && <div className="space-y-4"><p className="text-sm text-kumo-default">The archive includes account settings, messages, folders, and attachments. Delivery stops when you prepare the export.</p>{!mailbox.retired && <Button variant="primary" disabled={busy} onClick={prepareExport}>Prepare export</Button>}{mailbox.retired && <div className="space-y-4"><a className="inline-flex items-center gap-2 rounded-md border border-kumo-line bg-kumo-base px-3 py-2 text-sm font-medium text-kumo-default hover:bg-kumo-tint" href={api.mailboxExportUrl(mailbox.id)} onClick={() => setDownloadStarted(true)}><DownloadSimpleIcon size={17} /> Download mail archive</a>{downloadStarted && <label className="flex items-start gap-2 text-sm text-kumo-default"><input type="checkbox" className="mt-1" checked={savedArchive} onChange={(event) => setSavedArchive(event.target.checked)} />I downloaded and saved the complete archive.</label>}<div className="border-t border-kumo-line pt-4"><p className="mb-3 text-sm text-kumo-subtle">Deletion removes this account and its stored mail. Keep the downloaded archive somewhere safe.</p><Button variant="secondary" disabled={busy || !savedArchive} onClick={finishDelete}>Delete account and stored mail</Button></div></div>}</div>}
			</div>
			{error && <p role="alert" className="text-sm text-red-600">{error}</p>}
			{feedback && <p role="status" className="text-sm text-kumo-default">{feedback}</p>}
			</div>
		</details>
	</div>;
}
