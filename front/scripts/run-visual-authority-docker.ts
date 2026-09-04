import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { parseVisualAuthoritySelection } from "../tests/e2e/support/approved-route-scenarios";
import {
  assertPlaywrightRunExecutedMatchingTests,
  buildVisualAuthorityDockerCommand,
  parsePnpmPackageManager,
} from "../tests/performance/visual-authority-docker";

const frontRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(frontRoot, "..");

type RootPackageJson = {
  packageManager?: string;
};

async function readRootPackageManager(): Promise<string> {
  const packageJson = JSON.parse(await readFile(resolve(repoRoot, "package.json"), "utf8")) as RootPackageJson;
  return packageJson.packageManager ?? "";
}

function runProcess(command: string, args: string[]): Promise<{ code: number; output: string }> {
  return new Promise((resolveExit, reject) => {
    const child = spawn(command, args, {
      cwd: frontRoot,
      stdio: ["inherit", "pipe", "pipe"],
    });
    let output = "";
    child.stdout?.on("data", (chunk: Buffer | string) => {
      const text = String(chunk);
      output += text;
      process.stdout.write(text);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      const text = String(chunk);
      output += text;
      process.stderr.write(text);
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        console.error(`Visual authority Docker command terminated by ${signal}`);
        resolveExit({ code: 1, output });
        return;
      }
      resolveExit({ code: code ?? 1, output });
    });
  });
}

async function run() {
  if (process.argv.slice(2).length > 0) {
    throw new Error("Usage: tsx scripts/run-visual-authority-docker.ts");
  }
  const packageManager = parsePnpmPackageManager(await readRootPackageManager());
  const authorityIds = [...parseVisualAuthoritySelection(process.env.READMATES_VISUAL_AUTHORITY_IDS)];
  console.log(`Running actual-route visual authority Docker with ${packageManager.raw}`);
  const dockerCommand = buildVisualAuthorityDockerCommand({
    packageManager,
    workspaceHostPath: repoRoot,
    authorityIds,
  });
  const result = await runProcess(dockerCommand.command, dockerCommand.args);
  if (result.code === 0) {
    assertPlaywrightRunExecutedMatchingTests(result.output);
  }
  process.exitCode = result.code;
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
