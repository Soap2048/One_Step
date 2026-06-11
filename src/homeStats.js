const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function parseISODate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatISODate(date) {
  return date.toISOString().slice(0, 10);
}

export function addDaysISO(value, delta) {
  const date = parseISODate(value);
  if (!date) return "";
  date.setUTCDate(date.getUTCDate() + delta);
  return formatISODate(date);
}

export function daysBetweenISO(from, to) {
  const start = parseISODate(from);
  const end = parseISODate(to);
  if (!start || !end) return 0;
  return Math.round((end - start) / MS_PER_DAY);
}

export function getLastNDays(endDate, count) {
  return Array.from({ length: count }, (_, index) => addDaysISO(endDate, index - count + 1));
}

export function getWeekRange(date) {
  const parsed = parseISODate(date);
  if (!parsed) return { start: date, end: date };
  const mondayOffset = (parsed.getUTCDay() + 6) % 7;
  parsed.setUTCDate(parsed.getUTCDate() - mondayOffset);
  const start = formatISODate(parsed);
  parsed.setUTCDate(parsed.getUTCDate() + 6);
  return { start, end: formatISODate(parsed) };
}

export function dateLabel(date, today) {
  if (date === today) return "今天";
  const parsed = parseISODate(date);
  if (!parsed) return date.slice(5);
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][parsed.getUTCDay()];
}

export function buildDaySummary({ tasks = [], record = {}, computedRating = "D" } = {}) {
  const done = tasks.filter((task) => task.done).length;
  const savedRating = String(record.rating || "").trim();
  const hasSavedRating = ["A", "B", "C", "D"].includes(savedRating);
  const hasRecord = Boolean(
    tasks.length ||
      hasSavedRating ||
      String(record.todaySentence || "").trim() ||
      String(record.effectiveRecord || "").trim(),
  );

  return {
    total: tasks.length,
    done,
    rating: hasRecord ? computedRating : "",
    hasRecord,
    hasSavedRating,
    // Action means there is evidence of forward movement. A/B/C ratings or
    // completed tasks count; D and note-only records intentionally do not.
    action: ["A", "B", "C"].includes(computedRating) || done > 0,
  };
}

export function calculateActionStreak(summariesByDate, today) {
  const dates = Object.keys(summariesByDate || {}).filter((date) => date <= today && summariesByDate[date]?.hasRecord);
  const anchor = summariesByDate?.[today]?.hasRecord ? today : dates.sort().at(-1);
  if (!anchor) return 0;

  let streak = 0;
  let cursor = anchor;
  while (summariesByDate[cursor]?.hasRecord && summariesByDate[cursor]?.action) {
    streak += 1;
    cursor = addDaysISO(cursor, -1);
  }
  return streak;
}

export function calculateWeekCompletionRate(summariesByDate, today) {
  const range = getWeekRange(today);
  let total = 0;
  let done = 0;
  let cursor = range.start;
  while (cursor && cursor <= range.end) {
    const summary = summariesByDate?.[cursor];
    total += summary?.total || 0;
    done += summary?.done || 0;
    cursor = addDaysISO(cursor, 1);
  }
  return {
    ...range,
    total,
    done,
    rate: total ? Math.round((done / total) * 100) : null,
  };
}
