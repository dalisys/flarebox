import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const bundled = await build({ entryPoints: ["workers/lib/cloudflare-routing.ts"], bundle: true, platform: "node", format: "esm", write: false });
const { enableRouting, inspectRouting, ensureWorkerRule, removeWorkerRule, inspectCatchAll, disableCatchAll } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString("base64")}`);
const env = { CLOUDFLARE_API_TOKEN: "test-token", CLOUDFLARE_EMAIL_WORKER: "inbox" };

function cloudflareMock(t, { configured = false, rootEnabled = false, conflict = false, partial = false } = {}) {
	const calls = [];
	const rules = [];
	t.mock.method(globalThis, "fetch", async (input, init = {}) => {
		const url = new URL(input);
		const body = init.body ? JSON.parse(init.body) : undefined;
		calls.push({ url, method: init.method ?? "GET", body });
		let result;
		if (url.pathname.endsWith("/zones")) result = url.searchParams.get("name") === "example.com" ? [{ id: "zone", name: "example.com" }] : [];
		else if (url.pathname.endsWith("/dns_records")) {
			const name = url.searchParams.get("name");
			result = configured ? url.searchParams.get("type") === "MX" ? [{ type: "MX", name, content: "route1.mx.cloudflare.net", priority: 10 }] : [{ type: "TXT", name, content: "v=spf1 include:_spf.mx.cloudflare.net ~all" }] : partial && url.searchParams.get("type") === "TXT" ? [{ type: "TXT", name, content: '"v=spf1 include:_spf.mx.cloudflare.net ~all"' }] : conflict ? [{ type: "MX", name, content: "mail.other.net" }] : [];
		} else if (url.pathname.endsWith("/email/routing/dns")) {
			if (body?.name === "example.com") return Response.json({ success: false, errors: [{ message: "Invalid Input: must be a subdomains of example.com" }] }, { status: 400 });
			configured = true;
			rootEnabled = !body?.name;
			result = {};
		} else if (url.pathname.endsWith("/email/routing")) result = { enabled: rootEnabled, status: rootEnabled ? configured ? "ready" : "misconfigured" : "unconfigured" };
		else if (url.pathname.endsWith("/rules")) {
			if (init.method === "POST") rules.push({ id: "rule", ...body });
			result = rules;
		} else if (url.pathname.endsWith("/rules/rule")) result = {};
		else throw new Error(`Unexpected API call: ${url.pathname}`);
		return Response.json({ success: true, result });
	});
	return calls;
}

test("apex activation omits the subdomain name that Cloudflare rejects", async (t) => {
	const calls = cloudflareMock(t);
	assert.equal((await enableRouting(env, "example.com")).enabled, true);
	assert.equal(calls.find((call) => call.method === "POST").body?.name, undefined);
});

test("subdomain activation uses the parent zone and enables address rules", async (t) => {
	const calls = cloudflareMock(t);
	assert.equal((await inspectRouting(env, "mail.example.com")).enabled, false);
	assert.equal((await enableRouting(env, "mail.example.com")).enabled, true);
	assert.deepEqual(calls.find((call) => call.method === "POST").body, { name: "mail.example.com" });
	assert.equal(await ensureWorkerRule(env, "hello@mail.example.com"), "active");
	assert.equal(await removeWorkerRule(env, "hello@mail.example.com"), "removed");
	assert.ok(calls.some((call) => call.body?.matchers?.[0].value === "hello@mail.example.com"));
});

test("parent routing being enabled does not mean a new subdomain is enabled", async (t) => {
	cloudflareMock(t, { rootEnabled: true });
	const status = await inspectRouting(env, "mail.example.com");
	assert.equal(status.enabled, false);
	assert.equal(status.canEnable, true);
});

test("existing mail records block activation without a DNS mutation", async (t) => {
	const calls = cloudflareMock(t, { conflict: true });
	await assert.rejects(enableRouting(env, "mail.example.com"), /already has MX or SPF/);
	assert.equal(calls.some((call) => call.method === "POST"), false);
});


test("enabled but misconfigured apex with only Cloudflare SPF can be repaired", async (t) => {
	const calls = cloudflareMock(t, { rootEnabled: true, partial: true });
	const before = await inspectRouting(env, "example.com");
	assert.equal(before.enabled, false);
	assert.equal(before.status, "misconfigured");
	assert.equal(before.canEnable, true);
	assert.equal((await enableRouting(env, "example.com")).enabled, true);
	assert.equal(calls.filter((call) => call.method === "POST").length, 1);
	assert.equal(await ensureWorkerRule(env, "hello@example.com"), "active");
});

test("misconfigured enabled apex with another mail provider cannot be overwritten", async (t) => {
	const calls = cloudflareMock(t, { rootEnabled: true, conflict: true });
	await assert.rejects(enableRouting(env, "example.com"), /already has MX or SPF/);
	assert.equal(calls.some((call) => call.method === "POST"), false);
});


test("subdomain catch-all controls do not change the apex rule", async (t) => {
	const calls = cloudflareMock(t);
	const status = await inspectCatchAll(env, "mail.example.com");
	assert.equal(status.available, false);
	assert.match(status.reason, /only to example.com/);
	await assert.rejects(disableCatchAll(env, "mail.example.com"), /Manage catch-all from example.com/);
	assert.equal(calls.some((call) => call.url.pathname.endsWith("catch_all")), false);
});
