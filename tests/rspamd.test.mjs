import assert from "node:assert/strict";
import { test } from "node:test";
import { scanWithRspamd } from "../workers/lib/rspamd.ts";

const message = new TextEncoder().encode("From: sender@example.com\r\nTo: inbox@example.com\r\n\r\nHello");
const access = {
	RSPAMD_CHECK_URL: "https://scanner.example.com/checkv2",
	RSPAMD_ACCESS_CLIENT_ID: "test-id",
	RSPAMD_ACCESS_CLIENT_SECRET: "test-secret",
};
const metadata = { from: "sender@example.com", recipient: "inbox@example.com" };

test("sends raw MIME and trusted envelope metadata to Rspamd", async () => {
	const verdict = await scanWithRspamd(message, metadata, access, async (url, init) => {
		assert.equal(url, access.RSPAMD_CHECK_URL);
		assert.equal(init.method, "POST");
		assert.equal(init.redirect, "manual");
		assert.equal(init.headers.get("From"), metadata.from);
		assert.equal(init.headers.get("Rcpt"), metadata.recipient);
		assert.equal(init.headers.get("CF-Access-Client-Id"), access.RSPAMD_ACCESS_CLIENT_ID);
		assert.equal(init.headers.get("CF-Access-Client-Secret"), access.RSPAMD_ACCESS_CLIENT_SECRET);
		assert.equal(init.headers.get("Content-Type"), "message/rfc822");
		assert.deepEqual(new Uint8Array(init.body), message);
		return Response.json({ action: "add header", score: 7.2, required_score: 6, symbols: { TEST_RULE: { score: 6 }, OTHER_RULE: { score: 1.2 } } });
	});
	assert.deepEqual(verdict, { action: "add header", score: 7.2, symbols: [{ name: "TEST_RULE", score: 6 }, { name: "OTHER_RULE", score: 1.2 }], symbolNames: ["TEST_RULE", "OTHER_RULE"] });
});

test("sends the configured API key with Basic authentication", async () => {
	const config = { RSPAMD_CHECK_URL: "https://rspamd.example.com/checkv2", RSPAMD_API_KEY: "test-key" };
	const verdict = await scanWithRspamd(message, metadata, config, async (url, init) => {
		assert.equal(url, config.RSPAMD_CHECK_URL);
		assert.equal(init.headers.get("Authorization"), `Basic ${btoa("worker:test-key")}`);
		assert.equal(init.headers.get("Content-Type"), "message/rfc822");
		return Response.json({ action: "no action", score: -0.1 });
	});
	assert.deepEqual(verdict, { action: "no action", score: -0.1, symbols: [], symbolNames: [] });
});

test("requires HTTPS and endpoint authentication", async () => {
	await assert.rejects(scanWithRspamd(message, metadata, { ...access, RSPAMD_CHECK_URL: "http://scanner.example.com/checkv2" }), /HTTPS/);
	await assert.rejects(scanWithRspamd(message, metadata, { RSPAMD_CHECK_URL: access.RSPAMD_CHECK_URL }), /authentication/);
	await assert.rejects(scanWithRspamd(message, metadata, { ...access, RSPAMD_BEARER_TOKEN: "test-token" }), /one Rspamd/);
});

test("rejects failed and skipped scans instead of treating them as clean", async () => {
	await assert.rejects(scanWithRspamd(message, metadata, access, async () => new Response("unavailable", { status: 503 })), /503/);
	await assert.rejects(scanWithRspamd(message, metadata, access, async () => new Response(null, { status: 302, headers: { Location: "https://other.example.com" } })), /302/);
	await assert.rejects(scanWithRspamd(message, metadata, access, async () => Response.json({ action: "no action", score: 0, is_skipped: true })), /skipped/);
	await assert.rejects(scanWithRspamd(message, metadata, access, async () => Response.json({ action: "unknown", score: 0 })), /Invalid/);
});
