import assert from "node:assert/strict";
import { test } from "node:test";
import { canTrustedSenderOverride, hasAlignedEnvelope, isAuthenticatedSender, senderDomain, domainBlockKey } from "../workers/lib/spam.ts";

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

test("trusted sender override needs an aligned envelope and a DMARC pass from Rspamd", () => {
	const ok = { headerFrom: "boss@example.com", envelopeFrom: "bounce@mail.example.com", rspamdSymbols: ["DMARC_POLICY_ALLOW"] };
	assert.equal(isAuthenticatedSender(ok), true);
	// Forged header From: envelope from another domain.
	assert.equal(isAuthenticatedSender({ ...ok, envelopeFrom: "x@attacker.test" }), false);
	assert.equal(isAuthenticatedSender({ ...ok, envelopeFrom: undefined }), false);
	// No DMARC pass, or no Rspamd verdict at all.
	assert.equal(isAuthenticatedSender({ ...ok, rspamdSymbols: ["R_DKIM_ALLOW", "DMARC_POLICY_REJECT"] }), false);
	assert.equal(isAuthenticatedSender({ ...ok, rspamdSymbols: undefined }), false);
	// A sender-written Authentication-Results header is never trusted.
	assert.equal(isAuthenticatedSender({ ...ok, rspamdSymbols: undefined, headers: [{ key: "authentication-results", value: "mx.cloudflare.net; dmarc=pass header.from=example.com" }] }), false);
});

test("threading needs the From domain to match the envelope domain", () => {
	assert.equal(hasAlignedEnvelope("sam@example.com", "bounce@example.com"), true);
	assert.equal(hasAlignedEnvelope("sam@example.com", "bounce@mail.example.com"), true);
	assert.equal(hasAlignedEnvelope("sam@example.com", "attacker@evil.test"), false);
	assert.equal(hasAlignedEnvelope("sam@example.com", undefined), false);
	assert.equal(hasAlignedEnvelope("", "bounce@example.com"), false);
});
