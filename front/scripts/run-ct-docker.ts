import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildCtDockerCommand, parsePnpmPackageManager, type CtDockerMode } from "../tests/performance/ct-docker";

const frontRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(frontRoot, "..");

type RootPackageJson = {
  packageManager?: string;
};

function parseMode(argv: string[]): CtDockerMode {
  if (argv.length === 0) return "verify";
  if (argv.length === 1 && argv[0] === "--update") return "update";
  throw new Error("Usage: tsx scripts/run-ct-docker.ts [--update]");
}

async function readRootPackageManager(): Promise<string> {
  const packageJson = JSON.parse(await readFile(resolve(repoRoot, "package.json"), "utf8")) as RootPackageJson;
  return packageJson.packageManager ?? "";
}

function runProcess(command: string, args: string[]): Promise<number> {
  return new Promise((resolveExit, reject) => {
    const child = spawn(command, args, {
      cwd: frontRoot,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        console.error(`CT Docker command terminated by ${signal}`);
        resolveExit(1);
        return;
      }
      resolveExit(code ?? 1);
    });
  });
}

async function run() {
  const mode = parseMode(process.argv.slice(2));
  const packageManager = parsePnpmPackageManager(await readRootPackageManager());
  console.log(`Running Playwright CT Docker (${mode}) with ${packageManager.raw}`);
  const dockerCommand = buildCtDockerCommand({
    packageManager,
    mode,
    workspaceHostPath: repoRoot,
  });
  const exitCode = await runProcess(dockerCommand.command, dockerCommand.args);
  process.exitCode = exitCode;
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
