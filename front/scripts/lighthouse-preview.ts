import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { buildPreviewCommand, previewOutputDir } from "../tests/performance/lighthouse-preview";
import type { LighthouseRouteGroup } from "../tests/lighthouse/types";

function stringArg(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function parseGroup(value: string | undefined): LighthouseRouteGroup | undefined {
  if (value === undefined) return undefined;
  if (value === "public" || value === "member" || value === "host" || value === "admin") return value;
  throw new Error(`Unsupported --group value: ${value}`);
}

function parseLimit(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--limit must be a positive integer, received ${value}`);
  }
  return parsed;
}

function timestampSlug(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

async function findFreePort() {
  return await new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolvePort(address.port);
        else reject(new Error("Unable to allocate preview port"));
      });
    });
  });
}

function runCommand(command: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function waitForPreview(baseUrl: string) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Vite preview did not become ready at ${baseUrl}`);
}

async function run() {
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const outputDir = previewOutputDir(timestampSlug());

  await runCommand("pnpm", ["build"]);

  const preview = spawn("pnpm", ["preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    stdio: "inherit",
    env: process.env,
  });

  try {
    await waitForPreview(baseUrl);
    const command = buildPreviewCommand({
      baseUrl,
      outputDir,
      group: parseGroup(stringArg("--group")),
      limit: parseLimit(stringArg("--limit")),
    });
    await runCommand(command.command, command.args, command.env);
  } finally {
    preview.kill("SIGTERM");
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
