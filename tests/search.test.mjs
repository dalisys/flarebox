import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { build } from "esbuild";

async function loadModule(path) {
	const result = await build({ entryPoints: [path], bundle: true, platform: "node", format: "esm", write: false });
	return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
}
const { parseSearchQuery, buildSearchQuery, searchQueryParams } = await loadModule("app/lib/search-parser.ts");
const { buildSearchConditions } = await loadModule("workers/lib/search.ts");

test("quoted values and false filters survive editing and URL serialization", () => {
	const filters = { query: "budget", from: 'John "JD" Doe', subject: "Monthly report", folder: "Case Sensitive Folder", filename: "report.pdf", is_read: false, is_starred: false, has_attachment: false, date_start: "2026-01-01T00:00:00.000Z", date_end: "2026-01-31T23:59:59.999Z" };
	const query = buildSearchQuery(filters);
	assert.deepEqual(parseSearchQuery(query), filters);
	assert.deepEqual(searchQueryParams(query), Object.fromEntries(Object.entries(filters).map(([key, value]) => [key, String(value)])));
});

test("unknown filters, embedded addresses, and invalid dates stay searchable", () => {
	assert.equal(parseSearchQuery("is:important has:invalid before:2026-02-30 namefrom:alice").query, "is:important has:invalid before:2026-02-30 namefrom:alice");
	assert.equal(parseSearchQuery("subject:\"\" after:invalid").query, 'subject:"" after:invalid');
	assert.equal(parseSearchQuery("before:2026-01-31").date_end, "2026-01-31T23:59:59.999Z");
});

const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE folders (id TEXT PRIMARY KEY, name TEXT);
	CREATE TABLE emails (id TEXT PRIMARY KEY, folder_id TEXT, subject TEXT, body TEXT, sender TEXT, recipient TEXT, cc TEXT, bcc TEXT, date TEXT, read INTEGER, starred INTEGER);
	CREATE TABLE attachments (email_id TEXT, filename TEXT);
	INSERT INTO folders VALUES ('inbox', 'Inbox'), ('custom', 'Client Reports');
	INSERT INTO emails VALUES
		('one', 'inbox', 'Monthly 100% report', 'Budget approved', 'John Doe <john@example.com>', 'team@example.com', 'alice@example.com', NULL, '2026-01-31T18:00:00.000Z', 0, 1),
		('two', 'custom', 'Monthly 1000 report', 'Budget declined', 'other@example.com', 'team@example.com', NULL, 'alice@example.com', '2026-02-01T00:00:00.000Z', 1, 0),
		('three', 'inbox', 'Monthly report', 'Budget declined', 'other@example.com', 'team@example.com', NULL, NULL, '2026-01-01T00:00:00.000Z', 1, 0);
	INSERT INTO attachments VALUES ('one', 'report.pdf'), ('one', 'report-final.pdf'), ('two', 'budget.csv');`);

function search(input) {
	const filters = parseSearchQuery(input);
	const { conditions, params } = buildSearchConditions(filters, "e");
	const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
	const rows = db.prepare(`SELECT e.id FROM emails e ${where} ORDER BY e.id`).all(...params);
	const count = buildSearchConditions(filters);
	const countWhere = count.conditions.length ? `WHERE ${count.conditions.join(" AND ")}` : "";
	assert.equal(db.prepare(`SELECT COUNT(*) AS total FROM emails ${countWhere}`).get(...count.params).total, rows.length);
	return rows.map((row) => row.id);
}

test("combined filters match the full body, CC, filename, and inclusive end day", () => {
	assert.deepEqual(search('budget from:"John Doe" to:alice filename:pdf is:unread is:starred after:2026-01-01 before:2026-01-31'), ["one"]);
	assert.deepEqual(search("to:alice is:read"), ["two"]);
});

test("attachment presence and absence return distinct messages with matching counts", () => {
	assert.deepEqual(search("has:attachment"), ["one", "two"]);
	assert.deepEqual(search("has:noattachment"), ["three"]);
	assert.deepEqual(search("filename:pdf"), ["one"]);
});

test("folder selection supports custom names, IDs, and all folders", () => {
	assert.deepEqual(search('in:"Client Reports"'), ["two"]);
	assert.deepEqual(search("in:inbox"), ["one", "three"]);
	assert.deepEqual(search("in:activity"), ["one", "three", "two"]);
});

test("literal wildcard characters and SQL-looking text never widen the search", () => {
	assert.deepEqual(search("100%"), ["one"]);
	assert.deepEqual(search("subject:Monthly_"), []);
	assert.deepEqual(search('subject:"\' OR 1=1 --"'), []);
});
