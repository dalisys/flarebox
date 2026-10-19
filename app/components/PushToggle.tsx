import { Button, Tooltip } from "@cloudflare/kumo";
import { BellIcon, BellSlashIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

// On iPhone, push works only after "Add to Home Screen" (iOS 16.4+).
const supported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const toKey = (value: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export default function PushToggle() {
	const [enabled, setEnabled] = useState(false);
	const [busy, setBusy] = useState(false);
	const [available, setAvailable] = useState(false);

	useEffect(() => {
		if (!supported()) return;
		setAvailable(true);
		navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription()).then((sub) => setEnabled(!!sub)).catch(() => {});
	}, []);

	if (!available) return null;

	const toggle = async () => {
		setBusy(true);
		try {
			const reg = await navigator.serviceWorker.ready;
			const current = await reg.pushManager.getSubscription();
			if (current) {
				await fetch("/api/v1/push/subscriptions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: current.endpoint }) });
				await current.unsubscribe();
				setEnabled(false);
				return;
			}
			if (await Notification.requestPermission() !== "granted") throw new Error("Notifications are blocked. Allow them in the browser settings.");
			const { publicKey } = await (await fetch("/api/v1/push/key")).json() as { publicKey: string };
			const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) });
			const res = await fetch("/api/v1/push/subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
			if (!res.ok) throw new Error("Could not save this device.");
			setEnabled(true);
		} catch (error) {
			alert(error instanceof Error ? error.message : "Could not change notifications.");
		} finally {
			setBusy(false);
		}
	};

	const label = enabled ? "Turn off email notifications on this device" : "Turn on email notifications on this device";
	return (
		<Tooltip content={label} side="bottom" asChild>
			<Button variant="ghost" shape="square" disabled={busy} icon={enabled ? <BellIcon size={20} weight="fill" /> : <BellSlashIcon size={20} />} onClick={toggle} aria-label={label} />
		</Tooltip>
	);
}
