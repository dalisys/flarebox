// Pure helpers for the mailbox alarm, which serves both snooze wake-ups
// and scheduled sends. Times are UTC ISO strings.

export const MAX_SEND_ATTEMPTS = 3;

export interface AlarmItem { at: string; attempts?: number }

/** An item is due when its time has come and it has tries left. */
export function isDue(item: AlarmItem, now: number): boolean {
	return (item.attempts ?? 0) < MAX_SEND_ATTEMPTS && Date.parse(item.at) <= now;
}

/** Earliest time (ms) the alarm must fire, or null when nothing waits. */
export function nextAlarmTime(items: AlarmItem[]): number | null {
	let next: number | null = null;
	for (const item of items) {
		const at = Date.parse(item.at);
		if ((item.attempts ?? 0) >= MAX_SEND_ATTEMPTS || Number.isNaN(at)) continue;
		if (next === null || at < next) next = at;
	}
	return next;
}

/** After a failed send: try again 5, then 10 minutes later. */
export function retryTime(attempts: number, now: number): string {
	return new Date(now + attempts * 5 * 60_000).toISOString();
}
