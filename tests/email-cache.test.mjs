import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const bundle = await build({ entryPoints: ["app/lib/email-cache.ts"], bundle: true, platform: "node", format: "esm", write: false });
const { mapCachedEmail, restoreEmailFields } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
const one = { id: "one", read: false, starred: false };
const two = { id: "two", read: false, starred: false };

test("stars update combined inbox, search, thread, and detail without losing metadata", () => {
	for (const cached of [one, [one, two], { emails: [one, two], totalCount: 42, mailboxId: "a" }, { results: [one, two], totalCount: 42 }]) {
		const updated = mapCachedEmail(cached, "one", (email) => ({ ...email, starred: true }));
		let actual;
		mapCachedEmail(updated, "one", (email) => { actual = email; return email; });
		assert.equal(actual.starred, true);
		assert.equal(one.starred, false);
		if (cached.totalCount) assert.equal(updated.totalCount, cached.totalCount);
	}
});

test("failed save rolls back only its fields and keeps another row's successful star", () => {
	const previous = { emails: [one, two], totalCount: 2 };
	let current = mapCachedEmail(previous, "one", (email) => ({ ...email, starred: true, read: true }));
	current = mapCachedEmail(current, "two", (email) => ({ ...email, starred: true }));
	assert.deepEqual(restoreEmailFields(current, previous, "one", { starred: true }), { emails: [{ ...one, read: true }, { ...two, starred: true }], totalCount: 2 });
});

test("rollback leaves a newer change and missing caches intact", () => {
	assert.equal(restoreEmailFields({ ...one, starred: false }, one, "one", { starred: true }).starred, false);
	assert.equal(mapCachedEmail(undefined, "one", (email) => email), undefined);
	assert.deepEqual(restoreEmailFields({ emails: [two] }, { emails: [two] }, "one", { starred: true }), { emails: [two] });
});
