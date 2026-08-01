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
  it("exposes the Pretendard readability scale without a separate reading face", () => {
    const tokens = fs.readFileSync(path.join(packageRoot, "src/styles/tokens.css"), "utf8");
    const stylesheet = document.createElement("style");
    stylesheet.textContent = tokens;
    document.head.append(stylesheet);

    const role = (className: string) => {
      const element = document.createElement("p");
      element.className = className;
      document.body.append(element);
      return element;
    };
    const h1 = role("h1");
    const h2 = role("h2");
    const body = role("body");
    const bodyLarge = role("body-lg");
    const supporting = role("small");
    const label = role("tiny");
    const eyebrow = role("eyebrow");
    const ledger = role("ledger-number");

    try {
      const root = getComputedStyle(document.documentElement);
      expect(tokens).not.toContain("--f-reading");
      expect(tokens).not.toContain("reading-editorial");
      expect(tokens).not.toContain("Iowan Old Style");
      expect(root.getPropertyValue("--type-size-h1").trim()).toBe("36px");
      expect(root.getPropertyValue("--type-size-h2").trim()).toBe("28px");
      expect(root.getPropertyValue("--type-size-body").trim()).toBe("16px");
      expect(root.getPropertyValue("--type-size-body-emphasis").trim()).toBe("17px");
      expect(root.getPropertyValue("--type-size-supporting").trim()).toBe("14px");
      expect(root.getPropertyValue("--type-size-label").trim()).toBe("12px");
      expect(root.getPropertyValue("--type-leading-body").trim()).toBe("1.6");
      expect(getComputedStyle(h1).fontSize).toBe("var(--type-size-h1)");
      expect(getComputedStyle(h2).fontSize).toBe("var(--type-size-h2)");
      expect(getComputedStyle(body).fontSize).toBe("var(--type-size-body)");
      expect(getComputedStyle(bodyLarge).fontSize).toBe("var(--type-size-body-emphasis)");
      expect(getComputedStyle(supporting).fontSize).toBe("var(--type-size-supporting)");
      expect(getComputedStyle(label).fontSize).toBe("var(--type-size-label)");
      expect(getComputedStyle(eyebrow).fontFamily).toBe("var(--f-sans)");
      expect(getComputedStyle(eyebrow).fontSize).toBe("var(--type-size-label)");
      expect(getComputedStyle(ledger).fontFamily).toBe("var(--f-mono)");
      expect(getComputedStyle(ledger).fontVariantNumeric).toBe("tabular-nums");
      expect(tokens).not.toMatch(/url\(|https?:\/\//);
    } finally {
      for (const element of [h1, h2, body, bodyLarge, supporting, label, eyebrow, ledger]) {
        element.remove();
      }
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
