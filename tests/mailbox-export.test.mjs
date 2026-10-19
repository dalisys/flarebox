import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const bundled = await build({
	entryPoints: ["workers/lib/mailbox-export.ts"],
	bundle: true,
	platform: "node",
	format: "esm",
	write: false,
});
const { mailboxArchive } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString("base64")}`);

function archiveFiles(bytes) {
	const files = new Map();
	let offset = 0;
	while (offset < bytes.length) {
		const header = bytes.subarray(offset, offset + 512);
		if (header.every((byte) => byte === 0)) break;
		const name = Buffer.from(header.subarray(0, 100)).toString().replace(/\0.*$/, "");
		const size = Number.parseInt(Buffer.from(header.subarray(124, 136)).toString().replace(/\0.*$/, "").trim(), 8);
		offset += 512;
		files.set(name, bytes.subarray(offset, offset + size));
		offset += Math.ceil(size / 512) * 512;
	}
	return files;
}

test("mailbox export includes settings, messages, attachment bytes, and completion marker", async () => {
	const writes = new Map();
	const attachmentBytes = new TextEncoder().encode("attachment content");
	const email = {
		id: "message-1", folder_id: "inbox", subject: "Hello", sender: "sender@example.com",
		recipient: "hello@example.com", date: "2026-09-29", body: "The full message",
		attachments: [{ id: "file-1", email_id: "message-1", filename: "note.txt", size: attachmentBytes.length }],
	};
	const stub = {
		getFolders: async () => [{ id: "inbox", name: "Inbox" }],
		getExportPage: async (cursor) => cursor ? [] : [email],
	};
	const env = {
		MAILBOX: { idFromName: (name) => name, get: () => stub },
		BUCKET: {
			get: async (key) => key === "attachments/message-1/file-1/note.txt"
				? { body: new Blob([attachmentBytes]).stream(), size: attachmentBytes.length }
				: null,
			put: async (key, value) => { writes.set(key, value); },
		},
	};
	const settings = { fromName: "Hello" };
	const bytes = new Uint8Array(await new Response(mailboxArchive(env, "hello@example.com", settings)).arrayBuffer());
	const files = archiveFiles(bytes);
	const manifest = JSON.parse(new TextDecoder().decode(files.get("manifest.json")));
	assert.equal(manifest.address, "hello@example.com");
	assert.deepEqual(manifest.settings, settings);
	assert.deepEqual(manifest.folders, [{ id: "inbox", name: "Inbox" }]);
	assert.deepEqual(JSON.parse(new TextDecoder().decode(files.get("emails/message-1.json"))), email);
	assert.deepEqual(files.get("attachments/message-1/file-1"), attachmentBytes);
	assert.ok(writes.has("config/completed-exports/hello@example.com.json"));
});

test("cancelled archive does not mark export complete", async () => {
	let completed = false;
	const stub = { getFolders: async () => [], getExportPage: async () => [] };
	const env = {
		MAILBOX: { idFromName: (name) => name, get: () => stub },
		BUCKET: { put: async () => { completed = true; } },
	};
	const reader = mailboxArchive(env, "hello@example.com", {}).getReader();
	await reader.read();
	await reader.cancel();
	assert.equal(completed, false);
});
