import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MEETING_LANGUAGE_ALLOWLIST,
  type MeetingLanguageAllowlistKind,
} from "./meeting-language-allowlist";

const FRONT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCAN_ROOTS = ["src", "features", "shared"];
const SKIP_SUFFIXES = [".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx", ".ct.ts", ".ct.tsx"];
const SKIP_FILES = new Set(["meeting-language-allowlist.ts"]);
const LEGACY_COPY = /세션|회차|RSVP|기록 공개|공개 완료|공개 취소/;
const ALLOWED_KINDS: ReadonlySet<MeetingLanguageAllowlistKind> = new Set([
  "technical-login-session",
  "wire-storage-compatibility",
  "historical-fixture",
]);

type CopyHit = {
  path: string;
  lineNumber: number;
  line: string;
};

function shouldSkip(fileName: string): boolean {
  return SKIP_SUFFIXES.some((suffix) => fileName.endsWith(suffix));
}

function walkSourceFiles(root: string): string[] {
  const files: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of readdirSync(current)) {
      const fullPath = path.join(current, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        if (entry === "node_modules" || entry === "dist" || entry === "coverage") continue;
        stack.push(fullPath);
        continue;
      }
      if (!stat.isFile()) continue;
      if (!(entry.endsWith(".ts") || entry.endsWith(".tsx"))) continue;
      if (shouldSkip(entry) || SKIP_FILES.has(entry)) continue;
      files.push(fullPath);
    }
  }
  return files;
}

function scanLegacyCopy(): CopyHit[] {
  const hits: CopyHit[] = [];
  for (const scanRoot of SCAN_ROOTS) {
    const absRoot = path.join(FRONT_ROOT, scanRoot);
    for (const file of walkSourceFiles(absRoot)) {
      const relative = path.relative(FRONT_ROOT, file).split(path.sep).join("/");
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, index) => {
        if (LEGACY_COPY.test(line)) {
          hits.push({ path: relative, lineNumber: index + 1, line });
        }
      });
    }
  }
  return hits;
}

describe("canonical meeting language inventory", () => {
  it("allowlists only login-session, wire/storage, or historical fixtures", () => {
    for (const entry of MEETING_LANGUAGE_ALLOWLIST) {
      expect(ALLOWED_KINDS.has(entry.kind)).toBe(true);
      expect(entry.owner.trim().length).toBeGreaterThan(0);
      expect(entry.removalCondition.trim().length).toBeGreaterThan(0);
    }
  });

  it("classifies every remaining 세션|회차|RSVP|기록 공개|공개 완료|공개 취소 hit", () => {
    const hits = scanLegacyCopy();
    const unmatched = hits.filter(
      (hit) => !MEETING_LANGUAGE_ALLOWLIST.some((entry) => entry.relativePath === hit.path && hit.line.includes(entry.needle)),
    );
    const unused = MEETING_LANGUAGE_ALLOWLIST.filter(
      (entry) => !hits.some((hit) => hit.path === entry.relativePath && hit.line.includes(entry.needle)),
    );

    expect(unmatched.map((hit) => `${hit.path}:${hit.lineNumber}:${hit.line.trim()}`)).toEqual([]);
    expect(unused.map((entry) => `${entry.relativePath}|${entry.needle}`)).toEqual([]);
  });
});
