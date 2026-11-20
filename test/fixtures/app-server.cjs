const readline = require("node:readline");
const mode = process.argv[2];
let initialized = false;
let acknowledged = false;
const input = readline.createInterface({ input: process.stdin });
input.on("line", (line) => {
  const message = JSON.parse(line);
  if (mode === "timeout") return;
  if (mode === "exit") {
    process.exit(1);
  }
  if (mode === "malformed") {
    process.stdout.write("not json\n");
    return;
  }
  if (message.method === "initialize") {
    initialized = true;
    process.stdout.write('{"id":1,"res');
    setTimeout(() => process.stdout.write('ult":{}}\n'), 5);
  } else if (message.method === "initialized") {
    acknowledged = true;
  } else if (message.method === "account/rateLimits/read") {
    if (!initialized || !acknowledged) process.exit(2);
    if (mode === "rpc-error") {
      process.stdout.write('{"id":2,"error":{"code":-32000,"message":"login required"}}\n');
      return;
    }
    process.stdout.write('{"method":"account/rateLimits/updated","params":{}}\n');
    process.stdout.write(
      JSON.stringify({
        id: 2,
        result: {
          rateLimits: {
            primary: { usedPercent: 24, windowDurationMins: 300, resetsAt: 1800000000 },
            secondary: { usedPercent: 61, windowDurationMins: 10080, resetsAt: 1800500000 },
          },
        },
      }) + "\n",
    );
  }
});
