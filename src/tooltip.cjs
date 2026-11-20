const planNames = {
  free: "Free",
  plus: "Plus",
  pro: "Pro",
  team: "Team",
  business: "Business",
  enterprise: "Enterprise",
  edu: "Education",
};

function escapeXml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character],
  );
}

function renderTooltip(usage, themeKind = 2) {
  if (!usage.card) return null;
  const light = themeKind === 1 || themeKind === 4;
  const colors = light
    ? { text: "#424242", muted: "#616161", track: "#dddddd", fill: "#317f91", warning: "#a14b00" }
    : { text: "#cccccc", muted: "#999999", track: "#303030", fill: "#3e7f91", warning: "#ffb454" };
  const { planType, sections, credits, updatedAt } = usage.card;
  const title = planNames[planType] ? `Codex ${planNames[planType]}` : "Codex";
  const nodes = [];
  function text(
    x,
    y,
    content,
    { size = 13, color = colors.text, weight = 400, anchor = "start" } = {},
  ) {
    nodes.push(
      `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${escapeXml(content)}</text>`,
    );
  }
  text(0, 14, title);
  nodes.push(`<path d="M0 28H320" stroke="${colors.track}"/>`);
  let y = 50;
  for (const { label, used, reset, elapsed, ahead } of sections) {
    text(0, y, label, { weight: 600 });
    if (reset && Number.isFinite(reset.getTime())) {
      const date = reset.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const time = reset.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
      text(320, y, `Resets ${date} at ${time}`, { size: 12, color: colors.muted, anchor: "end" });
    }
    nodes.push(
      `<text x="0" y="${y + 28}" fill="${ahead ? colors.warning : colors.text}" font-size="22" font-weight="700">${used}%<tspan dx="4" fill="${colors.muted}" font-size="12" font-weight="400">used</tspan></text>`,
    );
    if (elapsed !== null && elapsed !== undefined) {
      text(320, y + 28, `${Math.round(elapsed)}% of period elapsed${ahead ? " · ahead" : ""}`, { size: 12, color: ahead ? colors.warning : colors.muted, anchor: "end" });
    }
    nodes.push(`<rect x="0" y="${y + 40}" width="320" height="4" rx="2" fill="${colors.track}"/>`);
    nodes.push(
      `<rect x="0" y="${y + 40}" width="${(320 * used) / 100}" height="4" rx="2" fill="${ahead ? colors.warning : colors.fill}"/>`,
    );
    y += 70;
  }
  for (const credit of credits) {
    const separator = credit.indexOf(": ");
    text(0, y + 2, credit.slice(0, separator), { size: 12, color: colors.muted });
    text(320, y + 2, credit.slice(separator + 2), { size: 12, anchor: "end" });
    y += 20;
  }
  text(
    0,
    y + 4,
    `Updated ${updatedAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`,
    { size: 11, color: colors.muted },
  );
  y += 18;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="${y - 8}" viewBox="0 0 320 ${y - 8}" role="img"><title>${escapeXml(usage.tooltip)}</title><g font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">${nodes.join("")}</g></svg>`;
  const image = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  return [
    `![Codex usage summary](${image})`,
    "",
    '[↻ Refresh](command:codexUsage.refresh "Refresh usage") &nbsp; · &nbsp; [$(settings-gear) Settings](command:codexUsage.openSettings "Open Codex Usage settings")',
  ].join("\n");
}

module.exports = { renderTooltip };
