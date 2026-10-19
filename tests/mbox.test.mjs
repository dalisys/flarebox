import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const bundled = await build({ entryPoints: ["shared/mbox.ts"], bundle: true, platform: "node", format: "esm", write: false });
const { splitMbox, parseGmailLabels, mapGmailLabels } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString("base64")}`);

const sample = [
	"From 1111@xxx Mon Jan 01 10:00:00 +0000 2024",
	"X-Gmail-Labels: Inbox,Unread,\"Work, old\"",
	"Message-ID: <a@example.com>",
	"Subject: One",
	"",
	">From the start",
	">>From quoted twice",
	"> From is not escaped",
	"",
	"From 2222@xxx Tue Jan 02 10:00:00 +0000 2024",
	"X-Gmail-Labels: Sent,Starred",
	"Subject: Two",
	"",
	"Body two",
].join("\r\n");

// Feed the sample in tiny chunks so lines cross chunk borders.
function streamOf(text, size) {
	const bytes = new TextEncoder().encode(text);
	let offset = 0;
	return new ReadableStream({ pull(controller) {
		if (offset >= bytes.length) return controller.close();
		controller.enqueue(bytes.slice(offset, offset += size));
	} });
}

test("splitMbox splits messages and unescapes From lines", async () => {
	for (const size of [1, 7, 4096]) {
		const messages = [];
		for await (const raw of splitMbox(streamOf(sample, size))) messages.push(new TextDecoder().decode(raw));
		assert.equal(messages.length, 2);
		assert.match(messages[0], /^X-Gmail-Labels: Inbox/);
		assert.match(messages[0], /\r\nFrom the start\r\n>From quoted twice\r\n> From is not escaped\r\n/);
		assert.doesNotMatch(messages[0], /2222@xxx/);
		assert.equal(messages[1], "X-Gmail-Labels: Sent,Starred\r\nSubject: Two\r\n\r\nBody two");
	}
});

test("parseGmailLabels keeps quoted commas", () => {
	assert.deepEqual(parseGmailLabels("Inbox,Unread,\"Work, old\", Category Updates"), ["Inbox", "Unread", "Work, old", "Category Updates"]);
});

test("mapGmailLabels picks folder and flags", () => {
	assert.deepEqual(mapGmailLabels(["Inbox", "Unread"]), { folder: "inbox", read: false, starred: false });
	assert.deepEqual(mapGmailLabels(["Sent", "Starred"]), { folder: "sent", read: true, starred: true });
	assert.equal(mapGmailLabels(["Spam", "Inbox"]).folder, "spam");
	assert.equal(mapGmailLabels(["Trash", "Spam"]).folder, "trash");
	assert.equal(mapGmailLabels(["Archived", "Opened", "Category Updates"]).folder, "archive");
	assert.equal(mapGmailLabels(["Drafts"]).folder, "draft");
	assert.equal(mapGmailLabels(["Chat"]).folder, null);
	assert.equal(mapGmailLabels([]).folder, "archive");
});
