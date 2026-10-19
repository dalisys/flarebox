// Preset times for snooze and send later, and the calendar grid for the
// date-time picker. All math uses the device's local time zone; callers
// send results to the server as UTC (toISOString).

export interface SchedulePreset { id: string; label: string; date: Date }

/** Copy of `now` moved by whole days and set to hour:minute local time. */
export function at(now: Date, days: number, hour: number, minute = 0): Date {
	const date = new Date(now);
	date.setDate(date.getDate() + days);
	date.setHours(hour, minute, 0, 0);
	return date;
}

/** Days until the next Monday, never today. */
const daysToMonday = (day: number) => (8 - day) % 7 || 7;

export function snoozePresets(now = new Date()): SchedulePreset[] {
	const day = now.getDay(); // 0 = Sunday, 6 = Saturday
	const presets: SchedulePreset[] = [];
	if (now.getHours() < 17) presets.push({ id: "later", label: "Later today", date: at(now, 0, 18) });
	presets.push({ id: "tomorrow", label: "Tomorrow", date: at(now, 1, 8) });
	// On Saturday or Sunday the weekend is already here, so skip that choice.
	if (day >= 1 && day <= 5) presets.push({ id: "weekend", label: "This weekend", date: at(now, 6 - day, 8) });
	presets.push({ id: "next-week", label: "Next week", date: at(now, daysToMonday(day), 8) });
	return presets;
}

export function sendLaterPresets(now = new Date()): SchedulePreset[] {
	return [
		{ id: "tomorrow-morning", label: "Tomorrow morning", date: at(now, 1, 8) },
		{ id: "tomorrow-afternoon", label: "Tomorrow afternoon", date: at(now, 1, 13) },
		{ id: "monday", label: "Monday morning", date: at(now, daysToMonday(now.getDay()), 8) },
	];
}

/** Folders whose mail may be snoozed. Snoozed mail always comes back to the Inbox. */
export function canSnooze(folderId: string): boolean {
	return !["sent", "draft", "snoozed", "scheduled", "trash", "spam", "activity"].includes(folderId);
}

/**
 * Days shown for a month view: whole weeks from the week that holds the 1st
 * to the week that holds the last day. firstDay: 0 = Sunday, 1 = Monday.
 */
export function monthGrid(year: number, month: number, firstDay = 1): Date[] {
	const first = new Date(year, month, 1);
	const start = at(first, -((first.getDay() - firstDay + 7) % 7), 0);
	const last = new Date(year, month + 1, 0);
	const count = Math.ceil(((first.getDay() - firstDay + 7) % 7 + last.getDate()) / 7) * 7;
	return Array.from({ length: count }, (_, index) => at(start, index, 0));
}

export const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
