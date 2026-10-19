import { Folders, type FolderId } from "./folders";

const FROM_ = [0x46, 0x72, 0x6f, 0x6d, 0x20]; // "From "

function startsWithFrom(line: Uint8Array, offset: number) {
	return FROM_.every((byte, i) => line[offset + i] === byte);
}

function concat(parts: Uint8Array[]) {
	const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
	let offset = 0;
	for (const part of parts) { out.set(part, offset); offset += part.length; }
	return out;
}

/**
 * Splits an mbox stream into raw RFC 822 messages without loading the whole
 * file. A line starting with "From " starts a new message. Escaped body lines
 * (">From ", ">>From ") lose one ">" (mboxrd).
 */
export async function* splitMbox(stream: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
	const reader = stream.getReader();
	let lines: Uint8Array[] = [];
	let started = false;
	let carry = new Uint8Array(0);
	const pushLine = function* (line: Uint8Array) {
		if (startsWithFrom(line, 0)) {
			if (started && lines.length) yield concat(lines);
			lines = [];
			started = true;
			return;
		}
		if (!started) return;
		let quotes = 0;
		while (line[quotes] === 0x3e) quotes++;
		lines.push(quotes > 0 && startsWithFrom(line, quotes) ? line.subarray(1) : line);
	};
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		const chunk = carry.length ? concat([carry, value]) : value;
		let start = 0;
		for (let i = chunk.indexOf(0x0a); i !== -1; i = chunk.indexOf(0x0a, start)) {
			yield* pushLine(chunk.subarray(start, i + 1));
			start = i + 1;
		}
		carry = chunk.slice(start);
	}
	if (carry.length) yield* pushLine(carry);
	if (started && lines.length) yield concat(lines);
}

/** Splits an X-Gmail-Labels value. Labels with commas are quoted. */
export function parseGmailLabels(value: string): string[] {
	const labels: string[] = [];
	let current = "";
	let quoted = false;
	for (const char of value) {
		if (char === "\"") quoted = !quoted;
		else if (char === "," && !quoted) { labels.push(current); current = ""; }
		else current += char;
	}
	labels.push(current);
	return labels.map((label) => label.trim()).filter(Boolean);
}

/** Maps Gmail labels to a Flarebox folder. A null folder means skip (chats). */
export function mapGmailLabels(labels: string[]): { folder: FolderId | null; read: boolean; starred: boolean } {
	const has = (name: string) => labels.some((label) => label.toLowerCase() === name.toLowerCase());
	const folder = has("Chat") ? null
		: has("Trash") ? Folders.TRASH
		: has("Spam") ? Folders.SPAM
		: has("Draft") || has("Drafts") ? Folders.DRAFT
		: has("Inbox") ? Folders.INBOX
		: has("Sent") ? Folders.SENT
		: Folders.ARCHIVE;
	return { folder, read: !has("Unread"), starred: has("Starred") };
}
