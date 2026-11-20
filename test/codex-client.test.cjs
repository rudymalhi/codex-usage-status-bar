const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { test } = require("node:test");
const { readRateLimits } = require("../src/codex-client.cjs");

function request(mode, options = {}) {
  let child;
  const result = readRateLimits("codex", {
    timeoutMs: 2000,
    ...options,
    spawnProcess(command, args, spawnOptions) {
      assert.equal(command, "codex");
      assert.deepEqual(args, ["app-server", "--listen", "stdio://"]);
      assert.equal(spawnOptions.shell, false);
      child = spawn(
        process.execPath,
        [path.join(__dirname, "fixtures/app-server.cjs"), mode],
        spawnOptions,
      );
      return child;
    },
  });
  const closed = new Promise((resolve) => child.once("close", resolve));
  return { result, closed };
}

test("reads usage through the handshake with fragmented output and notifications, then exits", async () => {
  const { result, closed } = request("success");
  const usage = await result;
  assert.equal(usage.rateLimits.primary.usedPercent, 24);
  assert.equal(usage.rateLimits.secondary.usedPercent, 61);
  await closed;
});

for (const [mode, message] of [
  ["rpc-error", /codex login/],
  ["malformed", /Invalid response/],
  ["exit", /exited before returning usage/],
  ["timeout", /timed out/],
]) {
  test(`handles ${mode} and shuts down the server`, async () => {
    const { result, closed } = request(mode, mode === "timeout" ? { timeoutMs: 100 } : {});
    await assert.rejects(result, message);
    await closed;
  });
}

test("aborting an active refresh terminates the child process", async () => {
  const controller = new AbortController();
  const { result, closed } = request("timeout", { signal: controller.signal });
  controller.abort();
  await assert.rejects(result, /cancelled/);
  await closed;
});

test("reports a missing executable without an unhandled stream error", async () => {
  await assert.rejects(readRateLimits(path.join(__dirname, "does-not-exist")), /CLI not found/);
});

test("does not start a server when already cancelled", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    readRateLimits("codex", {
      signal: controller.signal,
      spawnProcess() {
        assert.fail("should not spawn");
      },
    }),
    /cancelled/,
  );
});
