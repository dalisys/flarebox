// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/** Conservative local classification. Never trust sender-supplied X-Spam headers. */
export interface SpamSettings {
	enabled?: boolean;
	threshold?: number;
	blocklist?: string[];
}

/** Keep scanner outages and severe threat actions in Junk even for trusted senders. */
export function canTrustedSenderOverride(action?: string, scannerUnavailable = false): boolean {
	return !scannerUnavailable && (action === undefined || action === "greylist" || action === "add header" || action === "rewrite subject");
}

const domainOf = (address?: string) => (address || "").trim().toLowerCase().split("@")[1] || "";
/** Relaxed DMARC-style alignment: same domain or one is a subdomain of the other. */
const aligned = (a: string, b: string) => a.includes(".") && b.includes(".") && (a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`));

/**
 * The header From can be forged, so a trusted-sender override needs proof the sender owns it:
 * the envelope MAIL FROM must align with the header From, and Rspamd must report a DMARC pass.
 * Authentication-Results headers in the message are not used: the sender can write them.
 * No Rspamd verdict means no proof, so the message stays in Junk.
 */
export function isAuthenticatedSender(input: { headerFrom?: string; envelopeFrom?: string; rspamdSymbols?: string[] }): boolean {
	const from = domainOf(input.headerFrom);
	return !!from && aligned(domainOf(input.envelopeFrom), from) && !!input.rspamdSymbols?.includes("DMARC_POLICY_ALLOW");
}

interface IncomingMessage {
	from?: { address?: string };
	replyTo?: { address?: string }[];
	subject?: string;
	text?: string;
	html?: string;
}

function matchesList(sender: string, entries: unknown): boolean {
	if (!Array.isArray(entries)) return false;
	return entries.some((entry) => {
		if (typeof entry !== "string") return false;
		const value = entry.trim().toLowerCase();
		return value && (value.startsWith("@") ? sender.endsWith(value) : sender === value);
	});
}

export function classifySpam(message: IncomingMessage, settings?: SpamSettings): { spam: boolean; score: number; reasons: string[] } {
	if (settings?.enabled === false) return { spam: false, score: 0, reasons: [] };
	const sender = (message.from?.address || "").trim().toLowerCase();
	if (matchesList(sender, settings?.blocklist)) return { spam: true, score: 100, reasons: ["Blocked sender"] };

	let score = 0;
	const reasons: string[] = [];
	const add = (points: number, reason: string) => { score += points; reasons.push(reason); };
	const subject = (message.subject || "").toLowerCase();
	const content = `${message.text || ""} ${message.html || ""}`.slice(0, 100_000);
	const links = [...new Set([...content.matchAll(/https?:\/\/([^\s/<>'"?#]+)/gi)].map((match) => match[1].toLowerCase()))];
	if (!sender || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender)) add(4, "Invalid sender address");
	if (links.some((host) => /^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?$/.test(host))) add(4, "Link uses an IP address");
	if (links.some((host) => host.startsWith("xn--") || host.includes(".xn--"))) add(3, "Link uses an encoded domain");
	if (links.length >= 8) add(2, "Many links");
	if (/\b(?:verify your account|account suspended|password expires|confirm your identity|payment failed)\b/i.test(`${subject} ${message.text || ""}`) && links.length) add(3, "Account warning with a link");
	if (/\b(?:gift card|wire transfer|crypto wallet|seed phrase)\b/i.test(`${subject} ${message.text || ""}`) && links.length) add(2, "Payment request with a link");
	const replyTo = message.replyTo?.[0]?.address?.toLowerCase();
	if (replyTo && sender && replyTo.split("@")[1] !== sender.split("@")[1] && links.length) add(1, "Different reply-to domain");
	const threshold = Number.isInteger(settings?.threshold) && settings!.threshold! >= 3 && settings!.threshold! <= 10 ? settings!.threshold! : 5;
	return { spam: score >= threshold, score, reasons };
}

/** Exact sender domain, normalized for shared Junk rules. */
export function senderDomain(address: string): string | undefined {
	const sender = address.trim().toLowerCase();
	if (sender.length > 254 || !/^[^\s@]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(sender)) return;
	return sender.split("@")[1];
}

export function domainBlockKey(domain: string): string {
	return `config/blocked-sender-domains/${encodeURIComponent(domain)}.json`;
}
