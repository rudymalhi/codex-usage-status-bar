const { spawn } = require("node:child_process");
const { tmpdir } = require("node:os");

// A short-lived, read-only app-server connection; no threads or turns are created.
function readRateLimits(executable, { signal, timeoutMs = 20000, spawnProcess = spawn } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Usage refresh cancelled."));
      return;
    }

    const child = spawnProcess(executable, ["app-server", "--listen", "stdio://"], {
      cwd: tmpdir(),
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "ignore"],
    });
    let buffer = "";
    let phase = "initialize";
    let settled = false;
    const timeout = setTimeout(
      () => finish(new Error("Codex usage request timed out. Click to retry.")),
      timeoutMs,
    );
    const abort = () => finish(new Error("Usage refresh cancelled."));
    signal?.addEventListener("abort", abort, { once: true });

    function finish(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      child.stdin.end();
      child.kill();
      // Do not leave an unresponsive app-server behind after refresh or unload.
      const killTimer = setTimeout(() => child.kill("SIGKILL"), 1000);
      killTimer.unref();
      child.once("close", () => clearTimeout(killTimer));
      if (error) reject(error);
      else resolve(result);
    }

    function send(message) {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    }

    child.on("error", (error) =>
      finish(
        new Error(
          error.code === "ENOENT"
            ? "Codex CLI not found. Install it or set Codex Usage: Executable Path in Settings."
            : "Could not start Codex CLI. Check Codex Usage: Executable Path in Settings.",
        ),
      ),
    );
    child.stdin.on("error", () =>
      finish(new Error("Codex app-server closed its input. Update the Codex CLI and retry.")),
    );
    child.on("close", () =>
      finish(
        new Error(
          "Codex app-server exited before returning usage. Check your CLI installation and login.",
        ),
      ),
    );
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      if (settled) return;
      buffer += chunk;
      if (buffer.length > 1024 * 1024) {
        finish(new Error("Codex app-server response was too large."));
        return;
      }
      let newline;
      while (!settled && (newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          finish(
            new Error("Invalid response from Codex app-server. Update the Codex CLI and retry."),
          );
          return;
        }
        if (!message || typeof message !== "object") continue;
        const expectedId = phase === "initialize" ? 1 : 2;
        if (message.id !== expectedId) continue;
        if (message.error) {
          finish(
            new Error(
              'Codex could not read account limits. Run "codex login" with a ChatGPT account, then retry. API-key usage is not supported.',
            ),
          );
          return;
        }
        if (phase === "initialize") {
          phase = "usage";
          send({ method: "initialized" });
          send({ id: 2, method: "account/rateLimits/read" });
        } else {
          finish(null, message.result);
        }
      }
    });

    send({
      id: 1,
      method: "initialize",
      params: {
        clientInfo: {
          name: "codex_usage_status_bar",
          title: "Codex Usage Status Bar",
          version: "0.1.1",
        },
      },
    });
  });
}

module.exports = { readRateLimits };
