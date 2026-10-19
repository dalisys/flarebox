// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/** Reply to the same sender at most once in this window. */
export const AUTO_REPLY_WINDOW_MS = 4 * 24 * 60 * 60 * 1000;

/** Automatic replies per mailbox per hour, so outside senders cannot use up the owner's send limit (20 per hour). */
export const AUTO_REPLY_HOURLY_CAP = 5;

const ROBOT_SENDER = /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounces?|notifications?)([+._-]|@)/i;

/**
 * Decide if an automatic reply may go to this sender. Pure, so it can be tested.
 * `lastRepliedAt` is the time of our last automatic reply to this sender, if any.
 */
export function shouldAutoReply(input: {
	sender: string;
	envelopeFrom?: string;
	headers: { key: string; value: string }[];
	managedDomains: string[];
	lastRepliedAt?: number;
	now: number;
}): boolean {
	const sender = input.sender.trim().toLowerCase();
	const domain = sender.split("@")[1];
	if (!domain || ROBOT_SENDER.test(sender)) return false;
	// An empty envelope sender means a bounce or other system message.
	if (input.envelopeFrom !== undefined && !input.envelopeFrom.trim()) return false;
	if (input.managedDomains.some((managed) => domain === managed || domain.endsWith(`.${managed}`))) return false;
	for (const { key, value } of input.headers) {
		const name = key.toLowerCase();
		const v = value.trim().toLowerCase();
		if (name === "auto-submitted" && v !== "no") return false;
		if (name === "list-id" || name === "list-unsubscribe") return false;
		if (name === "precedence" && /^(bulk|list|junk)$/.test(v)) return false;
		if (name === "x-auto-response-suppress" && /\b(all|oof|autoreply)\b/.test(v)) return false;
	}
	return input.lastRepliedAt === undefined || input.now - input.lastRepliedAt >= AUTO_REPLY_WINDOW_MS;
}
