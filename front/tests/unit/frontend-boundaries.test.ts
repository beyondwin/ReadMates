import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoots = ["src", "features", "shared"];
const sourceExtensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
const staticImportExportPattern = /^\s*(?:import|export)\s+(?:type\s+)?[\s\S]*?\s+from\s+["']([^"']+)["']/gm;
const legacyBoundaryExceptions = new Set([
  "front/features/archive/components/my-page.tsx -> @/features/auth/components/logout-button",
  "front/shared/ui/mobile-header.tsx -> @/src/app/route-continuity",
  "front/shared/ui/mobile-header.tsx -> @/src/app/router-link",
  "front/shared/ui/mobile-tab-bar.tsx -> @/src/app/router-link",
  "front/shared/ui/public-auth-action.tsx -> @/src/app/router-link",
  "front/shared/ui/public-footer.tsx -> @/src/app/router-link",
  "front/shared/ui/top-nav.tsx -> @/src/app/router-link",
]);

type SourceFile = {
  absolutePath: string;
  displayPath: string;
  relativePath: string;
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

function getFeatureName(relativePath: string) {
  return /^features\/([^/]+)\//.exec(relativePath)?.[1] ?? null;
}

function getImportedFeatureName(specifier: string) {
  return /^@\/features\/([^/]+)(?:\/|$)/.exec(specifier)?.[1] ?? null;
}

function isFeatureLayerImport(specifier: string, layer: string) {
  return new RegExp(`^@/features/[^/]+/${layer}(?:/|$)`).test(specifier);
}

function isSharedApiImport(specifier: string) {
  return /^@\/shared\/api(?:\/|$)/.test(specifier);
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

function addImportViolation(violations: string[], sourceFile: SourceFile, specifier: string, reason: string) {
  if (legacyBoundaryExceptions.has(`${sourceFile.displayPath} -> ${specifier}`)) {
    return;
  }

  violations.push(`${sourceFile.displayPath} imports "${specifier}": ${reason}`);
}

describe("frontend architecture boundaries", () => {
  it("keeps shared, feature model, and feature UI dependencies inside their allowed boundaries", () => {
    const violations: string[] = [];

    for (const sourceFile of collectAllSourceFiles()) {
      const source = fs.readFileSync(sourceFile.absolutePath, "utf8");
      const specifiers = parseStaticImportSpecifiers(source);

      for (const specifier of specifiers) {
        if (
          sourceFile.relativePath.startsWith("shared/") &&
          (specifier.startsWith("@/features/") ||
            specifier.startsWith("@/src/pages/") ||
            specifier.startsWith("@/src/app/"))
        ) {
          addImportViolation(
            violations,
            sourceFile,
            specifier,
            "shared files must not import features, pages, or app modules.",
          );
        }

        const currentFeature = getFeatureName(sourceFile.relativePath);
        const importedFeature = getImportedFeatureName(specifier);
        if (currentFeature !== null && importedFeature !== null && importedFeature !== currentFeature) {
          addImportViolation(
            violations,
            sourceFile,
            specifier,
            `features must not import a different feature directly; "${currentFeature}" cannot import "${importedFeature}".`,
          );
        }

        if (
          isFeatureModelFile(sourceFile.relativePath) &&
          (isPackageImport(specifier, "react") ||
            isPackageImport(specifier, "react-dom") ||
            isPackageImport(specifier, "react-router-dom") ||
            isSharedApiImport(specifier) ||
            isFeatureLayerImport(specifier, "api"))
        ) {
          addImportViolation(
            violations,
            sourceFile,
            specifier,
            "feature model files must stay framework-independent and must not import API clients.",
          );
        }

        if (
          isFeatureUiFile(sourceFile.relativePath) &&
          (isSharedApiImport(specifier) ||
            isFeatureLayerImport(specifier, "api") ||
            isFeatureLayerImport(specifier, "route"))
        ) {
          addImportViolation(
            violations,
            sourceFile,
            specifier,
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

    expect(violations, violations.join("\n")).toEqual([]);
  });
});
