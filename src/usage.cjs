function windowLabel(minutes, fallback) {
  if (!Number.isFinite(minutes) || minutes <= 0) return fallback;
  if (minutes % 10080 === 0) return `${minutes / 10080}w`;
  if (minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

function creditAmount(value) {
  if (typeof value !== "number" && (typeof value !== "string" || value.trim() === "")) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function creditDetails(limits) {
  const budget = limits?.individualLimit;
  const used = creditAmount(budget?.used);
  const limit = creditAmount(budget?.limit);
  const balance = creditAmount(limits?.credits?.balance);
  const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
  if (used !== null && limit !== null) {
    return [
      `Credits used: ${number.format(used)}`,
      `Credits remaining: ${number.format(Math.max(0, limit - used))}`,
      `Credit limit: ${number.format(limit)}`,
    ];
  }
  return [
    `Credits used: ${used === null ? "unavailable" : number.format(used)}`,
    `Credits remaining: ${limits?.credits?.unlimited ? "unlimited" : balance === null ? "unavailable" : number.format(balance)}`,
  ];
}

const WEEKDAYS = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

function selectedWeekdays(value) {
  if (!Array.isArray(value)) return [1, 2, 3, 4, 5];
  return [...new Set(value.map((day) => WEEKDAYS[day]).filter(Number.isInteger))];
}

function elapsedOnWorkingDays(start, end, now, workingDays) {
  if (!start || !end || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;
  const periodStart = start.getTime();
  const periodEnd = end.getTime();
  const current = now.getTime();
  if (periodEnd <= periodStart || !Number.isFinite(current) || current < periodStart || current > periodEnd || workingDays.length === 0) return null;

  let total = 0;
  let elapsed = 0;
  const day = new Date(periodStart);
  day.setHours(0, 0, 0, 0);
  while (day.getTime() < periodEnd) {
    const dayStart = day.getTime();
    day.setDate(day.getDate() + 1);
    const dayEnd = day.getTime();
    if (workingDays.includes(new Date(dayStart).getDay())) {
      const segmentStart = Math.max(periodStart, dayStart);
      const segmentEnd = Math.min(periodEnd, dayEnd);
      total += segmentEnd - segmentStart;
      elapsed += Math.max(0, Math.min(current, segmentEnd) - segmentStart);
    }
  }
  return total > 0 ? (elapsed / total) * 100 : null;
}

function monthlyStart(reset) {
  if (!reset || !Number.isFinite(reset.getTime())) return null;
  // The protocol supplies the next reset but not the start of the monthly budget.
  // Subtract a calendar month in UTC, clamping dates such as March 31 to February.
  const start = new Date(reset);
  const day = start.getUTCDate();
  start.setUTCDate(1);
  start.setUTCMonth(start.getUTCMonth() - 1);
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  start.setUTCDate(Math.min(day, lastDay));
  return start;
}

function formatUsage(
  result,
  now = new Date(),
  configuredWorkingDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
) {
  const workingDays = selectedWeekdays(configuredWorkingDays);
  // Prefer the general Codex bucket, never accidentally display a model-specific quota.
  const limits = result?.rateLimitsByLimitId?.codex ?? result?.rateLimits;
  const windows = [
    ["primary", "Primary"],
    ["secondary", "Secondary"],
  ].flatMap(([key, fallback]) => {
    const window = limits?.[key];
    if (!window || !Number.isFinite(window.usedPercent)) return [];
    const used = Math.round(Math.min(100, Math.max(0, window.usedPercent)));
    const reset = Number.isFinite(window.resetsAt) ? new Date(window.resetsAt * 1000) : null;
    const duration = Number.isFinite(window.windowDurationMins) ? window.windowDurationMins * 60 * 1000 : NaN;
    const remaining = reset?.getTime() - now.getTime();
    const start = reset && Number.isFinite(duration) && duration > 0
      ? new Date(reset.getTime() - duration)
      : null;
    const elapsed = Number.isFinite(duration) && duration > 0 && Number.isFinite(remaining) && remaining >= 0 && remaining <= duration
      ? elapsedOnWorkingDays(start, reset, now, workingDays)
      : null;
    const ahead = elapsed !== null && Math.min(100, Math.max(0, window.usedPercent)) > elapsed;
    return [{ label: windowLabel(window.windowDurationMins, fallback), used, reset, elapsed, ahead }];
  });
  const budget = limits?.individualLimit;
  if (Number.isFinite(budget?.remainingPercent)) {
    const reset = Number.isFinite(budget.resetsAt) ? new Date(budget.resetsAt * 1000) : null;
    const elapsed = elapsedOnWorkingDays(monthlyStart(reset), reset, now, workingDays);
    const usedPercent = Math.min(100, Math.max(0, 100 - budget.remainingPercent));
    windows.push({
      label: "Budget",
      used: Math.round(usedPercent),
      reset,
      elapsed,
      ahead: elapsed !== null && usedPercent > elapsed,
      estimated: elapsed !== null,
    });
  }
  if (windows.length === 0) {
    return {
      text: "Codex: n/a",
      tooltip: [
        "Codex account limits are unavailable. Sign in to the Codex CLI with a ChatGPT account. API-key usage is not supported.",
        "",
        ...creditDetails(limits),
        "",
        "Click to refresh.",
      ].join("\n"),
    };
  }
  return {
    ahead: windows.some((window) => window.ahead),
    text:
      windows.length === 1 && windows[0].label === "Budget"
        ? `Codex: ${windows[0].used}% used`
        : `Codex: ${windows.map(({ label, used }) => `${label} ${used}%`).join(" · ")}`,
    card: {
      planType: limits?.planType,
      updatedAt: now,
      sections: windows.map((window) => ({
        ...window,
        label: window.label === "Budget" ? "Credits" : `${window.label} limit`,
      })),
      credits: creditDetails(limits),
    },
    tooltip: [
      "Codex account usage — percent used",
      ...windows.map(
        ({ label, used, reset, elapsed, ahead, estimated }) =>
          `${label}: ${used}% used (${100 - used}% remaining)${elapsed !== null && elapsed !== undefined ? ` · ${estimated ? "estimated " : ""}${Math.round(elapsed)}% of period elapsed${ahead ? " · usage ahead of period" : ""}` : ""}${reset && Number.isFinite(reset.getTime()) ? ` · resets ${reset.toLocaleString()}` : ""}`,
      ),
      "",
      ...creditDetails(limits),
      "",
      `Updated ${now.toLocaleTimeString()}`,
      "Click to refresh. Settings: Codex Usage.",
    ].join("\n"),
  };
}

module.exports = { formatUsage };
