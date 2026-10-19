import assert from "node:assert/strict";
import { test } from "node:test";
import { monthGrid, sendLaterPresets, snoozePresets } from "../shared/schedule-time.ts";

const pad = (value) => String(value).padStart(2, "0");
const local = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
const presets = (list) => Object.fromEntries(list.map((preset) => [preset.id, local(preset.date)]));

test("weekday morning shows every snooze preset", () => {
	// Monday 19 October 2026, 10:30 local time.
	assert.deepEqual(presets(snoozePresets(new Date(2026, 9, 19, 10, 30))), {
		later: "2026-10-19T18:00",
		tomorrow: "2026-10-20T08:00",
		weekend: "2026-10-24T08:00",
		"next-week": "2026-10-26T08:00",
	});
});

test("evening hides Later today; Friday weekend is the next day", () => {
	assert.deepEqual(presets(snoozePresets(new Date(2026, 9, 23, 19, 0))), {
		tomorrow: "2026-10-24T08:00",
		weekend: "2026-10-24T08:00",
		"next-week": "2026-10-26T08:00",
	});
});

test("weekend hides This weekend; Sunday next week is Monday", () => {
	assert.deepEqual(presets(snoozePresets(new Date(2026, 9, 25, 9, 0))), {
		later: "2026-10-25T18:00",
		tomorrow: "2026-10-26T08:00",
		"next-week": "2026-10-26T08:00",
	});
	assert.equal(presets(snoozePresets(new Date(2026, 9, 24, 9, 0)))["next-week"], "2026-10-26T08:00");
});

test("month and year roll over", () => {
	assert.equal(presets(snoozePresets(new Date(2026, 11, 31, 20, 0))).tomorrow, "2027-01-01T08:00");
});

test("send later presets: tomorrow 08:00 and 13:00, next Monday 08:00", () => {
	assert.deepEqual(presets(sendLaterPresets(new Date(2026, 9, 19, 10, 0))), {
		"tomorrow-morning": "2026-10-20T08:00",
		"tomorrow-afternoon": "2026-10-20T13:00",
		monday: "2026-10-26T08:00",
	});
});

test("month grid covers whole weeks from the chosen first weekday", () => {
	// October 2026 starts on a Thursday and has 31 days.
	const monday = monthGrid(2026, 9, 1);
	assert.equal(monday.length, 35);
	assert.equal(local(monday[0]), "2026-09-28T00:00");
	assert.equal(local(monday.at(-1)), "2026-11-01T00:00");
	const sunday = monthGrid(2026, 9, 0);
	assert.equal(local(sunday[0]), "2026-09-27T00:00");
	assert.equal(sunday.length, 35);
	// February 2027 starts on a Monday: exactly four weeks.
	assert.equal(monthGrid(2027, 1, 1).length, 28);
});
