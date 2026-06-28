export type BudgetBucket =
  | "vendor-framework"
  | "vendor-misc"
  | "host-route"
  | "route"
  | "app-entry"
  | "css-global"
  | "uncategorized";

export type BudgetSeverity = "error" | "warn" | "measure";

export type BuildAssetInput = {
  fileName: string;
  bytes: number;
  gzipBytes: number | null;
};

export type BudgetRule = {
  bucket: BudgetBucket;
  limitBytes: number | null;
  severity: BudgetSeverity;
};

export type ClassifiedBuildAsset = BuildAssetInput & {
  bucket: BudgetBucket;
  limitBytes: number | null;
  severity: BudgetSeverity;
};

export type BudgetFinding = {
  bucket: BudgetBucket;
  fileName: string;
  bytes: number;
  gzipBytes: number | null;
  limitBytes: number;
  severity: Exclude<BudgetSeverity, "measure">;
};

export type BuildBudgetReport = {
  status: "passed" | "failed";
  generatedAt: string;
  assets: ClassifiedBuildAsset[];
  violations: BudgetFinding[];
  warnings: BudgetFinding[];
};

const jsChunkLimit = 350_000;

export const defaultBudgetRules: BudgetRule[] = [
  { bucket: "vendor-framework", limitBytes: jsChunkLimit, severity: "error" },
  { bucket: "vendor-misc", limitBytes: jsChunkLimit, severity: "error" },
  { bucket: "host-route", limitBytes: 120_000, severity: "error" },
  { bucket: "route", limitBytes: 80_000, severity: "warn" },
  { bucket: "app-entry", limitBytes: jsChunkLimit, severity: "error" },
  { bucket: "css-global", limitBytes: 110_000, severity: "error" },
  { bucket: "uncategorized", limitBytes: jsChunkLimit, severity: "measure" },
];

const routeChunkPrefixes = [
  "admin-",
  "auth-",
  "feedback-",
  "member-",
  "notes-",
  "public-",
  "route-",
  "session-",
];

const hostRouteChunkPrefixes = [
  "dashboard-route-element-",
  "edit-session-route-element-",
  "host-",
  "invitations-route-element-",
  "members-route-element-",
  "new-session-route-element-",
  "notifications-route-element-",
  "session-closing-route-element-",
];

function classifyAsset(fileName: string): BudgetBucket {
  if (fileName.endsWith(".css")) return "css-global";
  if (/^vendor-(react|router|query|framework)/.test(fileName)) return "vendor-framework";
  if (/^vendor-/.test(fileName)) return "vendor-misc";
  if (hostRouteChunkPrefixes.some((prefix) => fileName.startsWith(prefix)) || /host.*route/.test(fileName)) {
    return "host-route";
  }
  if (/^index-/.test(fileName)) return "app-entry";
  if (routeChunkPrefixes.some((prefix) => fileName.startsWith(prefix))) return "route";
  return "uncategorized";
}

function ruleFor(bucket: BudgetBucket, budgets: BudgetRule[]): BudgetRule {
  const rule = budgets.find((candidate) => candidate.bucket === bucket);
  if (!rule) {
    throw new Error(`Missing build budget rule for bucket ${bucket}`);
  }
  return rule;
}

function toFinding(asset: ClassifiedBuildAsset): BudgetFinding {
  if (asset.limitBytes === null || asset.severity === "measure") {
    throw new Error(`Cannot create budget finding for measured-only asset ${asset.fileName}`);
  }
  return {
    bucket: asset.bucket,
    fileName: asset.fileName,
    bytes: asset.bytes,
    gzipBytes: asset.gzipBytes,
    limitBytes: asset.limitBytes,
    severity: asset.severity,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1_000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(1)} kB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export function analyzeBuildAssets(
  files: BuildAssetInput[],
  budgets: BudgetRule[] = defaultBudgetRules,
): BuildBudgetReport {
  const assets = files
    .filter((file) => file.fileName.endsWith(".js") || file.fileName.endsWith(".css"))
    .map((file) => {
      const bucket = classifyAsset(file.fileName);
      const rule = ruleFor(bucket, budgets);
      return {
        ...file,
        bucket,
        limitBytes: rule.limitBytes,
        severity: rule.severity,
      };
    })
    .sort((a, b) => b.bytes - a.bytes || a.fileName.localeCompare(b.fileName));

  const overBudget = assets.filter((asset) => asset.limitBytes !== null && asset.bytes > asset.limitBytes);
  const violations = overBudget.filter((asset) => asset.severity === "error").map(toFinding);
  const warnings = overBudget.filter((asset) => asset.severity === "warn").map(toFinding);

  return {
    status: violations.length === 0 ? "passed" : "failed",
    generatedAt: new Date().toISOString(),
    assets,
    violations,
    warnings,
  };
}

function findingRow(finding: BudgetFinding): string {
  return [
    finding.bucket,
    finding.fileName,
    formatBytes(finding.bytes),
    finding.gzipBytes === null ? "n/a" : formatBytes(finding.gzipBytes),
    formatBytes(finding.limitBytes),
    finding.severity,
  ].join(" | ");
}

function assetRow(asset: ClassifiedBuildAsset): string {
  return [
    asset.bucket,
    asset.fileName,
    formatBytes(asset.bytes),
    asset.gzipBytes === null ? "n/a" : formatBytes(asset.gzipBytes),
    asset.limitBytes === null ? "n/a" : formatBytes(asset.limitBytes),
    asset.severity,
  ].join(" | ");
}

export function renderBuildBudgetMarkdown(report: BuildBudgetReport): string {
  const findingRows = [...report.violations, ...report.warnings].map((finding) => `| ${findingRow(finding)} |`);
  const budgetRows = findingRows.length ? findingRows : ["| none | none | n/a | n/a | n/a | passed |"];
  const assetRows = report.assets.map((asset) => `| ${assetRow(asset)} |`);

  return [
    "# ReadMates Build Budget",
    "",
    `- generatedAt: ${report.generatedAt}`,
    `- status: ${report.status}`,
    "",
    "## Budget Results",
    "| bucket | file | bytes | gzip | limit | severity |",
    "| --- | --- | --- | --- | --- | --- |",
    ...budgetRows,
    "",
    "## Largest Assets",
    "| bucket | file | bytes | gzip | limit | policy |",
    "| --- | --- | --- | --- | --- | --- |",
    ...assetRows,
    "",
  ].join("\n");
}
