const assert = require("node:assert/strict");
const { test } = require("node:test");
const { formatUsage } = require("../src/usage.cjs");

test("compares each window's unrounded usage with elapsed time only when the period is known", () => {
  const now = new Date("2026-11-20T12:00:00Z");
  const reset = now.getTime() / 1000 + 150 * 60;
  const allDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const make = (usedPercent, overrides = {}) => formatUsage({ rateLimits: { primary: { usedPercent, windowDurationMins: 300, resetsAt: reset, ...overrides } } }, now, allDays);
  assert.equal(make(50).ahead, false);
  const ahead = make(50.1);
  assert.equal(ahead.ahead, true);
  assert.match(ahead.tooltip, /50% of period elapsed · usage ahead of period/);
  assert.equal(make(49.9).ahead, false);
  for (const overrides of [{ windowDurationMins: 0 }, { windowDurationMins: "300" }, { resetsAt: undefined }, { resetsAt: reset + 300 * 60 }, { resetsAt: reset - 151 * 60 }]) {
    assert.equal(make(100, overrides).ahead, false);
  }
});

test("compares individual budgets against an estimated monthly period", () => {
  const reset = Date.parse("2026-12-01T00:00:00Z") / 1000;
  const allDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const make = (now, remainingPercent = 25, resetsAt = reset) => formatUsage({ rateLimits: { individualLimit: { remainingPercent, resetsAt } } }, new Date(now), allDays);
  const ahead = make("2026-11-20T00:00:00Z");
  assert.equal(ahead.ahead, true);
  assert.match(ahead.tooltip, /estimated 63% of period elapsed · usage ahead of period/);
  assert.equal(make("2026-11-25T00:00:00Z").ahead, false);
  assert.equal(make("2026-12-02T00:00:00Z").ahead, false);
  assert.equal(make("2026-11-20T00:00:00Z", 25, null).ahead, false);
  const marchReset = Date.parse("2024-03-31T00:00:00Z") / 1000;
  assert.match(make("2024-03-15T12:00:00Z", 25, marchReset).tooltip, /estimated 50% of period elapsed/);
});

test("counts only selected weekdays when calculating quota period elapsed time", () => {
  const start = new Date(2026, 10, 16, 0, 0, 0);
  const now = new Date(2026, 10, 19, 12, 0, 0);
  const reset = new Date(2026, 10, 23, 0, 0, 0);
  const result = { rateLimits: { primary: {
    usedPercent: 70,
    windowDurationMins: (reset - start) / 60000,
    resetsAt: reset.getTime() / 1000,
  } } };
  const usage = formatUsage(result, now, ["Monday", "Wednesday", "Friday"]);
  assert.ok(Math.abs(usage.card.sections[0].elapsed - (200 / 3)) < 0.001);
  assert.equal(usage.ahead, true);
});

test("disables elapsed comparisons when no working days are selected", () => {
  const now = new Date("2026-11-20T12:00:00Z");
  const reset = now.getTime() / 1000 + 150 * 60;
  const usage = formatUsage({ rateLimits: { primary: {
    usedPercent: 100,
    windowDurationMins: 300,
    resetsAt: reset,
  } } }, now, []);
  assert.equal(usage.card.sections[0].elapsed, null);
  assert.equal(usage.ahead, false);
});

test("shows business budget percentages and actual credits used and remaining", () => {
  const reset = new Date("2026-12-01T00:00:00Z");
  const usage = formatUsage({
    rateLimits: {
      primary: null,
      secondary: null,
      individualLimit: {
        limit: "4500",
        used: "1340.2171339988708",
        remainingPercent: 70,
        resetsAt: reset.getTime() / 1000,
      },
    },
  });
  const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
  assert.equal(usage.text, "Codex: 30% used");
  assert.match(usage.tooltip, /Budget: 30% used \(70% remaining\)/);
  assert.ok(usage.tooltip.includes(reset.toLocaleString()));
  assert.ok(usage.tooltip.includes(`Credits used: ${number.format(1340.2171339988708)}`));
  assert.ok(
    usage.tooltip.includes(`Credits remaining: ${number.format(4500 - 1340.2171339988708)}`),
  );
});

test("shows account budget alongside time windows when both apply", () => {
  const usage = formatUsage({
    rateLimits: {
      primary: { usedPercent: 12, windowDurationMins: 300 },
      individualLimit: { remainingPercent: 55 },
    },
  });
  assert.equal(usage.text, "Codex: 5h 12% · Budget 45%");
});

test("does not infer credit usage from a balance or quota percentages", () => {
  const usage = formatUsage({
    rateLimits: {
      primary: { usedPercent: 50 },
      credits: { balance: "45.5", hasCredits: true, unlimited: false },
    },
  });
  assert.match(usage.tooltip, /Credits used: unavailable/);
  assert.ok(usage.tooltip.includes(`Credits remaining: ${new Intl.NumberFormat().format(45.5)}`));
});

test("supports exhausted budgets, unlimited balances, and invalid credit amounts", () => {
  const exhausted = formatUsage({
    rateLimits: {
      individualLimit: { limit: "10", used: "12", remainingPercent: 0 },
    },
  });
  assert.match(exhausted.tooltip, /Credits remaining: 0/);
  const unlimited = formatUsage({ rateLimits: { credits: { unlimited: true } } });
  assert.match(unlimited.tooltip, /Credits remaining: unlimited/);
  const invalid = formatUsage({ rateLimits: { individualLimit: { limit: null, used: "" } } });
  assert.match(invalid.tooltip, /Credits used: unavailable/);
  assert.match(invalid.tooltip, /Credits remaining: unavailable/);
});

test("shows both actual window durations and used percentages with reset details", () => {
  const reset = new Date("2026-11-12T16:00:00Z");
  const usage = formatUsage({
    rateLimits: {
      primary: { usedPercent: 24.4, windowDurationMins: 300, resetsAt: reset.getTime() / 1000 },
      secondary: { usedPercent: 61, windowDurationMins: 10080 },
    },
  });
  assert.equal(usage.text, "Codex: 5h 24% · 1w 61%");
  assert.ok(usage.tooltip.includes(reset.toLocaleString()));
  assert.match(usage.tooltip, /76% remaining/);
});

test("prefers the general Codex bucket over the compatibility bucket", () => {
  const usage = formatUsage({
    rateLimitsByLimitId: { codex: { primary: { usedPercent: 0, windowDurationMins: 15 } } },
    rateLimits: { primary: { usedPercent: 90, windowDurationMins: 300 } },
  });
  assert.equal(usage.text, "Codex: 15m 0%");
});

test("handles absent and invalid quota windows without inventing usage", () => {
  for (const result of [
    undefined,
    {},
    { rateLimits: { primary: { usedPercent: "25" } } },
    { rateLimitsByLimitId: { modelOnly: { primary: { usedPercent: 5 } } } },
  ]) {
    assert.equal(formatUsage(result).text, "Codex: n/a");
  }
});

test("supports a secondary-only window and bounds usage percentages", () => {
  assert.equal(
    formatUsage({ rateLimits: { secondary: { usedPercent: 100.2, windowDurationMins: 1440 } } })
      .text,
    "Codex: 1d 100%",
  );
  assert.equal(
    formatUsage({ rateLimits: { primary: { usedPercent: -1 } } }).text,
    "Codex: Primary 0%",
  );
});
