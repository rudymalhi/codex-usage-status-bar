# Codex Usage Status Bar

A small, dependency-free VS Code extension that shows the percentage of your
Codex account quota used, for example:

```text
Codex: 5h 24% · 1w 61%
```

Business accounts with an individual usage budget instead show `Codex: 30% used`.
If the account has both quota windows and a budget, both are displayed.

Hover for credits used and remaining, remaining percentages, local reset times,
and the last refresh time. Credit amounts show up to two decimal places. For
accounts with an individual budget, remaining credits are the budget limit minus
actual credits used. If Codex only returns a credit balance, usage is marked
unavailable; quota percentages are never converted into invented credit amounts.
The tooltip uses a compact card with a plan header, large usage percentages,
progress bars, and reset times. Its colors follow light and dark editor themes.
When usage exceeds the elapsed share of a quota window, the status bar is
highlighted and the tooltip identifies the window and elapsed percentage. This
comparison requires a valid window duration and reset time. For individual
budgets, the elapsed percentage is estimated from the preceding calendar month
in UTC because Codex supplies a reset time but not the period start. Elapsed
percentages count only the configured working weekdays, using your local timezone.
Refresh and Settings links are available beneath the card.
Click to refresh. Usage refreshes every 60 seconds by default. The labels follow
the quota window durations returned by Codex; they are not hard-coded.

## Install

1. Install the [Codex CLI](https://developers.openai.com/codex/cli) and run
   `codex login` using your ChatGPT account.
2. In VS Code, run **Extensions: Install from VSIX…** from the Command Palette
   and select `codex-usage-status-bar-0.1.3.vsix`.
3. If VS Code cannot find `codex`, set **Codex Usage: Executable Path** to the
   absolute path printed by `command -v codex` (Windows: `where.exe codex`).
   Use the executable itself, not a command with arguments.

The packaged extension runs on desktop VS Code, including with remote workspaces.
It reads the account logged in on your local machine. VS Code for the browser is
not supported. API-key accounts do not provide these ChatGPT quota windows.

## Settings and commands

| Setting                             | Default      | Purpose                                      |
| ----------------------------------- | ------------ | -------------------------------------------- |
| `codexUsage.executablePath`         | `codex`      | CLI executable name or absolute path         |
| `codexUsage.refreshIntervalSeconds` | `60`          | Refresh interval, from 30 to 3600 seconds    |
| `codexUsage.workingDays`            | Monday–Friday | Weekdays counted toward elapsed periods      |

These settings are machine settings so a workspace cannot override them.
Set `codexUsage.workingDays` to an empty list to disable elapsed comparisons.
The Command Palette provides **Codex Usage: Refresh** and **Codex Usage: Open Settings**.
Errors appear in the status bar tooltip, without notification popups. A failed
refresh replaces the previous usage so old figures are not presented as current.

## Develop and package

Open this folder in VS Code and press **F5**. No install or build step is needed.

```sh
npm test
npm run package
```

Packaging downloads Microsoft's `@vscode/vsce` tool through `npx`. It creates a
local VSIX; it does not publish the extension.

## Publish to the Marketplace

The extension is configured for publisher ID `rudy-malhi`. Register that publisher
in [Visual Studio Marketplace](https://marketplace.visualstudio.com/manage)
under your Microsoft account before the first release. You can upload the generated
VSIX directly from that publisher's management page. To publish from the CLI, authenticate locally
with a Personal Access Token that has Marketplace **Manage** permission:

```sh
npx --yes @vscode/vsce@4.1.0 login rudy-malhi
npm run publish:marketplace
```

The login command prompts for the token and saves it in the system credential
store. Do not put it in this project. The publish command runs the tests before
uploading the extension.

For automated releases, configure a Marketplace Trusted Publishing policy for
publisher `rudy-malhi`, using this repository's GitHub owner and name and the
workflow filename `publish.yml`. Leave the environment field empty. See
[Trusted Publishing guidance](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing-to-visual-studio-marketplace).
Push a tag matching the version in `package.json` (for example, `v0.1.2`) to
run the workflow. It can also be started manually on that tag. The workflow tests,
packages, and publishes using GitHub OIDC, without a stored Marketplace token.

## How it works

On each refresh, the extension starts `codex app-server --listen stdio://`,
performs the initialization handshake, calls `account/rateLimits/read`, and
shuts the process down. It uses the general `codex` bucket when present, with
the legacy single-bucket response as a fallback. A request times out after
20 seconds, and concurrent refreshes are skipped. Business account budgets use
the `individualLimit` fields from the installed Codex CLI protocol.

This uses the [official Codex app-server protocol](https://developers.openai.com/codex/app-server).
The extension never reads credential files, starts a model turn, or sends
workspace contents. Codex handles authentication and the usage request using
its existing login and configuration. No usage history is stored by the extension.
