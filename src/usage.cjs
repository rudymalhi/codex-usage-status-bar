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

function formatUsage(result, now = new Date()) {
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
    const elapsed = Number.isFinite(duration) && duration > 0 && Number.isFinite(remaining) && remaining >= 0 && remaining <= duration
      ? (1 - remaining / duration) * 100
      : null;
    const ahead = elapsed !== null && Math.min(100, Math.max(0, window.usedPercent)) > elapsed;
    return [{ label: windowLabel(window.windowDurationMins, fallback), used, reset, elapsed, ahead }];
  });
  const budget = limits?.individualLimit;
  if (Number.isFinite(budget?.remainingPercent)) {
    windows.push({
      label: "Budget",
      used: Math.round(Math.min(100, Math.max(0, 100 - budget.remainingPercent))),
      reset: Number.isFinite(budget.resetsAt) ? new Date(budget.resetsAt * 1000) : null,
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
        ({ label, used, reset, elapsed, ahead }) =>
          `${label}: ${used}% used (${100 - used}% remaining)${elapsed !== null && elapsed !== undefined ? ` · ${Math.round(elapsed)}% of period elapsed${ahead ? " · usage ahead of period" : ""}` : ""}${reset && Number.isFinite(reset.getTime()) ? ` · resets ${reset.toLocaleString()}` : ""}`,
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
