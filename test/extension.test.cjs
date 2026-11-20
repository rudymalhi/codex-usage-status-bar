const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");
const { formatUsage } = require("../src/usage.cjs");
const { renderTooltip } = require("../src/tooltip.cjs");

// Exercise the extension lifecycle without launching an editor or using real timers.
function host() {
  const item = { show() {}, dispose() {} };
  const commands = new Map();
  const timers = new Map();
  const requests = [];
  const executed = [];
  let changed;
  let interval = 60;
  let themeChanged;
  const context = { subscriptions: [], extension: { id: "rudy-malhi.codex-usage-status-bar" } };
  const vscode = {
    ThemeColor: class { constructor(id) { this.id = id; } },
    MarkdownString: class {
      constructor(value, supportThemeIcons) {
        this.value = value;
        this.supportThemeIcons = supportThemeIcons;
      }
    },
    StatusBarAlignment: { Right: 2 },
    window: {
      createStatusBarItem: () => item,
      activeColorTheme: { kind: 2 },
      onDidChangeActiveColorTheme(callback) {
        themeChanged = callback;
        return { dispose() {} };
      },
    },
    workspace: {
      getConfiguration: () => ({
        get: (key, fallback) => (key === "refreshIntervalSeconds" ? interval : fallback),
      }),
      onDidChangeConfiguration(callback) {
        changed = callback;
        return { dispose() {} };
      },
    },
    commands: {
      executeCommand(...args) {
        executed.push(args);
      },
      registerCommand(name, callback) {
        commands.set(name, callback);
        return { dispose() {} };
      },
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/extension.cjs"), "utf8"), {
    module,
    require(name) {
      if (name === "vscode") return vscode;
      if (name === "./usage.cjs") return { formatUsage };
      if (name === "./tooltip.cjs") return { renderTooltip };
      if (name === "./codex-client.cjs")
        return {
          readRateLimits(executable, { signal }) {
            return new Promise((resolve, reject) => {
              requests.push({ resolve, reject, signal });
              signal.addEventListener("abort", () => reject(new Error("cancelled")), {
                once: true,
              });
            });
          },
        };
      throw new Error(`Unexpected import: ${name}`);
    },
    AbortController,
    setInterval(callback, milliseconds) {
      const token = {};
      timers.set(token, { callback, milliseconds });
      return token;
    },
    clearInterval(token) {
      timers.delete(token);
    },
  });
  module.exports.activate(context);
  return {
    item,
    requests,
    timers,
    executed,
    openSettings: () => commands.get("codexUsage.openSettings")(),
    refresh: () => commands.get("codexUsage.refresh")(),
    changeTheme(kind) {
      vscode.window.activeColorTheme = { kind };
      themeChanged();
    },
    configure(seconds) {
      interval = seconds;
      changed({ affectsConfiguration: () => true });
    },
    dispose() {
      context.subscriptions.forEach((subscription) => subscription.dispose());
    },
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("startup renders usage, skips overlapping refreshes, and replaces stale usage on failure", async () => {
  const app = host();
  assert.equal(app.requests.length, 1);
  app.openSettings();
  assert.deepEqual(app.executed[0], [
    "workbench.action.openSettings",
    "@ext:rudy-malhi.codex-usage-status-bar",
  ]);
  assert.equal([...app.timers.values()][0].milliseconds, 60000);
  await app.refresh();
  assert.equal(app.requests.length, 1);
  app.requests[0].resolve({
    rateLimits: { primary: { usedPercent: 12, windowDurationMins: 300 } },
  });
  await flush();
  assert.equal(app.item.text, "Codex: 5h 12%");
  assert.match(app.item.tooltip.value, /data:image\/svg\+xml;base64/);
  assert.deepEqual(Array.from(app.item.tooltip.isTrusted.enabledCommands), [
    "codexUsage.refresh",
    "codexUsage.openSettings",
  ]);
  assert.match(app.item.accessibilityInformation.label, /12% used/);
  const dark = app.item.tooltip.value;
  app.changeTheme(1);
  assert.notEqual(app.item.tooltip.value, dark);
  const refresh = app.refresh();
  app.requests[1].reject(new Error("offline"));
  await refresh;
  assert.equal(app.item.text, "$(warning) Codex");
  assert.match(app.item.tooltip, /offline/);
  app.dispose();
});

test("highlights ahead-of-period usage and clears the highlight on recovery or failure", async () => {
  const app = host();
  const reset = Date.now() / 1000 + 150 * 60;
  app.requests[0].resolve({ rateLimits: { primary: { usedPercent: 75, windowDurationMins: 300, resetsAt: reset } } });
  await flush();
  assert.equal(app.item.backgroundColor.id, "statusBarItem.warningBackground");
  assert.match(app.item.accessibilityInformation.label, /usage ahead of period/);
  let refresh = app.refresh();
  app.requests[1].resolve({ rateLimits: { primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: reset } } });
  await refresh;
  assert.equal(app.item.backgroundColor, undefined);
  refresh = app.refresh();
  app.requests[2].resolve({ rateLimits: { primary: { usedPercent: 75, windowDurationMins: 300, resetsAt: reset } } });
  await refresh;
  refresh = app.refresh();
  app.requests[3].reject(new Error("offline"));
  await refresh;
  assert.equal(app.item.backgroundColor, undefined);
  app.dispose();
});

test("settings restart cancels the old request and ignores its result; dispose cancels work", async () => {
  const app = host();
  app.configure(1);
  assert.equal(app.requests[0].signal.aborted, true);
  assert.equal(app.requests.length, 2);
  assert.equal(app.timers.size, 1);
  assert.equal([...app.timers.values()][0].milliseconds, 30000);
  await flush();
  app.requests[1].resolve({ rateLimits: { primary: { usedPercent: 7 } } });
  await flush();
  assert.equal(app.item.text, "Codex: Primary 7%");
  const pending = app.refresh();
  app.dispose();
  await pending;
  assert.equal(app.requests[2].signal.aborted, true);
  assert.equal(app.timers.size, 0);
  await app.refresh();
  assert.equal(app.requests.length, 3);
});
