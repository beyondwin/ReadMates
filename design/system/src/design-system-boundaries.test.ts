import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceExtensions = new Set([".ts", ".tsx"]);

function collectSourceFiles(directory: string): string[] {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(entryPath));
      continue;
    }

    if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
}

describe("design-system boundaries", () => {
  it("does not import product app, feature, server, BFF, or router modules", () => {
    const forbiddenPatterns = [
      /from\s+["']@\/src\//,
      /from\s+["']@\/features\//,
      /from\s+["']@\/shared\//,
      /from\s+["']@\/functions\//,
      /from\s+["']react-router-dom["']/,
      /\bfetch\s*\(/,
    ];

    const violations = collectSourceFiles(path.join(packageRoot, "src")).flatMap((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      const relativePath = path.relative(packageRoot, filePath);

      return forbiddenPatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`);
    });

    expect(violations, violations.join("\n")).toEqual([]);
  });
});
