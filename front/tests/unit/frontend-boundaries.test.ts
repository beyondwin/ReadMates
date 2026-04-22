import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoots = ["src", "features", "shared"];
const sourceExtensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
const staticImportExportPattern = /^\s*(?:import|export)\s+(?:type\s+)?[\s\S]*?\s+from\s+["']([^"']+)["']/gm;

type BoundaryRuleId = "shared-boundary" | "feature-to-feature" | "feature-model" | "feature-ui";

const legacyBoundaryExceptions = [
  {
    sourcePath: "features/archive/components/my-page.tsx",
    importPath: "features/auth/components/logout-button",
    ruleId: "feature-to-feature",
    reason: "Archive page still renders the auth logout control directly.",
    removeWhen: "Archive route owns logout via its route/app boundary.",
  },
  {
    sourcePath: "shared/ui/mobile-header.tsx",
    importPath: "src/app/route-continuity",
    ruleId: "shared-boundary",
    reason: "Shared mobile navigation still calls app route continuity.",
    removeWhen: "Navigation continuity is injected from app/page composition.",
  },
  {
    sourcePath: "shared/ui/mobile-header.tsx",
    importPath: "src/app/router-link",
    ruleId: "shared-boundary",
    reason: "Shared mobile navigation still depends on the app router link.",
    removeWhen: "Router link is injected or moved to an allowed shared abstraction.",
  },
  {
    sourcePath: "shared/ui/mobile-tab-bar.tsx",
    importPath: "src/app/router-link",
    ruleId: "shared-boundary",
    reason: "Shared mobile tabs still depend on the app router link.",
    removeWhen: "Router link is injected or moved to an allowed shared abstraction.",
  },
  {
    sourcePath: "shared/ui/public-auth-action.tsx",
    importPath: "src/app/router-link",
    ruleId: "shared-boundary",
    reason: "Shared public auth action still depends on the app router link.",
    removeWhen: "Router link is injected or moved to an allowed shared abstraction.",
  },
  {
    sourcePath: "shared/ui/public-footer.tsx",
    importPath: "src/app/router-link",
    ruleId: "shared-boundary",
    reason: "Shared public footer still depends on the app router link.",
    removeWhen: "Router link is injected or moved to an allowed shared abstraction.",
  },
  {
    sourcePath: "shared/ui/top-nav.tsx",
    importPath: "src/app/router-link",
    ruleId: "shared-boundary",
    reason: "Shared top nav still depends on the app router link.",
    removeWhen: "Router link is injected or moved to an allowed shared abstraction.",
  },
] satisfies Array<{
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

function parseStaticImportSpecifiers(source: string) {
  const specifiers: string[] = [];
  let match: RegExpExecArray | null;

  staticImportExportPattern.lastIndex = 0;
  while ((match = staticImportExportPattern.exec(source)) !== null) {
    specifiers.push(match[1]);
  }

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
    isFeatureLayerImport(projectPath, "route")
  );
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
  it("keeps shared, feature model, and feature UI dependencies inside their allowed boundaries", () => {
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
});
