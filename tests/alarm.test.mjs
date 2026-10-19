import assert from "node:assert/strict";
import { test } from "node:test";
import { isDue, nextAlarmTime, retryTime, MAX_SEND_ATTEMPTS } from "../workers/lib/alarm.ts";

const now = Date.parse("2026-10-19T12:00:00.000Z");

test("items are due at or after their time while tries remain", () => {
	assert.equal(isDue({ at: "2026-10-19T12:00:00.000Z" }, now), true);
	assert.equal(isDue({ at: "2026-10-19T11:00:00.000Z", attempts: 2 }, now), true);
	assert.equal(isDue({ at: "2026-10-19T12:00:01.000Z" }, now), false);
	assert.equal(isDue({ at: "2026-10-19T11:00:00.000Z", attempts: MAX_SEND_ATTEMPTS }, now), false);
});

test("next alarm is the earliest live item across snoozes and sends", () => {
	assert.equal(nextAlarmTime([]), null);
	assert.equal(nextAlarmTime([
		{ at: "2026-10-20T08:00:00.000Z" }, // snooze
		{ at: "2026-10-19T13:00:00.000Z", attempts: 1 }, // send retry
		{ at: "2026-10-19T09:00:00.000Z", attempts: MAX_SEND_ATTEMPTS }, // failed for good
		{ at: "not a date" },
	]), Date.parse("2026-10-19T13:00:00.000Z"));
	assert.equal(nextAlarmTime([{ at: "2026-10-19T09:00:00.000Z", attempts: 3 }]), null);
});

test("retries back off by five minutes per try", () => {
	assert.equal(retryTime(1, now), "2026-10-19T12:05:00.000Z");
	assert.equal(retryTime(2, now), "2026-10-19T12:10:00.000Z");
});
