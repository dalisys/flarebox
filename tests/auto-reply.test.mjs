import assert from "node:assert/strict";
import { test } from "node:test";
import { AUTO_REPLY_WINDOW_MS, shouldAutoReply } from "../workers/lib/auto-reply.ts";

const now = Date.UTC(2026, 9, 19);
const base = { sender: "bob@example.com", envelopeFrom: "bob@example.com", headers: [], managedDomains: ["mydomain.com"], now };

test("replies to a normal sender once per window", () => {
	assert.equal(shouldAutoReply(base), true);
	assert.equal(shouldAutoReply({ ...base, lastRepliedAt: now - 1000 }), false);
	assert.equal(shouldAutoReply({ ...base, lastRepliedAt: now - AUTO_REPLY_WINDOW_MS }), true);
});

test("skips robots, bounces, and our own domains", () => {
	for (const sender of ["noreply@example.com", "no-reply@example.com", "MAILER-DAEMON@example.com", "donotreply+x@example.com", "me@mydomain.com", "a@mail.mydomain.com", "broken"]) {
		assert.equal(shouldAutoReply({ ...base, sender }), false, sender);
	}
	assert.equal(shouldAutoReply({ ...base, sender: "noreplyfan@example.com" }), true);
	assert.equal(shouldAutoReply({ ...base, envelopeFrom: "" }), false);
});

test("skips automatic and list mail", () => {
	const skip = [
		{ key: "auto-submitted", value: "auto-replied" },
		{ key: "list-id", value: "<news.example.com>" },
		{ key: "list-unsubscribe", value: "<mailto:u@example.com>" },
		{ key: "precedence", value: "bulk" },
		{ key: "Precedence", value: "List" },
		{ key: "x-auto-response-suppress", value: "OOF, AutoReply" },
	];
	for (const header of skip) assert.equal(shouldAutoReply({ ...base, headers: [header] }), false, header.key);
	assert.equal(shouldAutoReply({ ...base, headers: [{ key: "auto-submitted", value: "no" }] }), true);
});
