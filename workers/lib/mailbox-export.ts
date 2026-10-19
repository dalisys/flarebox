import type { Env } from "../types";
import { getMailboxStub } from "./email-helpers";

const encoder = new TextEncoder();
const BLOCK_SIZE = 512;

function writeText(header: Uint8Array, offset: number, length: number, value: string) {
	const bytes = encoder.encode(value);
	if (bytes.length > length) throw new Error("Archive path is too long");
	header.set(bytes, offset);
}

function writeOctal(header: Uint8Array, offset: number, length: number, value: number) {
	writeText(header, offset, length, value.toString(8).padStart(length - 1, "0") + "\0");
}

function tarHeader(name: string, size: number): Uint8Array {
	const header = new Uint8Array(BLOCK_SIZE);
	writeText(header, 0, 100, name);
	writeOctal(header, 100, 8, 0o644);
	writeOctal(header, 108, 8, 0);
	writeOctal(header, 116, 8, 0);
	writeOctal(header, 124, 12, size);
	writeOctal(header, 136, 12, Math.floor(Date.now() / 1000));
	header.fill(32, 148, 156);
	writeText(header, 156, 1, "0");
	writeText(header, 257, 6, "ustar\0");
	writeText(header, 263, 2, "00");
	let sum = 0;
	for (const byte of header) sum += byte;
	writeText(header, 148, 8, sum.toString(8).padStart(6, "0") + "\0 ");
	return header;
}

async function* tarFile(name: string, bytes: Uint8Array | ReadableStream<Uint8Array>, size: number): AsyncGenerator<Uint8Array> {
	yield tarHeader(name, size);
	let written = 0;
	if (bytes instanceof Uint8Array) {
		written = bytes.length;
		yield bytes;
	} else {
		const reader = bytes.getReader();
		try {
			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				written += value.length;
				yield value;
			}
		} finally { reader.releaseLock(); }
	}
	if (written !== size) throw new Error(`Archive file ${name} changed while exporting`);
	const padding = (BLOCK_SIZE - (size % BLOCK_SIZE)) % BLOCK_SIZE;
	if (padding) yield new Uint8Array(padding);
}

export function mailboxArchive(env: Env, mailboxId: string, settings: unknown): ReadableStream<Uint8Array> {
	async function* entries(): AsyncGenerator<Uint8Array> {
		const stub = getMailboxStub(env, mailboxId);
		const manifest = encoder.encode(JSON.stringify({
			format: "agentic-inbox-mailbox-v1",
			address: mailboxId,
			exportedAt: new Date().toISOString(),
			settings,
			folders: await stub.getFolders(),
			layout: "Each emails/<id>.json file contains a complete message and its attachment metadata. Attachment bytes are in attachments/<email-id>/<attachment-id>.",
		}, null, 2));
		yield* tarFile("manifest.json", manifest, manifest.length);
		let cursor = "";
		while (true) {
			const emails = await stub.getExportPage(cursor, 10);
			if (!emails.length) break;
			for (const email of emails) {
				const safeId = email.id.replace(/[^a-zA-Z0-9_-]/g, "_");
				const message = encoder.encode(JSON.stringify(email, null, 2));
				yield* tarFile(`emails/${safeId}.json`, message, message.length);
				for (const attachment of email.attachments) {
					const object = await env.BUCKET.get(`attachments/${email.id}/${attachment.id}/${attachment.filename}`);
					if (!object) throw new Error(`Missing attachment ${attachment.id} for message ${email.id}`);
					const safeAttachmentId = attachment.id.replace(/[^a-zA-Z0-9_-]/g, "_");
					yield* tarFile(`attachments/${safeId}/${safeAttachmentId}`, object.body, object.size);
				}
			}
			cursor = emails[emails.length - 1].id;
		}
		yield new Uint8Array(BLOCK_SIZE * 2);
		await env.BUCKET.put(`config/completed-exports/${mailboxId}.json`, JSON.stringify({ completedAt: new Date().toISOString() }));
	}

	const iterator = entries();
	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				const { value, done } = await iterator.next();
				if (done) controller.close();
				else controller.enqueue(value);
			} catch (error) { controller.error(error); }
		},
		async cancel() { await iterator.return(undefined); },
	});
}
