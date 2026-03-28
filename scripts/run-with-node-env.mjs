import { spawn } from "node:child_process";

const [, , nodeEnv, ...commandParts] = process.argv;

if (!nodeEnv || commandParts.length === 0) {
  console.error(
    "Usage: node scripts/run-with-node-env.mjs <nodeEnv> <command> [...args]"
  );
  process.exit(1);
}

const command = commandParts.join(" ");

const child = spawn(command, {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    NODE_ENV: nodeEnv,
  },
});

child.on("exit", code => {
  process.exit(code ?? 0);
});

child.on("error", error => {
  console.error(error);
  process.exit(1);
});
