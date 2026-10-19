import assert from "node:assert/strict";
import { test } from "node:test";
import { FiltersSchema, filtersKey, findMatchingRule, ruleMatches } from "../workers/lib/filters.ts";

const rule = (conditions, actions = { folder: "archive" }, enabled = true, id = "r1") => ({ id, enabled, conditions, actions });
const message = { from: "billing@shop.example.com", to: "me@example.com", subject: "Your Invoice #42", body: "Thanks for your order." };

test("conditions are case-insensitive contains", () => {
	assert.equal(ruleMatches(rule({ from: "SHOP.EXAMPLE" }), message), true);
	assert.equal(ruleMatches(rule({ subject: "invoice" }), message), true);
	assert.equal(ruleMatches(rule({ body: "ORDER" }), message), true);
	assert.equal(ruleMatches(rule({ to: "other@" }), message), false);
});

test("all filled conditions must match", () => {
	assert.equal(ruleMatches(rule({ from: "shop", subject: "invoice" }), message), true);
	assert.equal(ruleMatches(rule({ from: "shop", subject: "receipt" }), message), false);
	assert.equal(ruleMatches(rule({ from: "shop", subject: "" }), message), true);
});

test("disabled rules and empty conditions never match", () => {
	assert.equal(ruleMatches(rule({ from: "shop" }, undefined, false), message), false);
	assert.equal(ruleMatches(rule({}), message), false);
	assert.equal(ruleMatches(rule({ from: "" }), message), false);
});

test("missing message fields do not match", () => {
	assert.equal(ruleMatches(rule({ subject: "invoice" }), { from: "a@b.c" }), false);
});

test("first matching rule wins", () => {
	const rules = [rule({ from: "nobody" }, undefined, true, "a"), rule({ subject: "invoice" }, undefined, true, "b"), rule({ from: "shop" }, undefined, true, "c")];
	assert.equal(findMatchingRule(rules, message)?.id, "b");
	assert.equal(findMatchingRule([], message), undefined);
});

test("schema rejects rules without conditions, without actions, or to Sent", () => {
	assert.equal(FiltersSchema.safeParse({ rules: [rule({ from: "x" })] }).success, true);
	assert.equal(FiltersSchema.safeParse({ rules: [rule({ from: "  " })] }).success, false);
	assert.equal(FiltersSchema.safeParse({ rules: [rule({ from: "x" }, {})] }).success, false);
	assert.equal(FiltersSchema.safeParse({ rules: [rule({ from: "x" }, { folder: "sent" })] }).success, false);
	assert.equal(FiltersSchema.safeParse({ rules: [rule({ from: "x" }, { markRead: true, star: true })] }).success, true);
});

test("filters key is per mailbox and case-insensitive", () => {
	assert.equal(filtersKey("Me@Example.com"), filtersKey("me@example.com"));
	assert.notEqual(filtersKey("a@example.com"), filtersKey("b@example.com"));
});

test("body matching ignores HTML tags", async () => {
	const { toFilterMessage } = await import("../workers/lib/filters.ts");
	const msg = toFilterMessage({ sender: "a@b.c", body: "<p>Pay <b>now</b></p>" });
	assert.equal(ruleMatches(rule({ body: "pay  now" }), msg), true);
	assert.equal(ruleMatches(rule({ body: "<b>" }), msg), false);
});
