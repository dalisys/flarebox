import assert from "node:assert/strict";
import { test } from "node:test";
import { snoozePresets, toLocalInputValue } from "../shared/snooze.ts";

const local = (date) => toLocalInputValue(date);
const presets = (now) => Object.fromEntries(snoozePresets(now).map((preset) => [preset.id, local(preset.date)]));

test("weekday morning shows every preset", () => {
	// Monday 19 October 2026, 10:30 local time.
	assert.deepEqual(presets(new Date(2026, 9, 19, 10, 30)), {
		later: "2026-10-19T18:00",
		tomorrow: "2026-10-20T08:00",
		weekend: "2026-10-24T08:00",
		"next-week": "2026-10-26T08:00",
	});
});

test("evening hides Later today; Friday weekend is the next day", () => {
	assert.deepEqual(presets(new Date(2026, 9, 23, 19, 0)), {
		tomorrow: "2026-10-24T08:00",
		weekend: "2026-10-24T08:00",
		"next-week": "2026-10-26T08:00",
	});
});

test("weekend hides This weekend; Sunday next week is Monday", () => {
	assert.deepEqual(presets(new Date(2026, 9, 25, 9, 0)), {
		later: "2026-10-25T18:00",
		tomorrow: "2026-10-26T08:00",
		"next-week": "2026-10-26T08:00",
	});
	assert.equal(presets(new Date(2026, 9, 24, 9, 0))["next-week"], "2026-10-26T08:00");
});

test("month and year roll over", () => {
	assert.equal(presets(new Date(2026, 11, 31, 20, 0)).tomorrow, "2027-01-01T08:00");
});
