import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const frontRoot = path.join(repoRoot, "front");
const sourceRoots = [
  path.join(frontRoot, "src"),
  path.join(frontRoot, "shared"),
  path.join(frontRoot, "features"),
  path.join(repoRoot, "design/system/src"),
];
const activeExtensions = new Set([".css", ".ts", ".tsx"]);

function collectActiveFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectActiveFiles(entryPath);
    if (!entry.isFile() || !activeExtensions.has(path.extname(entry.name))) return [];
    if (/\.(?:test|ct)\.[^.]+$/.test(entry.name)) return [];
    return [entryPath];
  });
}

function numericMatches(source: string, pattern: RegExp): number[] {
  return Array.from(source.matchAll(pattern), (match) => Number.parseFloat(match[1]));
}

describe("frontend typography contract", () => {
  const sources = sourceRoots.flatMap(collectActiveFiles).map((file) => ({
    file: path.relative(repoRoot, file),
    source: fs.readFileSync(file, "utf8"),
  }));

  it("does not reintroduce the removed reading-face contract", () => {
    const forbidden = ["Iowan Old Style", "--f-reading", "reading-editorial", "--font-editorial"];
    const violations = sources.flatMap(({ file, source }) =>
      forbidden.filter((token) => source.includes(token)).map((token) => `${file}: ${token}`),
    );
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("does not render active visual text below 12px", () => {
    const violations = sources.flatMap(({ file, source }) => {
      const cssSizes = numericMatches(source, /font-size:\s*(\d+(?:\.\d+)?)px/g);
      const inlineSizes = numericMatches(source, /fontSize:\s*["']?(\d+(?:\.\d+)?)(?:px)?["']?/g);
      return [...cssSizes, ...inlineSizes].filter((size) => size < 12).map((size) => `${file}: ${size}px`);
    });
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
