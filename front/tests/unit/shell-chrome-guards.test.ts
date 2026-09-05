import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cssRoots = ["features", "shared", "src/styles"];

// Baselines record the count at plan start. They may only go DOWN. Task 9 and Task 12 set them to 0.
const DATA_URI_ICON_BASELINE: Record<string, number> = {};
const SHELL_FORK_BASELINE: Record<string, number> = {};

function cssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...cssFiles(p));
    else if (entry.isFile() && p.endsWith(".css")) out.push(p);
  }
  return out;
}

function count(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

describe("shell chrome guards (ADR-0045 update 2026-09-05)", () => {
  const files = cssRoots.flatMap((root) => cssFiles(path.join(projectRoot, root)));

  it("draws no icon from a CSS data URI outside the recorded baseline", () => {
    for (const file of files) {
      const rel = path.relative(projectRoot, file).split(path.sep).join("/");
      const actual = count(fs.readFileSync(file, "utf8"), "data:image/svg+xml");
      const allowed = DATA_URI_ICON_BASELINE[rel] ?? 0;
      expect(actual, `${rel} data URI icons`).toBeLessThanOrEqual(allowed);
    }
  });

  it("forks the admin shell by route only within the recorded baseline", () => {
    for (const file of files) {
      const rel = path.relative(projectRoot, file).split(path.sep).join("/");
      const actual = count(fs.readFileSync(file, "utf8"), ".admin-shell:has(");
      const allowed = SHELL_FORK_BASELINE[rel] ?? 0;
      expect(actual, `${rel} route-scoped shell overrides`).toBeLessThanOrEqual(allowed);
    }
  });
});
