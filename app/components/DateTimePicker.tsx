import { CalendarBlankIcon, CaretLeftIcon, CaretRightIcon, XIcon } from "@phosphor-icons/react";
import { type CSSProperties, type KeyboardEvent, type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { at, monthGrid, sameDay, type SchedulePreset } from "shared/schedule-time";

// Locale formats: 12 or 24 hour clock follows the browser language.
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const weekdayTime = (date: Date) => `${date.toLocaleDateString(undefined, { weekday: "short" })} ${timeFormat.format(date)}`;
const summary = (date: Date) => `${date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} at ${timeFormat.format(date)}`;
const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
const TIME_SLOTS = Array.from({ length: 96 }, (_, index) => index * 15); // minutes after midnight

function weekStart(): number {
	try {
		const locale = new Intl.Locale(navigator.language) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };
		const info = locale.getWeekInfo?.() ?? locale.weekInfo;
		return info ? info.firstDay % 7 : 1; // Intl: 1 = Monday ... 7 = Sunday
	} catch { return 1; }
}

interface DateTimePickerProps {
	title: string;
	presets: SchedulePreset[];
	confirmLabel: string;
	/** The button that opened the picker; gets focus back on close. */
	anchor: RefObject<HTMLElement | null>;
	onPick: (date: Date) => void;
	onClose: () => void;
}

/** Presets plus a calendar and time list. Bottom sheet on phones, popover on desktop. */
export default function DateTimePicker({ title, presets, confirmLabel, anchor, onPick, onClose }: DateTimePickerProps) {
	const [now] = useState(() => new Date());
	const today = at(now, 0, 0);
	const [view, setView] = useState<"presets" | "custom">("presets");
	const [day, setDay] = useState(() => at(now, 1, 0));
	const [month, setMonth] = useState(() => new Date(day.getFullYear(), day.getMonth(), 1));
	const [minutes, setMinutes] = useState(9 * 60);
	const [position, setPosition] = useState({ top: 0, left: 0 });
	const panel = useRef<HTMLDivElement>(null);
	const focusDay = useRef(false);
	const firstDay = useMemo(weekStart, []);
	const days = monthGrid(month.getFullYear(), month.getMonth(), firstDay);
	const chosen = at(day, 0, Math.floor(minutes / 60), minutes % 60);
	const valid = chosen.getTime() > Date.now();
	// The day that takes Tab focus: the chosen day, or the first open day of the shown month.
	const focusable = days.find((date) => sameDay(date, day)) ?? days.find((date) => date.getMonth() === month.getMonth() && date >= today);

	const close = () => { onClose(); anchor.current?.focus(); };
	const pick = (date: Date) => { onPick(date); anchor.current?.focus(); };

	// Desktop popover sits under the trigger, kept inside the window.
	useLayoutEffect(() => {
		const rect = anchor.current?.getBoundingClientRect();
		if (rect) setPosition({ top: Math.min(rect.bottom + 8, window.innerHeight - 240), left: Math.max(8, Math.min(rect.right - 340, window.innerWidth - 348)) });
	}, [anchor]);
	useEffect(() => { panel.current?.querySelector<HTMLElement>(view === "presets" ? ".dtp-row" : ".dtp-day[tabindex='0']")?.focus(); }, [view]);
	useEffect(() => {
		if (!focusDay.current) return;
		focusDay.current = false;
		panel.current?.querySelector<HTMLElement>(`[data-day="${dayKey(day)}"]`)?.focus();
	}, [day]);

	const selectDay = (date: Date) => {
		if (date < today) return;
		setDay(date);
		setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
	};
	const onGridKey = (event: KeyboardEvent) => {
		const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
		if (!step) return;
		event.preventDefault();
		focusDay.current = true;
		selectDay(at(focusable ?? day, step, 0));
	};
	const moveMonth = (delta: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));

	return createPortal(<>
		<div className="dtp-backdrop" onClick={close} />
		<div ref={panel} role="dialog" aria-modal="true" aria-label={title} className="dtp" style={{ "--dtp-top": `${position.top}px`, "--dtp-left": `${position.left}px` } as CSSProperties}
			onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); close(); } }}>
			<div className="flex items-center gap-1 pb-1">
				{view === "custom" && <button type="button" className="mail-icon-button" aria-label="Back to quick choices" onClick={() => setView("presets")}><CaretLeftIcon size={20} /></button>}
				<h2 className="min-w-0 flex-1 truncate px-3 text-base font-medium">{view === "presets" ? title : "Pick date & time"}</h2>
				<button type="button" className="mail-icon-button" aria-label="Close" onClick={close}><XIcon size={20} /></button>
			</div>
			{view === "presets" ? <div>
				{presets.map((preset) => <button key={preset.id} type="button" className="dtp-row" onClick={() => pick(preset.date)}>
					<span className="font-medium">{preset.label}</span>
					<span className="ml-auto text-sm text-kumo-subtle">{weekdayTime(preset.date)}</span>
				</button>)}
				<button type="button" className="dtp-row" onClick={() => setView("custom")}>
					<CalendarBlankIcon size={20} /><span className="font-medium">Pick date &amp; time</span><CaretRightIcon size={16} className="ml-auto text-kumo-subtle" />
				</button>
			</div> : <div className="px-1">
				<div className="flex items-center">
					<button type="button" className="mail-icon-button" aria-label="Previous month" disabled={month <= new Date(today.getFullYear(), today.getMonth(), 1)} onClick={() => moveMonth(-1)}><CaretLeftIcon size={18} /></button>
					<p className="flex-1 text-center text-sm font-medium" aria-live="polite">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</p>
					<button type="button" className="mail-icon-button" aria-label="Next month" onClick={() => moveMonth(1)}><CaretRightIcon size={18} /></button>
				</div>
				<div className="dtp-grid" aria-hidden="true">
					{days.slice(0, 7).map((date) => <span key={date.getDay()} className="py-1 text-center text-xs text-kumo-subtle">{date.toLocaleDateString(undefined, { weekday: "narrow" })}</span>)}
				</div>
				<div className="dtp-grid" role="group" aria-label="Day" onKeyDown={onGridKey}>
					{days.map((date) => {
						const selected = sameDay(date, day);
						return <button key={dayKey(date)} type="button" data-day={dayKey(date)} tabIndex={focusable && sameDay(date, focusable) ? 0 : -1}
							className={`dtp-day ${date.getMonth() !== month.getMonth() ? "is-outside" : ""} ${sameDay(date, today) ? "is-today" : ""} ${selected ? "is-selected" : ""}`}
							disabled={date < today} aria-pressed={selected} aria-current={sameDay(date, today) ? "date" : undefined}
							aria-label={date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
							onClick={() => selectDay(date)}>{date.getDate()}</button>;
					})}
				</div>
				<label className="mt-3 block text-xs text-kumo-subtle">Time
					<select value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} className="mt-1 block min-h-11 w-full rounded-lg border border-kumo-line bg-kumo-base px-2 text-base text-kumo-default">
						{TIME_SLOTS.map((slot) => {
							const time = at(day, 0, Math.floor(slot / 60), slot % 60);
							return <option key={slot} value={slot} disabled={time.getTime() <= now.getTime()}>{timeFormat.format(time)}</option>;
						})}
					</select>
				</label>
				<p className="mt-3 text-sm font-medium" aria-live="polite">{summary(chosen)}</p>
				{!valid && <p className="text-xs text-kumo-danger">Pick a later time.</p>}
				<button type="button" className="dtp-confirm" disabled={!valid} onClick={() => pick(chosen)}>{confirmLabel}</button>
			</div>}
		</div>
	</>, document.body);
}
