import test from "node:test";
import assert from "node:assert/strict";
import {
  addDaysISO,
  buildDaySummary,
  calculateActionStreak,
  calculateWeekCompletionRate,
  cycleDayLabel,
  getCycleDates,
  getCycleDayNumber,
  getLastNDays,
  getWeekRange,
} from "./homeStats.js";

test("date helpers cross month boundaries", () => {
  assert.equal(addDaysISO("2026-06-01", -1), "2026-05-31");
  assert.deepEqual(getLastNDays("2026-06-02", 3), ["2026-05-31", "2026-06-01", "2026-06-02"]);
  assert.deepEqual(getWeekRange("2026-06-11"), { start: "2026-06-08", end: "2026-06-14" });
});

test("cycle day numbers start at the configured cycle start date", () => {
  assert.equal(getCycleDayNumber("2026-06-05", "2026-06-07"), null);
  assert.equal(getCycleDayNumber("2026-06-06", "2026-06-07"), null);
  assert.equal(getCycleDayNumber("2026-06-07", "2026-06-07"), 1);
  assert.equal(getCycleDayNumber("2026-06-08", "2026-06-07"), 2);
  assert.equal(getCycleDayNumber("2026-06-11", "2026-06-07"), 5);
  assert.equal(cycleDayLabel("2026-06-06", "2026-06-07"), "—");
  assert.equal(cycleDayLabel("2026-06-11", "2026-06-07"), "D5");
});

test("cycle day numbers handle same-day, before-start, cross-month, and cross-year ranges", () => {
  assert.equal(getCycleDayNumber("2026-06-07", "2026-06-07"), 1);
  assert.equal(getCycleDayNumber("2026-06-06", "2026-06-07"), null);
  assert.equal(getCycleDayNumber("2026-07-01", "2026-06-30"), 2);
  assert.equal(getCycleDayNumber("2027-01-01", "2026-12-31"), 2);
});

test("cycle date ranges do not include days before the cycle start", () => {
  assert.deepEqual(getCycleDates({ endDate: "2026-06-11", cycleStartDate: "2026-06-07", count: 7 }), [
    "2026-06-07",
    "2026-06-08",
    "2026-06-09",
    "2026-06-10",
    "2026-06-11",
  ]);
  assert.deepEqual(getCycleDates({ endDate: "2026-06-07", cycleStartDate: "2026-06-07", count: 7 }), ["2026-06-07"]);
  assert.deepEqual(getCycleDates({ endDate: "2026-06-06", cycleStartDate: "2026-06-07", count: 7 }), []);
  assert.deepEqual(getCycleDates({ endDate: "2027-01-02", cycleStartDate: "2026-12-31", count: 7 }), [
    "2026-12-31",
    "2027-01-01",
    "2027-01-02",
  ]);
});

test("day summary treats A/B/C or completed tasks as action", () => {
  assert.equal(buildDaySummary({ tasks: [], record: { rating: "D" }, computedRating: "D" }).action, false);
  assert.equal(buildDaySummary({ tasks: [{ done: true }], record: {}, computedRating: "C" }).action, true);
  assert.equal(buildDaySummary({ tasks: [], record: { rating: "B" }, computedRating: "B" }).action, true);
});

test("action streak starts from today or latest recorded date", () => {
  const summaries = {
    "2026-06-07": { hasRecord: true, action: true },
    "2026-06-08": { hasRecord: true, action: true },
    "2026-06-09": { hasRecord: true, action: false },
    "2026-06-10": { hasRecord: true, action: true },
  };
  assert.equal(calculateActionStreak(summaries, "2026-06-11"), 1);
  assert.equal(calculateActionStreak({ ...summaries, "2026-06-11": { hasRecord: true, action: true } }, "2026-06-11"), 2);
});

test("week completion rate uses task totals only", () => {
  const result = calculateWeekCompletionRate(
    {
      "2026-06-08": { total: 2, done: 1 },
      "2026-06-09": { total: 1, done: 1 },
      "2026-06-15": { total: 10, done: 10 },
    },
    "2026-06-11",
  );
  assert.equal(result.total, 3);
  assert.equal(result.done, 2);
  assert.equal(result.rate, 67);
});
