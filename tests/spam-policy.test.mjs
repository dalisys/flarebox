import assert from "node:assert/strict";
import { test } from "node:test";
import { canTrustedSenderOverride, senderDomain, domainBlockKey } from "../workers/lib/spam.ts";

test("trusted senders can bypass ordinary spam actions", () => {
	for (const action of [undefined, "greylist", "add header", "rewrite subject"]) {
		assert.equal(canTrustedSenderOverride(action), true, String(action));
	}
});

test("trusted senders remain in Junk for severe actions or scanner outages", () => {
	for (const action of ["soft reject", "reject", "quarantine", "discard"]) {
		assert.equal(canTrustedSenderOverride(action), false, action);
	}
	assert.equal(canTrustedSenderOverride(undefined, true), false);
	assert.equal(canTrustedSenderOverride("add header", true), false);
});


test("domain rules normalize senders and share one key across inboxes", () => {
	assert.equal(senderDomain(" Person@Example.COM "), "example.com");
	assert.equal(domainBlockKey(senderDomain("first@example.com")), domainBlockKey(senderDomain("second@EXAMPLE.COM")));
	assert.notEqual(domainBlockKey("example.com"), domainBlockKey("other.example.com"));
});

test("invalid senders cannot create domain rules", () => {
	for (const address of ["", "missing-domain", "a@@example.com", "a@example.com/path", "a@../example.com", "a@localhost"]) {
		assert.equal(senderDomain(address), undefined, address);
	}
});
