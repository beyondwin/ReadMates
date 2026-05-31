import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, sep, posix } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function collectFiles(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(entryPath));
      continue;
    }
    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) files.push(entryPath);
  }
  return files;
}

function toPosixRelative(absolutePath: string): string {
  return absolutePath.slice(repoRoot.length + 1).split(sep).join(posix.sep);
}

function scan(featureDir: string, forbidden: RegExp): string[] {
  const files = collectFiles(resolve(repoRoot, featureDir));
  const violations: string[] = [];
  for (const absolutePath of files) {
    const source = readFileSync(absolutePath, "utf8");
    if (forbidden.test(source)) violations.push(toPosixRelative(absolutePath));
  }
  return violations;
}

describe("club-operations contract boundary", () => {
  it("features/host does not import from features/platform-admin", () => {
    expect(scan("features/host", /from\s+["']@\/features\/platform-admin\//)).toEqual([]);
  });

  it("features/platform-admin does not import from features/host", () => {
    expect(scan("features/platform-admin", /from\s+["']@\/features\/host\//)).toEqual([]);
  });
});
