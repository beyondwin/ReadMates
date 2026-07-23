import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, sep, posix } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FORBIDDEN = [
  /from\s+["']@\/features\/host\/api\/host-api["']/,
  /from\s+["']@\/features\/host\/queries\/host-notification-queries["']/,
  /from\s+["']@\/features\/host\/route(?:\/[^"']+)?["']/,
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
  it("keeps the reusable composer and recipient picker in the UI surface", () => {
    const uiRoot = resolve(repoRoot, "features/host/ui/notifications");
    const files = collectUiFiles(uiRoot).map(toPosixRelative);

    expect(files).toEqual(expect.arrayContaining([
      "features/host/ui/notifications/host-notification-composer.tsx",
      "features/host/ui/notifications/host-notification-composer-dialog.tsx",
      "features/host/ui/notifications/notification-recipient-picker.tsx",
    ]));
  });

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

  it("reuses the shared composer from the operations workbench", () => {
    const workbench = readFileSync(
      resolve(repoRoot, "features/host/ui/notifications/manual-notification-workbench.tsx"),
      "utf8",
    );
    expect(workbench).toContain('from "./host-notification-composer"');
    expect(workbench).not.toContain("manual-notification-member-picker");
  });
});
