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
  it("exposes the exact dependency-free Korean-capable reading stack with longer reading rhythm", () => {
    const tokens = fs.readFileSync(path.join(packageRoot, "src/styles/tokens.css"), "utf8");
    const stylesheet = document.createElement("style");
    const sample = document.createElement("p");
    const ledgerValue = document.createElement("strong");
    stylesheet.textContent = tokens;
    sample.className = "reading-editorial";
    ledgerValue.className = "ledger-number";
    document.head.append(stylesheet);
    document.body.append(sample);
    document.body.append(ledgerValue);

    try {
      expect(getComputedStyle(document.documentElement).getPropertyValue("--f-reading").trim()).toBe(
        'ui-serif, "Iowan Old Style", "Noto Serif KR", "AppleMyungjo", "Batang", serif',
      );
      expect(getComputedStyle(sample).fontFamily).toBe("var(--f-reading)");
      expect(getComputedStyle(sample).lineHeight).toBe("1.65");
      expect(getComputedStyle(ledgerValue).fontFamily).toBe("var(--f-mono)");
      expect(getComputedStyle(ledgerValue).fontVariantNumeric).toBe("tabular-nums");
      expect(tokens).not.toMatch(/url\(|https?:\/\//);
    } finally {
      ledgerValue.remove();
      sample.remove();
      stylesheet.remove();
    }
  });

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
