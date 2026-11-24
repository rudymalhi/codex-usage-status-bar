const vscode = require("vscode");
const { readRateLimits } = require("./codex-client.cjs");
const { formatUsage } = require("./usage.cjs");
const { renderTooltip } = require("./tooltip.cjs");

function activate(context) {
  const item = vscode.window.createStatusBarItem(
    "codexUsage",
    vscode.StatusBarAlignment.Right,
    100,
  );
  item.name = "Codex Usage";
  item.command = "codexUsage.refresh";
  item.text = "Codex: loading…";
  item.show();
  let timer;
  let activeRequest;
  let disposed = false;
  let lastUsage;

  function updateTooltip(usage) {
    const rendered = renderTooltip(usage, vscode.window.activeColorTheme.kind);
    if (rendered) {
      const tooltip = new vscode.MarkdownString(rendered, true);
      tooltip.supportHtml = true;
      tooltip.isTrusted = { enabledCommands: ["codexUsage.refresh", "codexUsage.openSettings"] };
      item.tooltip = tooltip;
    } else {
      item.tooltip = usage.tooltip;
    }
    item.accessibilityInformation = { label: usage.tooltip };
  }

  async function refresh() {
    if (activeRequest || disposed) return;
    const controller = new AbortController();
    activeRequest = controller;
    item.text = "$(sync~spin) Codex";
    try {
      const config = vscode.workspace.getConfiguration("codexUsage");
      const result = await readRateLimits(config.get("executablePath", "codex"), {
        signal: controller.signal,
      });
      if (disposed || controller.signal.aborted) return;
      const workingDays = config.get("workingDays", [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
      ]);
      const usage = formatUsage(result, new Date(), workingDays);
      lastUsage = usage;
      item.text = usage.text;
      item.backgroundColor = usage.ahead ? new vscode.ThemeColor("statusBarItem.warningBackground") : undefined;
      updateTooltip(usage);
    } catch (error) {
      if (disposed || controller.signal.aborted) return;
      lastUsage = undefined;
      item.text = "$(warning) Codex";
      item.backgroundColor = undefined;
      item.tooltip = `${error.message}\n\nClick to retry. Command Palette: Codex Usage: Open Settings.`;
      item.accessibilityInformation = { label: item.tooltip };
    } finally {
      if (activeRequest === controller) activeRequest = undefined;
    }
  }

  function restart() {
    clearInterval(timer);
    activeRequest?.abort();
    activeRequest = undefined;
    const configured = vscode.workspace
      .getConfiguration("codexUsage")
      .get("refreshIntervalSeconds", 60);
    const seconds = Number.isFinite(configured) ? Math.max(30, Math.min(3600, configured)) : 60;
    timer = setInterval(() => void refresh(), seconds * 1000);
    void refresh();
  }

  context.subscriptions.push(
    item,
    vscode.commands.registerCommand("codexUsage.refresh", refresh),
    vscode.commands.registerCommand("codexUsage.openSettings", () =>
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        `@ext:${context.extension.id}`,
      ),
    ),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("codexUsage")) restart();
    }),
    vscode.window.onDidChangeActiveColorTheme(() => {
      if (lastUsage) updateTooltip(lastUsage);
    }),
    {
      dispose() {
        disposed = true;
        clearInterval(timer);
        activeRequest?.abort();
      },
    },
  );
  restart();
}

module.exports = { activate };
