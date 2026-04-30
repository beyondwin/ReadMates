import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoots = ["src", "features", "shared"];
const sourceExtensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
const featuresWithUiPublicSurface = collectFeaturesWithUiPublicSurface();
const removedReadmatesApiCompatibilityPath = ["shared", "api", "readmates"].join("/");

type BoundaryRuleId =
  | "shared-boundary"
  | "feature-to-feature"
  | "feature-model"
  | "feature-route"
  | "feature-ui"
  | "readmates-api-compat"
  | "feature-components-public";

const legacyBoundaryExceptions = [] satisfies Array<{
  sourcePath: string;
  importPath: string;
  ruleId: BoundaryRuleId;
  reason: string;
  removeWhen: string;
}>;

type SourceFile = {
  absolutePath: string;
  displayPath: string;
  relativePath: string;
};

type ImportSpecifier = {
  rawSpecifier: string;
  projectPath: string | null;
};

function toPosixPath(filePath: string) {
  return filePath.split(path.sep).join("/");
}

function collectSourceFiles(directory: string): SourceFile[] {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files: SourceFile[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(entryPath));
      continue;
    }

    if (!entry.isFile() || !sourceExtensions.has(path.extname(entry.name))) {
      continue;
    }

    const relativePath = toPosixPath(path.relative(projectRoot, entryPath));
    files.push({
      absolutePath: entryPath,
      displayPath: `front/${relativePath}`,
      relativePath,
    });
  }

  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function collectAllSourceFiles() {
  return sourceRoots.flatMap((root) => collectSourceFiles(path.join(projectRoot, root)));
}

function collectFeaturesWithUiPublicSurface() {
  const featuresRoot = path.join(projectRoot, "features");
  const entries = fs.readdirSync(featuresRoot, { withFileTypes: true });

  return new Set(
    entries
      .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(featuresRoot, entry.name, "ui")))
      .map((entry) => entry.name),
  );
}

function parseStaticImportSpecifiers(source: string) {
  const sourceFile = ts.createSourceFile(
    "frontend-boundary-source.tsx",
    source,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TSX,
  );
  const specifiers: string[] = [];

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text);
    }

    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }

    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      specifiers.push(node.argument.literal.text);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return specifiers;
}

function normalizeImportSpecifier(sourceFile: SourceFile, specifier: string): ImportSpecifier {
  if (specifier.startsWith("@/")) {
    return {
      rawSpecifier: specifier,
      projectPath: path.posix.normalize(specifier.slice(2)),
    };
  }

  if (specifier.startsWith(".")) {
    return {
      rawSpecifier: specifier,
      projectPath: path.posix.normalize(path.posix.join(path.posix.dirname(sourceFile.relativePath), specifier)),
    };
  }

  return {
    rawSpecifier: specifier,
    projectPath: null,
  };
}

function getFeatureName(relativePath: string) {
  return /^features\/([^/]+)\//.exec(relativePath)?.[1] ?? null;
}

function getImportedFeatureName(projectPath: string) {
  return /^features\/([^/]+)(?:\/|$)/.exec(projectPath)?.[1] ?? null;
}

function isFeatureLayerImport(projectPath: string, layer: string) {
  return new RegExp(`^features/[^/]+/${layer}(?:/|$)`).test(projectPath);
}

function isSharedApiImport(projectPath: string) {
  return /^shared\/api(?:\/|$)/.test(projectPath);
}

function isPackageImport(specifier: string, packageName: string) {
  return specifier === packageName || specifier.startsWith(`${packageName}/`);
}

function isFeatureModelFile(relativePath: string) {
  return /^features\/[^/]+\/model\//.test(relativePath);
}

function isFeatureUiFile(relativePath: string) {
  return /^features\/[^/]+\/ui\//.test(relativePath);
}

function isFeatureRouteFile(relativePath: string) {
  return /^features\/[^/]+\/route\//.test(relativePath);
}

function isFeatureRouteOrPageFile(relativePath: string) {
  return isFeatureRouteFile(relativePath) || /^src\/pages\//.test(relativePath);
}

function getImportedFeatureComponentsName(projectPath: string | null) {
  return projectPath === null ? null : /^features\/([^/]+)\/components(?:\/|$)/.exec(projectPath)?.[1] ?? null;
}

function isLegacyReadmatesApiImport(projectPath: string | null) {
  return projectPath === removedReadmatesApiCompatibilityPath;
}

function legacyExceptionKey(sourcePath: string, importPath: string, ruleId: BoundaryRuleId) {
  return `${sourcePath} -> ${importPath} [${ruleId}]`;
}

function findLegacyBoundaryException(sourceFile: SourceFile, importPath: string, ruleId: BoundaryRuleId) {
  return legacyBoundaryExceptions.find(
    (exception) =>
      exception.sourcePath === sourceFile.relativePath &&
      exception.importPath === importPath &&
      exception.ruleId === ruleId,
  );
}

function formatImportSpecifier(importSpecifier: ImportSpecifier) {
  if (importSpecifier.projectPath === null || importSpecifier.projectPath === importSpecifier.rawSpecifier) {
    return `"${importSpecifier.rawSpecifier}"`;
  }

  return `"${importSpecifier.rawSpecifier}" resolved to "${importSpecifier.projectPath}"`;
}

function addImportViolation(
  violations: string[],
  consumedLegacyExceptions: Set<string>,
  sourceFile: SourceFile,
  importSpecifier: ImportSpecifier,
  ruleId: BoundaryRuleId,
  reason: string,
) {
  if (importSpecifier.projectPath !== null) {
    const legacyException = findLegacyBoundaryException(sourceFile, importSpecifier.projectPath, ruleId);

    if (legacyException !== undefined) {
      consumedLegacyExceptions.add(
        legacyExceptionKey(legacyException.sourcePath, legacyException.importPath, legacyException.ruleId),
      );
      return;
    }
  }

  violations.push(`${sourceFile.displayPath} imports ${formatImportSpecifier(importSpecifier)}: ${reason}`);
}

function addUnusedLegacyExceptionViolations(violations: string[], consumedLegacyExceptions: Set<string>) {
  for (const exception of legacyBoundaryExceptions) {
    const key = legacyExceptionKey(exception.sourcePath, exception.importPath, exception.ruleId);

    if (consumedLegacyExceptions.has(key)) {
      continue;
    }

    violations.push(
      `Unused legacy boundary exception ${key}: ${exception.reason} Remove when: ${exception.removeWhen}`,
    );
  }
}

function isSharedToFeaturePageOrAppImport(sourceFile: SourceFile, projectPath: string | null) {
  if (!sourceFile.relativePath.startsWith("shared/") || projectPath === null) {
    return false;
  }

  return projectPath.startsWith("features/") || projectPath.startsWith("src/pages/") || projectPath.startsWith("src/app/");
}

function isFeatureModelBoundaryImport(sourceFile: SourceFile, importSpecifier: ImportSpecifier) {
  if (!isFeatureModelFile(sourceFile.relativePath)) {
    return false;
  }

  if (
    isPackageImport(importSpecifier.rawSpecifier, "react") ||
    isPackageImport(importSpecifier.rawSpecifier, "react-dom") ||
    isPackageImport(importSpecifier.rawSpecifier, "react-router-dom")
  ) {
    return true;
  }

  if (importSpecifier.projectPath === null) {
    return false;
  }

  return isSharedApiImport(importSpecifier.projectPath) || isFeatureLayerImport(importSpecifier.projectPath, "api");
}

function isFeatureUiBoundaryImport(sourceFile: SourceFile, projectPath: string | null) {
  if (!isFeatureUiFile(sourceFile.relativePath) || projectPath === null) {
    return false;
  }

  return (
    isSharedApiImport(projectPath) ||
    isFeatureLayerImport(projectPath, "api") ||
    isFeatureLayerImport(projectPath, "route") ||
    projectPath.startsWith("src/pages/") ||
    projectPath.startsWith("src/app/")
  );
}

function isFeatureRouteBoundaryImport(sourceFile: SourceFile, projectPath: string | null) {
  if (!isFeatureRouteFile(sourceFile.relativePath) || projectPath === null) {
    return false;
  }

  return projectPath.startsWith("src/pages/") || projectPath.startsWith("src/app/");
}

function getDifferentImportedFeatureName(sourceFile: SourceFile, projectPath: string | null) {
  if (projectPath === null) {
    return null;
  }

  const currentFeature = getFeatureName(sourceFile.relativePath);
  const importedFeature = getImportedFeatureName(projectPath);

  if (currentFeature === null || importedFeature === null || importedFeature === currentFeature) {
    return null;
  }

  return importedFeature;
}

function assertLegacyBoundaryExceptionsAreUnique() {
  const keys = new Set(
    legacyBoundaryExceptions.map((exception) =>
      legacyExceptionKey(exception.sourcePath, exception.importPath, exception.ruleId),
    ),
  );

  if (keys.size !== legacyBoundaryExceptions.length) {
    throw new Error("Legacy boundary exceptions must have unique source/import/rule entries.");
  }
}

function addFeatureToFeatureViolation(
  violations: string[],
  consumedLegacyExceptions: Set<string>,
  sourceFile: SourceFile,
  importSpecifier: ImportSpecifier,
) {
  const currentFeature = getFeatureName(sourceFile.relativePath);
  const importedFeature = getDifferentImportedFeatureName(sourceFile, importSpecifier.projectPath);

  if (currentFeature === null || importedFeature === null) {
    return;
  }

  addImportViolation(
    violations,
    consumedLegacyExceptions,
    sourceFile,
    importSpecifier,
    "feature-to-feature",
    `features must not import a different feature directly; "${currentFeature}" cannot import "${importedFeature}".`,
  );
}

describe("frontend architecture boundaries", () => {
  it("parses static side-effect, value, type, and export-from specifiers without crossing statements", () => {
    const source = `
      import "@/styles/global.css";
      const shouldNotBeCollected = "from \\"@/crossed/line\\"";
      import { normalImport } from "@/features/reader/normal-import";
      import type { ReaderModel } from "@/features/reader/model";
      export { readerHelper } from "@/shared/lib/reader-helper";
    `;

    expect(parseStaticImportSpecifiers(source)).toEqual([
      "@/styles/global.css",
      "@/features/reader/normal-import",
      "@/features/reader/model",
      "@/shared/lib/reader-helper",
    ]);
  });

  it("collects TypeScript import-type specifiers so boundary checks can reject them", () => {
    const sourceFile: SourceFile = {
      absolutePath: "/unused/shared/auth/member-app-loader.ts",
      displayPath: "front/shared/auth/member-app-loader.ts",
      relativePath: "shared/auth/member-app-loader.ts",
    };
    const source = `
      export type CurrentSessionCompatibility =
        import("@/features/current-session/api/current-session-contracts").CurrentSessionResponse;
    `;

    const specifier = parseStaticImportSpecifiers(source)[0];
    if (specifier === undefined) {
      throw new Error("Expected import-type specifier to be collected.");
    }
    const importSpecifier = normalizeImportSpecifier(sourceFile, specifier);

    expect(specifier).toBe("@/features/current-session/api/current-session-contracts");
    expect(importSpecifier.projectPath).toBe("features/current-session/api/current-session-contracts");
    expect(isSharedToFeaturePageOrAppImport(sourceFile, importSpecifier.projectPath)).toBe(true);
  });

  it("keeps shared, feature route, feature model, and feature UI dependencies inside their allowed boundaries", () => {
    assertLegacyBoundaryExceptionsAreUnique();

    const violations: string[] = [];
    const consumedLegacyExceptions = new Set<string>();

    for (const sourceFile of collectAllSourceFiles()) {
      const source = fs.readFileSync(sourceFile.absolutePath, "utf8");
      const specifiers = parseStaticImportSpecifiers(source);

      for (const specifier of specifiers) {
        const importSpecifier = normalizeImportSpecifier(sourceFile, specifier);

        if (isSharedToFeaturePageOrAppImport(sourceFile, importSpecifier.projectPath)) {
          addImportViolation(
            violations,
            consumedLegacyExceptions,
            sourceFile,
            importSpecifier,
            "shared-boundary",
            "shared files must not import features, pages, or app modules.",
          );
        }

        addFeatureToFeatureViolation(violations, consumedLegacyExceptions, sourceFile, importSpecifier);

        if (isFeatureModelBoundaryImport(sourceFile, importSpecifier)) {
          addImportViolation(
            violations,
            consumedLegacyExceptions,
            sourceFile,
            importSpecifier,
            "feature-model",
            "feature model files must stay framework-independent and must not import API clients.",
          );
        }

        if (isFeatureUiBoundaryImport(sourceFile, importSpecifier.projectPath)) {
          addImportViolation(
            violations,
            consumedLegacyExceptions,
            sourceFile,
            importSpecifier,
            "feature-ui",
            "feature UI files must receive data and callbacks from route/API boundaries.",
          );
        }

        if (isFeatureRouteBoundaryImport(sourceFile, importSpecifier.projectPath)) {
          addImportViolation(
            violations,
            consumedLegacyExceptions,
            sourceFile,
            importSpecifier,
            "feature-route",
            "feature route files must receive app/page dependencies from app route composition.",
          );
        }

        if (isFeatureRouteOrPageFile(sourceFile.relativePath) && isLegacyReadmatesApiImport(importSpecifier.projectPath)) {
          addImportViolation(
            violations,
            consumedLegacyExceptions,
            sourceFile,
            importSpecifier,
            "readmates-api-compat",
            "feature route/page files must import feature-owned API contracts instead of the removed shared readmates compatibility module.",
          );
        }

        const importedComponentsFeature = getImportedFeatureComponentsName(importSpecifier.projectPath);
        if (importedComponentsFeature !== null && featuresWithUiPublicSurface.has(importedComponentsFeature)) {
          addImportViolation(
            violations,
            consumedLegacyExceptions,
            sourceFile,
            importSpecifier,
            "feature-components-public",
            `features/${importedComponentsFeature}/ui is the public presentation surface; do not import features/${importedComponentsFeature}/components.`,
          );
        }
      }

      if (isFeatureUiFile(sourceFile.relativePath) && /\bfetch\s*\(/.test(source)) {
        violations.push(
          `${sourceFile.displayPath} contains direct fetch(...): feature UI files must call through the route/API boundary.`,
        );
      }
    }

    addUnusedLegacyExceptionViolations(violations, consumedLegacyExceptions);

    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("keeps host presentation components free of API-backed defaults", () => {
    const hostPresentationComponents = [
      "features/host/ui/host-dashboard.tsx",
      "features/host/ui/host-session-editor.tsx",
      "features/host/ui/host-members.tsx",
      "features/host/ui/host-invitations.tsx",
    ];

    for (const relativePath of hostPresentationComponents) {
      const absolutePath = path.join(projectRoot, relativePath);
      const source = fs.readFileSync(absolutePath, "utf8");
      const specifiers = parseStaticImportSpecifiers(source);

      expect(specifiers, `${relativePath} must not import host API helpers`).not.toContain(
        "@/features/host/api/host-api",
      );
      expect(source, `${relativePath} must not call fetch directly`).not.toMatch(/\bfetch\s*\(/);
      expect(source, `${relativePath} must not export route-owned action types`).not.toMatch(
        /(?:export\s+(?:type|interface)\s+\w+Actions\b|export\s+type\s+\{[^}]*\w+Actions\b)/,
      );
    }
  });

  it("keeps host route TSX modules render-only for Fast Refresh", () => {
    const hostRouteComponents = [
      "features/host/route/host-dashboard-route.tsx",
      "features/host/route/host-session-editor-route.tsx",
      "features/host/route/host-members-route.tsx",
      "features/host/route/host-invitations-route.tsx",
      "features/host/route/host-notifications-route.tsx",
    ];

    for (const relativePath of hostRouteComponents) {
      const source = fs.readFileSync(path.join(projectRoot, relativePath), "utf8");

      expect(source, `${relativePath} must not export loaders from TSX modules`).not.toMatch(
        /export\s+(?:async\s+)?function\s+\w*Loader\b/,
      );
      expect(source, `${relativePath} must not export action bundles from TSX modules`).not.toMatch(
        /export\s+const\s+\w*Actions\b/,
      );
    }
  });
});
