// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { ArchiveIcon, EnvelopeOpenIcon, EnvelopeSimpleIcon, HandSwipeRightIcon, TrashIcon } from "@phosphor-icons/react";
import { type CSSProperties, type ReactNode, useRef, useState, useSyncExternalStore } from "react";

export type SwipeAction = "none" | "archive" | "delete" | "toggle-read";
export interface SwipeSettings { left: SwipeAction; right: SwipeAction }

// Swiping is a touch gesture, so the choice is saved per device, like the theme.
const STORAGE_KEY = "agentic-inbox-swipe";
const DEFAULTS: SwipeSettings = { left: "archive", right: "toggle-read" };
const OPTIONS: { value: SwipeAction; label: string }[] = [
	{ value: "archive", label: "Archive" },
	{ value: "delete", label: "Delete" },
	{ value: "toggle-read", label: "Mark as read or unread" },
	{ value: "none", label: "None" },
];
const isAction = (value: unknown): value is SwipeAction => OPTIONS.some((option) => option.value === value);

const listeners = new Set<() => void>();
let cached: SwipeSettings | null = null;
const readSettings = (): SwipeSettings => {
	if (cached) return cached;
	try {
		const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
		cached = { left: isAction(saved.left) ? saved.left : DEFAULTS.left, right: isAction(saved.right) ? saved.right : DEFAULTS.right };
	} catch { cached = DEFAULTS; }
	return cached;
};

export function useSwipeSettings() {
	const settings = useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, readSettings, () => DEFAULTS);
	const save = (next: SwipeSettings) => {
		cached = next;
		try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* The choice still applies until the page reloads. */ }
		listeners.forEach((listener) => listener());
	};
	return [settings, save] as const;
}

/** Wraps one list row. A touch swipe past 30% of the row width runs the action set for that side. */
export function SwipeRow({ unread, canArchive, onSwipe, children }: { unread: boolean; canArchive: boolean; onSwipe: (action: Exclude<SwipeAction, "none">) => unknown; children: ReactNode }) {
	const [settings] = useSwipeSettings();
	const [dx, setDx] = useState(0);
	const [dragging, setDragging] = useState(false);
	const start = useRef<{ x: number; y: number; horizontal: boolean } | null>(null);
	const swiped = useRef(false);
	const usable = (action: SwipeAction): action is Exclude<SwipeAction, "none"> => action !== "none" && (action !== "archive" || canArchive);
	const action = dx > 0 ? settings.right : settings.left;

	const finish = (width: number) => {
		start.current = null;
		setDragging(false);
		if (!usable(action) || Math.abs(dx) < width * 0.3) return setDx(0);
		// Archive and delete slide the row out; the list refresh then removes it.
		if (action === "toggle-read") setDx(0); else setDx(Math.sign(dx) * width);
		void Promise.resolve(onSwipe(action)).finally(() => setDx(0));
	};

	const Icon = action === "archive" ? ArchiveIcon : action === "delete" ? TrashIcon : unread ? EnvelopeOpenIcon : EnvelopeSimpleIcon;
	const label = action === "archive" ? "Archive" : action === "delete" ? "Delete" : unread ? "Mark read" : "Mark unread";
	return <div
		className="mail-swipe"
		style={{ "--swipe-x": `${dx}px`, "--swipe-speed": dragging ? "0ms" : "180ms" } as CSSProperties}
		onPointerDown={(event) => {
			swiped.current = false;
			if (event.pointerType !== "mouse") start.current = { x: event.clientX, y: event.clientY, horizontal: false };
		}}
		onPointerMove={(event) => {
			const origin = start.current;
			if (!origin) return;
			const moveX = event.clientX - origin.x;
			const moveY = event.clientY - origin.y;
			if (!origin.horizontal) {
				if (Math.abs(moveY) > 10 && Math.abs(moveY) > Math.abs(moveX)) { start.current = null; return; }
				if (Math.abs(moveX) < 10) return;
				origin.horizontal = true;
				swiped.current = true;
				setDragging(true);
				event.currentTarget.setPointerCapture(event.pointerId);
			}
			setDx(usable(moveX > 0 ? settings.right : settings.left) ? moveX : 0);
		}}
		onPointerUp={(event) => { if (start.current?.horizontal) finish(event.currentTarget.offsetWidth); else start.current = null; }}
		onPointerCancel={() => { start.current = null; setDragging(false); setDx(0); }}
		// A swipe must not also open the message.
		onClickCapture={(event) => { if (swiped.current) { event.preventDefault(); event.stopPropagation(); swiped.current = false; } }}
	>
		{dx !== 0 && <div aria-hidden className={`mail-swipe-action is-${action} ${dx > 0 ? "is-right" : "is-left"}`}><Icon size={22} />{label}</div>}
		{children}
	</div>;
}

export function SwipeSettingsPanel() {
	const [settings, save] = useSwipeSettings();
	const select = (side: keyof SwipeSettings, title: string) => <label className="flex items-center justify-between gap-4 px-5 py-4 text-sm text-kumo-default">
		{title}
		<select value={settings[side]} onChange={(event) => save({ ...settings, [side]: event.target.value as SwipeAction })} className="min-h-11 w-48 shrink-0 rounded-md border border-kumo-line bg-kumo-base px-2 py-1.5 text-base sm:text-sm text-kumo-default">
			{OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
		</select>
	</label>;
	return <section className="max-w-3xl space-y-6 py-6">
		<div className="border-b border-kumo-line pb-6">
			<div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-kumo-subtle"><HandSwipeRightIcon size={15} /> Swipe actions</div>
			<h2 className="text-2xl font-semibold tracking-tight text-kumo-default md:text-3xl">Swipe actions</h2>
			<p className="mt-2 text-sm text-kumo-subtle">Swipe a message in the list with your finger to act on it. Saved on this device. Changes save at once.</p>
		</div>
		<div className="max-w-xl divide-y divide-kumo-line rounded-lg border border-kumo-line bg-kumo-recessed">
			{select("right", "Swipe right")}
			{select("left", "Swipe left")}
		</div>
	</section>;
}
