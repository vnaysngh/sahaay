import { it, expect } from "vitest";
import {
  resolveLocalTime,
  localDate,
  validateSchedule,
} from "../../apps/web/src/core/followups";
const now = new Date("2026-10-01T00:00:00Z");
it("converts explicit timezone wall times without using machine timezone", () => {
  expect(resolveLocalTime("2026-10-07T10:00", "Asia/Kolkata", now)).toBe(
    "2026-10-07T04:30:00.000Z",
  );
  expect(localDate(new Date("2026-10-07T04:30:00Z"), "Asia/Kolkata")).toBe(
    "2026-10-07T10:00",
  );
  expect(resolveLocalTime("2026-12-01T10:00", "America/New_York", now)).toBe(
    "2026-12-01T15:00:00.000Z",
  );
  expect(resolveLocalTime("2026-10-07T10:00", "Asia/Kathmandu", now)).toBe(
    "2026-10-07T04:15:00.000Z",
  );
});
it("rejects DST gaps/repeated times, invalid dates, missing zone and past times", () => {
  expect(() =>
    resolveLocalTime("2027-03-14T02:30", "America/New_York", now),
  ).toThrow(/does not exist/);
  expect(() =>
    resolveLocalTime("2026-11-01T01:30", "America/New_York", now),
  ).toThrow(/repeats/);
  expect(() =>
    resolveLocalTime("2027-04-04T01:45", "Australia/Lord_Howe", now),
  ).toThrow(/repeats/);
  expect(() =>
    resolveLocalTime("2026-02-30T10:00", "Asia/Kolkata", now),
  ).toThrow();
  expect(() => resolveLocalTime("2026-10-07T10:00", "", now)).toThrow();
  expect(() =>
    resolveLocalTime("2026-09-30T10:00", "Asia/Kolkata", now),
  ).toThrow(/future/);
  expect(() =>
    validateSchedule(
      {
        reason: "test",
        relatedItemId: null,
        localTime: "2026-10-07T10:00",
        timezone: "Asia/Kolkata",
        scheduledFor: "2026-10-07T10:00:00Z",
      },
      now,
    ),
  ).toThrow(/do not agree/);
});
