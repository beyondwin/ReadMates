import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, sep, posix } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FORBIDDEN = [
  /from\s+["']@\/features\/host\/api\/host-api["']/,
  /from\s+["']@\/features\/host\/queries\/host-notification-queries["']/,
  /from\s+["']@\/shared\/api(?:\/[^"']+)?["']/,
];

function collectUiFiles(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectUiFiles(entryPath));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    files.push(entryPath);
  }
  return files;
}

function toPosixRelative(absolutePath: string): string {
  return absolutePath.slice(repoRoot.length + 1).split(sep).join(posix.sep);
}

describe("host notifications UI boundary", () => {
  it("does not import server-state modules from features/host/ui", () => {
    const uiRoot = resolve(repoRoot, "features/host/ui");
    const files = collectUiFiles(uiRoot);
    const violations: string[] = [];
    for (const absolutePath of files) {
      const source = readFileSync(absolutePath, "utf8");
      const rel = toPosixRelative(absolutePath);
      for (const pattern of FORBIDDEN) {
        if (pattern.test(source)) {
          violations.push(`${rel} matches ${pattern}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
