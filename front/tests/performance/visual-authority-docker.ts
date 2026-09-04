import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import {
  APPROVED_MOCKUPS,
  approvedMockupIdsAffectedBy,
  unmappedVisualSensitivePaths,
  type ApprovedMockupId,
} from "../e2e/support/approved-mockup-manifest";
import {
  parsePnpmPackageManager,
  type PnpmPackageManager,
} from "./ct-docker";

export { parsePnpmPackageManager, type PnpmPackageManager };

export const VISUAL_AUTHORITY_DOCKER_IMAGE = "mcr.microsoft.com/playwright:v1.61.1-jammy";
export const VISUAL_AUTHORITY_ROOT_NODE_MODULES_VOLUME = "readmates-visual-authority-root-node-modules";
export const VISUAL_AUTHORITY_FRONT_NODE_MODULES_VOLUME = "readmates-visual-authority-front-node-modules";
export const VISUAL_AUTHORITY_PNPM_STORE_VOLUME = "readmates-visual-authority-pnpm-store";

export type VisualAuthorityDockerCommandInput = {
  packageManager: PnpmPackageManager;
  workspaceHostPath: string;
  authorityIds: readonly string[];
};

export type VisualAuthorityDockerCommand = {
  command: "docker";
  args: string[];
};

export type AffectedVisualAuthorities = {
  ids: readonly ApprovedMockupId[];
  unmapped: readonly string[];
};

export type ListAffectedIo = {
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  cwd?: string;
  frontRoot?: string;
};

function lastCount(output: string, label: string): number {
  const matches = [...output.matchAll(new RegExp(`(\\d+) ${label}`, "g"))];
  return Number(matches.at(-1)?.[1] ?? 0);
}

export function assertPlaywrightRunExecutedMatchingTests(output: string): void {
  const passed = lastCount(output, "passed");
  const failed = lastCount(output, "failed");
  if (passed + failed === 0) {
    throw new Error("Non-empty visual authority selection executed no matching tests");
  }
}

export function resolveAffectedVisualAuthorities(
  changedPaths: readonly string[],
): AffectedVisualAuthorities {
  return {
    ids: approvedMockupIdsAffectedBy(changedPaths),
    unmapped: unmappedVisualSensitivePaths(changedPaths),
  };
}

function resolveChangedPathsFile(filePath: string, cwd: string, frontRoot: string): string {
  if (isAbsolute(filePath)) return filePath;
  const fromCwd = resolve(cwd, filePath);
  if (existsSync(fromCwd)) return fromCwd;
  return resolve(frontRoot, "..", filePath);
}

function normalizeAffectedCliArgs(args: readonly string[]): string[] {
  return args[0] === "--" ? [...args.slice(1)] : [...args];
}

export function runListAffectedVisualAuthorities(
  args: string[],
  io: ListAffectedIo,
): number {
  const normalized = normalizeAffectedCliArgs(args);
  const changedPathsIndex = normalized.indexOf("--changed-paths-file");
  const requested = changedPathsIndex === 0 ? normalized[1] : undefined;
  if (normalized.length !== 2 || changedPathsIndex !== 0 || !requested || requested.startsWith("-")) {
    io.writeStderr("Usage: list-affected-visual-authorities --changed-paths-file <path>\n");
    return 1;
  }
  const cwd = io.cwd ?? process.cwd();
  const frontRoot = io.frontRoot ?? cwd;
  const changedPathsFile = resolveChangedPathsFile(requested, cwd, frontRoot);
  if (!existsSync(changedPathsFile)) {
    io.writeStderr(`Changed paths file is missing: ${requested}\n`);
    return 1;
  }

  const changedPaths = readFileSync(changedPathsFile, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const result = resolveAffectedVisualAuthorities(changedPaths);
  if (result.unmapped.length > 0) {
    io.writeStderr(`Unmapped visual-sensitive paths: ${result.unmapped.join(", ")}\n`);
    return 1;
  }
  io.writeStdout(`${result.ids.join(",")}\n`);
  return 0;
}

export function buildVisualAuthorityDockerCommand(
  input: VisualAuthorityDockerCommandInput,
): VisualAuthorityDockerCommand {
  const authorityIds = input.authorityIds.join(",");
  const containerScript = [
    "set -eu",
    "corepack enable",
    'corepack prepare "$READMATES_VISUAL_AUTHORITY_PACKAGE_MANAGER" --activate',
    'resolved_pnpm_version="$(pnpm --version)"',
    'expected_pnpm_version="${READMATES_VISUAL_AUTHORITY_PACKAGE_MANAGER#pnpm@}"',
    'if [ "$resolved_pnpm_version" != "$expected_pnpm_version" ]; then',
    '  echo "Expected pnpm $expected_pnpm_version, got $resolved_pnpm_version" >&2',
    "  exit 1",
    "fi",
    "pnpm config set store-dir /pnpm-store",
    "pnpm install --frozen-lockfile",
    "pnpm test:e2e:approved-routes",
  ].join("\n");

  return {
    command: "docker",
    args: [
      "run",
      "--rm",
      "--ipc=host",
      "-e",
      "CI=true",
      "-e",
      "READMATES_VISUAL_AUTHORITY_SMOKE_ONLY=true",
      "-e",
      `READMATES_VISUAL_AUTHORITY_RENDERER_IMAGE=${VISUAL_AUTHORITY_DOCKER_IMAGE}`,
      "-e",
      "READMATES_VISUAL_AUTHORITY_BROWSER=chromium",
      "-e",
      "READMATES_VISUAL_AUTHORITY_PLAYWRIGHT_VERSION=1.61.1",
      "-e",
      `READMATES_VISUAL_AUTHORITY_PNPM_VERSION=${input.packageManager.version}`,
      "-e",
      "READMATES_VISUAL_AUTHORITY_DPR=1",
      "-e",
      "PLAYWRIGHT_WORKERS=1",
      "-e",
      `READMATES_VISUAL_AUTHORITY_PACKAGE_MANAGER=${input.packageManager.raw}`,
      "-e",
      `READMATES_VISUAL_AUTHORITY_IDS=${authorityIds}`,
      "-v",
      `${input.workspaceHostPath}:/work`,
      "-v",
      `${VISUAL_AUTHORITY_ROOT_NODE_MODULES_VOLUME}:/work/node_modules`,
      "-v",
      `${VISUAL_AUTHORITY_FRONT_NODE_MODULES_VOLUME}:/work/front/node_modules`,
      "-v",
      `${VISUAL_AUTHORITY_PNPM_STORE_VOLUME}:/pnpm-store`,
      "-w",
      "/work/front",
      VISUAL_AUTHORITY_DOCKER_IMAGE,
      "/bin/sh",
      "-lc",
      containerScript,
    ],
  };
}
