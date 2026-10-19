import assert from "node:assert/strict";
import { test } from "node:test";
import { isCrossSiteWrite } from "../workers/lib/csrf.ts";

const url = "https://mail.example.com/api/v1/mailboxes/a@example.com/emails";
const req = (method, headers = {}) => new Request(url, { method, headers });

test("blocks cross-site writes and allows same-origin, safe and non-browser requests", () => {
	assert.equal(isCrossSiteWrite(req("POST", { "sec-fetch-site": "cross-site" })), true);
	assert.equal(isCrossSiteWrite(req("POST", { "sec-fetch-site": "same-site" })), true);
	assert.equal(isCrossSiteWrite(req("POST", { origin: "https://evil.example" })), true);
	assert.equal(isCrossSiteWrite(req("POST", { "sec-fetch-site": "same-origin" })), false);
	assert.equal(isCrossSiteWrite(req("POST", { origin: "https://mail.example.com" })), false);
	assert.equal(isCrossSiteWrite(req("POST")), false);
	assert.equal(isCrossSiteWrite(req("GET", { "sec-fetch-site": "cross-site" })), false);
});
