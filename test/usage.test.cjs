const assert = require("node:assert/strict");
const { test } = require("node:test");
const { formatUsage } = require("../src/usage.cjs");

test("compares each window's unrounded usage with elapsed time only when the period is known", () => {
  const now = new Date("2026-11-20T12:00:00Z");
  const reset = now.getTime() / 1000 + 150 * 60;
  const make = (usedPercent, overrides = {}) => formatUsage({ rateLimits: { primary: { usedPercent, windowDurationMins: 300, resetsAt: reset, ...overrides } } }, now);
  assert.equal(make(50).ahead, false);
  const ahead = make(50.1);
  assert.equal(ahead.ahead, true);
  assert.match(ahead.tooltip, /50% of period elapsed · usage ahead of period/);
  assert.equal(make(49.9).ahead, false);
  for (const overrides of [{ windowDurationMins: 0 }, { windowDurationMins: "300" }, { resetsAt: undefined }, { resetsAt: reset + 300 * 60 }, { resetsAt: reset - 151 * 60 }]) {
    assert.equal(make(100, overrides).ahead, false);
  }
  assert.equal(formatUsage({ rateLimits: { individualLimit: { remainingPercent: 0, resetsAt: reset } } }, now).ahead, false);
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
