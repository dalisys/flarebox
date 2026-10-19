import { Dialog } from "@cloudflare/kumo";
import { EnvelopeSimpleIcon, GearSixIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import SenderAvatar from "~/components/SenderAvatar";
import ThemeToggle from "~/components/ThemeToggle";
import { useUIStore } from "~/hooks/useUIStore";
import { useMailboxes } from "~/queries/mailboxes";

export default function AccountSwitcher() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const { data: mailboxes = [], isPending, isError, refetch } = useMailboxes();
	const [open, setOpen] = useState(false);
	const gesture = useRef<{ pointerId: number; x: number; y: number; started: number } | null>(null);
	const suppressClickUntil = useRef(0);
	const navigate = useNavigate();
	const account = mailboxes.find((item) => item.id === mailboxId) ?? mailboxes.find((item) => !item.retired) ?? mailboxes[0];
	const go = (url: string) => {
		setOpen(false);
		useUIStore.getState().closePanel();
		useUIStore.getState().closeSidebar();
		navigate(url);
	};
	const cycleAccount = (direction: 1 | -1) => {
		const accounts = mailboxes.filter((item) => !item.retired);
		if (accounts.length < 2) return;
		const index = accounts.findIndex((item) => item.id === account?.id);
		const next = accounts[((index < 0 ? 0 : index) + direction + accounts.length) % accounts.length];
		go(`/mailbox/${encodeURIComponent(next.id)}/emails/inbox`);
	};
	return <>
		<button
			type="button"
			className="mail-account-trigger"
			aria-label="Switch account"
			aria-description="Tap to choose an account. Swipe up for the next account or down for the previous account."
			aria-haspopup="dialog"
			aria-expanded={open}
			onPointerDown={(event) => {
				if (event.pointerType === "mouse") return;
				if (!event.isPrimary) { gesture.current = null; suppressClickUntil.current = Date.now() + 1000; return; }
				suppressClickUntil.current = 0;
				gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, started: Date.now() };
				event.currentTarget.setPointerCapture(event.pointerId);
			}}
			onPointerCancel={() => { gesture.current = null; suppressClickUntil.current = Date.now() + 1000; }}
			onPointerUp={(event) => {
				const start = gesture.current;
				if (!start || start.pointerId !== event.pointerId) return;
				gesture.current = null;
				const dx = event.clientX - start.x;
				const dy = event.clientY - start.y;
				if (Math.max(Math.abs(dx), Math.abs(dy)) > 10) suppressClickUntil.current = Date.now() + 1000;
				if (Math.abs(dy) >= 28 && Math.abs(dy) > Math.abs(dx) * 1.5 && Date.now() - start.started < 1000) {
					event.preventDefault();
					cycleAccount(dy < 0 ? 1 : -1);
				}
			}}
			onClick={(event) => {
				if (event.detail > 0 && Date.now() < suppressClickUntil.current) { event.preventDefault(); return; }
				setOpen(true);
			}}
			onKeyDown={(event) => {
				if (event.key === "ArrowUp" || event.key === "ArrowDown") {
					event.preventDefault();
					cycleAccount(event.key === "ArrowUp" ? 1 : -1);
				}
			}}
		>
			{account ? <SenderAvatar sender={account.email} /> : <EnvelopeSimpleIcon size={24} />}
		</button>
		<Dialog.Root open={open} onOpenChange={setOpen}>
			<Dialog className="mail-account-dialog" style={{ width: "calc(100vw - 24px)", maxWidth: "420px", maxHeight: "calc(100dvh - 48px)", minWidth: 0, padding: 0 }}>
				<div className="mail-account-dialog-heading"><Dialog.Title className="text-base font-medium">Accounts</Dialog.Title><button type="button" className="mail-icon-button" onClick={() => setOpen(false)} aria-label="Close accounts"><XIcon size={22} /></button></div>
				<div className="mail-account-list">
					<button type="button" className={`mail-account-row ${!mailboxId ? "is-active" : ""}`} onClick={() => go("/")}><EnvelopeSimpleIcon size={24} /><span>All inboxes</span>{!mailboxId && <span className="mail-account-current">Selected</span>}</button>
					{isPending && <p className="p-4 text-sm text-kumo-subtle">Loading accounts…</p>}
					{isError && <button type="button" className="mail-account-row" onClick={() => refetch()}>Could not load accounts. Try again</button>}
					{mailboxes.map((item) => <button key={item.id} type="button" className={`mail-account-row ${mailboxId === item.id ? "is-active" : ""}`} aria-current={mailboxId === item.id ? "true" : undefined} onClick={() => go(`/mailbox/${encodeURIComponent(item.id)}/emails/inbox`)}>
						<SenderAvatar sender={item.email} /><span className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-medium">{item.name || item.email}</span><span className="block truncate text-xs text-kumo-subtle">{item.email}</span>{item.retired && <span className="text-xs text-kumo-subtle">Retired</span>}</span>{mailboxId === item.id && <span className="mail-account-current">Selected</span>}
					</button>)}
				</div>
				<div className="mail-account-footer">
					<button type="button" className="mail-account-row" onClick={() => go("/settings?section=accounts&account=new")}><PlusIcon size={24} /><span>Add another account</span></button>
					<div className="flex items-center"><button type="button" className="mail-account-row flex-1" onClick={() => go(mailboxId ? `/settings?section=accounts&account=${encodeURIComponent(mailboxId)}` : "/settings")}><GearSixIcon size={24} /><span>Settings</span></button><div className="pr-3"><ThemeToggle /></div></div>
				</div>
			</Dialog>
		</Dialog.Root>
	</>;
}
