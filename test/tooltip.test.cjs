const assert = require("node:assert/strict");
const { test } = require("node:test");
const { formatUsage } = require("../src/usage.cjs");
const { renderTooltip } = require("../src/tooltip.cjs");

function svg(markdown) {
  return Buffer.from(markdown.match(/base64,([A-Za-z0-9+/=]+)/)[1], "base64").toString("utf8");
}

test("identifies the window whose usage is ahead of elapsed time", () => {
  const now = new Date("2026-11-20T12:00:00Z");
  const usage = formatUsage({ rateLimits: {
    primary: { usedPercent: 75, windowDurationMins: 300, resetsAt: now.getTime() / 1000 + 150 * 60 },
    secondary: { usedPercent: 25, windowDurationMins: 300, resetsAt: now.getTime() / 1000 + 150 * 60 },
  } }, now);
  for (const theme of [1, 2]) {
    const card = svg(renderTooltip(usage, theme));
    assert.match(card, /50% of period elapsed · ahead/);
    assert.match(card, /50% of period elapsed<\/text>/);
    assert.match(card, new RegExp(`width="240" height="4" rx="2" fill="${theme === 1 ? "#a14b00" : "#ffb454"}"`));
  }
});

test("renders the compact credits card with aligned reset time and proportional progress", () => {
  const usage = formatUsage({
    rateLimits: {
      planType: "business",
      individualLimit: { limit: "4500", used: "1350", remainingPercent: 70, resetsAt: 1796083200 },
    },
  });
  const markdown = renderTooltip(usage);
  const card = svg(markdown);
  assert.match(card, /Codex Business/);
  assert.match(card, />Credits<\/text>/);
  assert.match(card, /text-anchor="end">Resets /);
  assert.match(card, /font-size="22" font-weight="700">30%/);
  assert.match(card, /width="96" height="4"/);
  assert.match(card, /Credits used/);
  assert.match(card, /Credits remaining/);
  assert.ok(card.includes(new Intl.NumberFormat().format(1350)));
  assert.ok(card.includes(new Intl.NumberFormat().format(3150)));
  assert.match(markdown, /command:codexUsage.refresh/);
  assert.match(markdown, /command:codexUsage.openSettings/);
  assert.doesNotMatch(markdown, /https?:\/\//);
});

test("adapts the card to editor theme and supports multiple usage windows", () => {
  const usage = formatUsage({
    rateLimits: {
      primary: { usedPercent: 0, windowDurationMins: 300 },
      secondary: { usedPercent: 100, windowDurationMins: 10080 },
    },
  });
  const dark = svg(renderTooltip(usage, 2));
  const light = svg(renderTooltip(usage, 1));
  assert.match(dark, /5h limit/);
  assert.match(dark, /1w limit/);
  assert.match(dark, /width="0" height="4"/);
  assert.match(dark, /width="320" height="4" rx="2" fill="#3e7f91"/);
  assert.match(light, /fill="#424242"/);
  assert.match(dark, /fill="#cccccc"/);
});

test("escapes SVG content and falls back to plain text when no limits are available", () => {
  const usage = formatUsage({ rateLimits: { primary: { usedPercent: 50 } } });
  usage.tooltip = '<script>alert("unsafe")</script>&';
  const card = svg(renderTooltip(usage));
  assert.doesNotMatch(card, /<script>/);
  assert.match(card, /&lt;script&gt;/);
  assert.equal(renderTooltip(formatUsage({})), null);
});
