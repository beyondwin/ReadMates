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
const rootFontSizePx = 16;
const minimumVisualTextSizePx = 12;

type TypographySource = {
  file: string;
  source: string;
};

function collectActiveFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectActiveFiles(entryPath);
    if (!entry.isFile() || !activeExtensions.has(path.extname(entry.name))) return [];
    if (/\.(?:test|ct)\.[^.]+$/.test(entry.name)) return [];
    return [entryPath];
  });
}

type CssDeclaration = {
  property: string;
  value: string;
};

type CustomPropertyDefinition = {
  value: string;
};

type SizeResolution = {
  sizes: number[];
  unresolvedProperties: string[];
};

type ValueResolution = {
  values: string[];
  unresolvedProperties: string[];
};

type CssValueToken = {
  value: string;
  index: number;
};

function collectCssDeclarations(source: string): CssDeclaration[] {
  const uncommented = source.replace(/\/\*[\s\S]*?\*\//g, "");
  return Array.from(
    uncommented.matchAll(/(?:^|[;{])\s*(--[\w-]+|font-size|font-family|font)\s*:\s*([^;}]+)/gim),
    (match) => ({ property: match[1].toLowerCase(), value: match[2].trim() }),
  );
}

function normalizeSizeToPx(value: string, unit: string): number {
  const size = Number.parseFloat(value);
  return unit.toLowerCase() === "px" ? size : size * rootFontSizePx;
}

function literalSizesInPx(value: string): number[] {
  return Array.from(value.matchAll(/(-?(?:\d+(?:\.\d+)?|\.\d+))(px|rem|em)\b/gi), (match) =>
    normalizeSizeToPx(match[1], match[2]),
  );
}

function tokenizeCssValue(value: string): CssValueToken[] {
  return Array.from(
    value.matchAll(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|var\([^)]*\)|\/|[^\s/]+)/g),
    (match) => ({ value: match[0], index: match.index }),
  );
}

function isFontSizeToken(value: string): boolean {
  return (
    /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em)$/i.test(value) ||
    /^var\(\s*--[\w-]+/.test(value) ||
    /^(?:xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|smaller|larger)$/i.test(value)
  );
}

function fontShorthandParts(value: string): { fontSize: string; fontFamily: string } | null {
  const tokens = tokenizeCssValue(value);
  const sizeIndex = tokens.findIndex((token) => isFontSizeToken(token.value));
  if (sizeIndex < 0) return null;

  let familyIndex = sizeIndex + 1;
  if (tokens[familyIndex]?.value === "/") {
    familyIndex += 2;
  }
  const familyToken = tokens[familyIndex];
  if (!familyToken) return null;

  return {
    fontSize: tokens[sizeIndex].value,
    fontFamily: value.slice(familyToken.index).trim(),
  };
}

function sizesResolvedFromValue(
  value: string,
  customProperties: Map<string, CustomPropertyDefinition[]>,
  resolving = new Set<string>(),
): SizeResolution {
  const sizes = literalSizesInPx(value);
  const unresolvedProperties: string[] = [];
  for (const reference of value.matchAll(/var\(\s*(--[\w-]+)/g)) {
    const property = reference[1];
    if (resolving.has(property)) {
      unresolvedProperties.push(property);
      continue;
    }
    const definitions = customProperties.get(property);
    if (!definitions || definitions.length === 0) {
      unresolvedProperties.push(property);
      continue;
    }
    const nextResolving = new Set(resolving).add(property);
    for (const definition of definitions) {
      const resolution = sizesResolvedFromValue(definition.value, customProperties, nextResolving);
      sizes.push(...resolution.sizes);
      unresolvedProperties.push(...resolution.unresolvedProperties);
    }
  }
  return { sizes, unresolvedProperties };
}

function valuesResolvedFromValue(
  value: string,
  customProperties: Map<string, CustomPropertyDefinition[]>,
  resolving = new Set<string>(),
): ValueResolution {
  const values = [value];
  const unresolvedProperties: string[] = [];
  for (const reference of value.matchAll(/var\(\s*(--[\w-]+)/g)) {
    const property = reference[1];
    if (resolving.has(property)) {
      unresolvedProperties.push(property);
      continue;
    }
    const definitions = customProperties.get(property);
    if (!definitions || definitions.length === 0) {
      unresolvedProperties.push(property);
      continue;
    }
    const nextResolving = new Set(resolving).add(property);
    for (const definition of definitions) {
      const resolution = valuesResolvedFromValue(definition.value, customProperties, nextResolving);
      values.push(...resolution.values);
      unresolvedProperties.push(...resolution.unresolvedProperties);
    }
  }
  return { values, unresolvedProperties };
}

function usesGenericSerif(value: string): boolean {
  return /(?:^|[\s,])serif(?=$|[\s,])/i.test(value);
}

function findTypographyViolations(sources: TypographySource[]): string[] {
  const cssSources = sources.filter(({ file }) => path.extname(file) === ".css");
  const scriptSources = sources.filter(({ file }) => path.extname(file) !== ".css");
  const customProperties = new Map<string, CustomPropertyDefinition[]>();
  for (const { source } of cssSources) {
    for (const declaration of collectCssDeclarations(source)) {
      if (!declaration.property.startsWith("--")) continue;
      const definitions = customProperties.get(declaration.property) ?? [];
      definitions.push({ value: declaration.value });
      customProperties.set(declaration.property, definitions);
    }
  }
  for (const { source } of scriptSources) {
    for (const match of source.matchAll(/(["'])(--[\w-]+)\1\s*:\s*(["'])([^"']+)\3/g)) {
      const definitions = customProperties.get(match[2]) ?? [];
      definitions.push({ value: match[4] });
      customProperties.set(match[2], definitions);
    }
  }

  const violations: string[] = [];
  const recordSubFloorSizes = (file: string, property: string, value: string) => {
    const resolution = sizesResolvedFromValue(value, customProperties);
    for (const size of resolution.sizes) {
      if (size < minimumVisualTextSizePx) {
        violations.push(`${file}: ${property} ${value} resolves to ${size}px`);
      }
    }
    for (const unresolvedProperty of resolution.unresolvedProperties) {
      violations.push(`${file}: ${property} ${value} cannot resolve ${unresolvedProperty}`);
    }
  };
  const recordFontFamily = (file: string, property: string, value: string) => {
    const resolution = valuesResolvedFromValue(value, customProperties);
    if (resolution.values.some(usesGenericSerif)) {
      violations.push(`${file}: ${property} uses generic serif`);
    }
    for (const unresolvedProperty of resolution.unresolvedProperties) {
      violations.push(`${file}: ${property} ${value} cannot resolve ${unresolvedProperty}`);
    }
  };

  for (const { file, source } of cssSources) {
    for (const declaration of collectCssDeclarations(source)) {
      if (declaration.property === "font-size") {
        recordSubFloorSizes(file, declaration.property, declaration.value);
      }
      if (declaration.property === "font-family") {
        recordFontFamily(file, declaration.property, declaration.value);
      }
      if (declaration.property === "font") {
        const parts = fontShorthandParts(declaration.value);
        if (parts) {
          recordSubFloorSizes(file, declaration.property, parts.fontSize);
          recordFontFamily(file, declaration.property, parts.fontFamily);
        }
      }
    }
  }

  for (const { file, source } of scriptSources) {
    for (const match of source.matchAll(/\bfontSize\s*:\s*(?:(["'])([^"']+)\1|(-?(?:\d+(?:\.\d+)?|\.\d+)))(?=\s*[,}])/g)) {
      const value = match[2] ?? `${match[3]}px`;
      recordSubFloorSizes(file, "fontSize", value);
    }
    for (const match of source.matchAll(/\bfontFamily\s*:\s*(["'])([^"']+)\1/g)) {
      recordFontFamily(file, "fontFamily", match[2]);
    }
  }

  return [...new Set(violations)];
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
    const violations = findTypographyViolations(sources);
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it.each([
    ["rem font-size", "fixture.css", ".compact { font-size: 0.72rem; }"],
    ["em font-size", "fixture.css", ".compact { font-size: 0.72em; }"],
    ["font shorthand", "fixture.css", ".compact { font: 600 10px/1 sans-serif; }"],
    [
      "custom-property indirection",
      "fixture.css",
      ":root { --compact-type: 0.72rem; } .compact { font-size: var(--compact-type); }",
    ],
    [
      "TSX custom-property indirection",
      "fixture.tsx",
      'const compact = <span style={{ "--compact-type": "0.72rem", fontSize: "var(--compact-type)" }}>copy</span>;',
    ],
    ["TSX inline fontSize", "fixture.tsx", 'const compact = <span style={{ fontSize: "0.72rem" }}>copy</span>;'],
  ])("detects sub-floor %s declarations", (_caseName, file, source) => {
    expect(findTypographyViolations([{ file, source }])).not.toEqual([]);
  });

  it("fails closed when a font-size custom property cannot be resolved", () => {
    expect(
      findTypographyViolations([{ file: "fixture.css", source: ".copy { font-size: var(--missing-type); }" }]),
    ).toContain("fixture.css: font-size var(--missing-type) cannot resolve --missing-type");
  });

  it("checks only the font-size component of a font shorthand", () => {
    expect(
      findTypographyViolations([
        { file: "fixture.css", source: ".copy { font: 600 14px/10px sans-serif; }" },
      ]),
    ).toEqual([]);
  });

  it("detects generic serif declarations without treating sans-serif as serif", () => {
    expect(
      findTypographyViolations([{ file: "serif.css", source: ".copy { font-family: Georgia, serif; }" }]),
    ).not.toEqual([]);
    expect(
      findTypographyViolations([{ file: "serif.css", source: ".copy { font: 16px/1.6 Georgia, serif; }" }]),
    ).not.toEqual([]);
    expect(
      findTypographyViolations([{ file: "sans.css", source: ".copy { font-family: Pretendard, sans-serif; }" }]),
    ).toEqual([]);
    expect(
      findTypographyViolations([{ file: "sans.css", source: ".copy { font: 16px/1.6 Pretendard, sans-serif; }" }]),
    ).toEqual([]);
  });

  it("recursively resolves font-family custom properties", () => {
    expect(
      findTypographyViolations([
        {
          file: "serif.css",
          source: ":root { --reading-face-base: Georgia, serif; --reading-face: var(--reading-face-base); } .copy { font-family: var(--reading-face); }",
        },
      ]),
    ).toContain("serif.css: font-family uses generic serif");
    expect(
      findTypographyViolations([
        {
          file: "sans.css",
          source: ":root { --ui-face: Pretendard, sans-serif; } .copy { font-family: var(--ui-face); }",
        },
      ]),
    ).toEqual([]);
  });

  it("fails closed when a font-family custom property is missing or cyclic", () => {
    expect(
      findTypographyViolations([
        { file: "missing.css", source: ".copy { font-family: var(--missing-face); }" },
      ]),
    ).toContain("missing.css: font-family var(--missing-face) cannot resolve --missing-face");
    expect(
      findTypographyViolations([
        {
          file: "cycle.css",
          source: ":root { --face-a: var(--face-b); --face-b: var(--face-a); } .copy { font-family: var(--face-a); }",
        },
      ]),
    ).toContain("cycle.css: font-family var(--face-a) cannot resolve --face-a");
  });
});
