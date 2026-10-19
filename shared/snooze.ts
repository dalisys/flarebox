// Snooze preset times. All math uses the device's local time zone;
// callers send the result to the server as UTC (toISOString).

export interface SnoozePreset { id: string; label: string; date: Date }

function at(now: Date, days: number, hour: number): Date {
	const date = new Date(now);
	date.setDate(date.getDate() + days);
	date.setHours(hour, 0, 0, 0);
	return date;
}

export function snoozePresets(now = new Date()): SnoozePreset[] {
	const day = now.getDay(); // 0 = Sunday, 6 = Saturday
	const presets: SnoozePreset[] = [];
	if (now.getHours() < 17) presets.push({ id: "later", label: "Later today", date: at(now, 0, 18) });
	presets.push({ id: "tomorrow", label: "Tomorrow", date: at(now, 1, 8) });
	// On Saturday or Sunday the weekend is already here, so skip that choice.
	if (day >= 1 && day <= 5) presets.push({ id: "weekend", label: "This weekend", date: at(now, 6 - day, 8) });
	presets.push({ id: "next-week", label: "Next week", date: at(now, (8 - day) % 7 || 7, 8) });
	return presets;
}

/** Value for <input type="datetime-local"> in local time, e.g. "2026-10-19T08:00". */
export function toLocalInputValue(date: Date): string {
	const pad = (value: number) => String(value).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Folders whose mail may be snoozed. Snoozed mail always comes back to the Inbox. */
export function canSnooze(folderId: string): boolean {
	return !["sent", "draft", "snoozed", "trash", "spam", "activity"].includes(folderId);
}
