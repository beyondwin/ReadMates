import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { ApprovedComparisonReport } from "../tests/e2e/support/approved-mockup-contract";
import { APPROVED_MOCKUPS } from "../tests/e2e/support/approved-mockup-manifest";
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

type FoundApprovedReport = {
  id: string;
  reportPath: string;
  directory: string;
  mtimeMs: number;
};

function walkApprovedMockupReports(directory: string, found: FoundApprovedReport[]): void {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      walkApprovedMockupReports(path, found);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith("-report.json")) continue;
    if (!directory.endsWith("approved-mockup")) continue;
    const id = entry.name.slice(0, -"-report.json".length);
    found.push({
      id,
      reportPath: path,
      directory,
      mtimeMs: statSync(path).mtimeMs,
    });
  }
}

function writeVisualAuthorityCompareSummary(): void {
  const found: FoundApprovedReport[] = [];
  walkApprovedMockupReports(resolve(frontRoot, "test-results"), found);
  const newestById = new Map<string, FoundApprovedReport>();
  for (const item of found) {
    const previous = newestById.get(item.id);
    if (!previous || item.mtimeMs >= previous.mtimeMs) newestById.set(item.id, item);
  }
  const screens = [...newestById.values()].map((item) => {
    const report = JSON.parse(readFileSync(item.reportPath, "utf8")) as ApprovedComparisonReport;
    const compareDirectory = resolve(repoRoot, ".tmp/visual-authority-compare", item.id);
    mkdirSync(compareDirectory, { recursive: true });
    copyFileSync(item.reportPath, join(compareDirectory, "report.json"));
    for (const suffix of ["reference.png", "candidate.png", "overlay.png", "diff.png"] as const) {
      const source = join(item.directory, `${item.id}-${suffix}`);
      if (existsSync(source)) copyFileSync(source, join(compareDirectory, suffix));
    }
    return {
      id: report.id,
      ratio: report.mismatchPixelRatio,
      pct: Math.round(report.mismatchPixelRatio * 10_000) / 100,
      verdict: report.verdict,
      mismatchPassed: report.mismatchPassed,
      geometryPass: report.geometry.every((region) => region.passed),
      structurePass: Array.isArray(report.structure) && report.structure.every((entry) => entry.passed),
      typographyPass: report.typography.every((entry) => entry.passed),
      firstViewportPass: report.firstViewport.every((entry) => entry.passed),
    };
  });
  const order = new Map(APPROVED_MOCKUPS.map((entry, index) => [entry.id, index]));
  screens.sort((left, right) => (order.get(left.id) ?? 999) - (order.get(right.id) ?? 999));
  const summaryDirectory = resolve(repoRoot, ".tmp/visual-authority-compare");
  mkdirSync(summaryDirectory, { recursive: true });
  writeFileSync(join(summaryDirectory, "summary.json"), `${JSON.stringify({ screens }, null, 2)}\n`);
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
  try {
    writeVisualAuthorityCompareSummary();
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : error);
  }
  if (result.code === 0) {
    assertPlaywrightRunExecutedMatchingTests(result.output);
  }
  process.exitCode = result.code;
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
