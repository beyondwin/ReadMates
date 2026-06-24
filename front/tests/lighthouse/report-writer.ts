import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { NormalizedLighthouseResult } from "./types";

export type LighthouseRunContext = {
  commit: string;
  timestamp: string;
  deviceProfile: string;
  serverProfile: string;
};

export type WriteReportInput = {
  outputDir: string;
  runContext: LighthouseRunContext;
  results: NormalizedLighthouseResult[];
};

export type ReportWriteResult = {
  summaryPath: string;
  routesPath: string;
  findingsPath: string;
};

function scoreText(score: number | null) {
  return score === null ? "n/a" : score.toFixed(2);
}

function routeMatrixRow(result: NormalizedLighthouseResult) {
  const keyFindings = result.findings.map((finding) => finding.auditId).join(", ") || "none";
  return [
    result.group,
    result.routeId,
    result.mode,
    result.status,
    scoreText(result.scores.performance),
    scoreText(result.scores.accessibility),
    scoreText(result.scores.bestPractices),
    scoreText(result.scores.seo),
    keyFindings,
  ].join(" | ");
}

function repeatedCauseRows(results: NormalizedLighthouseResult[]) {
  const byBucket = new Map<string, Set<string>>();
  for (const result of results) {
    for (const finding of result.findings) {
      if (finding.bucket === "local_dev_noise") {
        continue;
      }
      const routes = byBucket.get(finding.bucket) ?? new Set<string>();
      routes.add(result.routeId);
      byBucket.set(finding.bucket, routes);
    }
  }

  return Array.from(byBucket.entries())
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
    .map(([bucket, routes]) => `| ${bucket} | ${Array.from(routes).join(", ")} | Lighthouse audit findings | Create a scoped goal from affected routes |`);
}

function localDevNoiseRows(results: NormalizedLighthouseResult[]) {
  const byBucket = new Map<string, Set<string>>();
  for (const result of results) {
    for (const finding of result.findings) {
      if (finding.bucket !== "local_dev_noise") {
        continue;
      }
      const routes = byBucket.get(finding.bucket) ?? new Set<string>();
      routes.add(result.routeId);
      byBucket.set(finding.bucket, routes);
    }
  }

  return Array.from(byBucket.entries())
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
    .map(([bucket, routes]) => `| ${bucket} | ${Array.from(routes).join(", ")} | Lighthouse audit findings | local-dev diagnostic only |`);
}

function buildSummary(input: WriteReportInput) {
  const failedRoutes = input.results.filter((result) => result.status !== "passed");
  const matrixRows = input.results.map((result) => `| ${routeMatrixRow(result)} |`);
  const causeRows = repeatedCauseRows(input.results);
  const causeLines = causeRows.length ? causeRows : ["| none | none | no release-actionable failed Lighthouse audits | keep baseline |"];
  const noiseRows = localDevNoiseRows(input.results);
  const noiseLines = noiseRows.length ? noiseRows : ["| none | none | no local-dev-only Lighthouse findings | keep baseline |"];

  return [
    "# ReadMates Lighthouse Diagnostic",
    "",
    "## Run Context",
    `- commit: ${input.runContext.commit}`,
    `- timestamp: ${input.runContext.timestamp}`,
    `- device profile: ${input.runContext.deviceProfile}`,
    `- server profile: ${input.runContext.serverProfile}`,
    `- route count: ${input.results.length}`,
    `- failed route count: ${failedRoutes.length}`,
    "",
    "## Executive Summary",
    `- Route entry failures: ${failedRoutes.map((result) => result.routeId).join(", ") || "none"}`,
    "- Suggested next improvement goals: inspect repeated cause rows and choose the smallest affected surface.",
    "",
    "## Route Matrix",
    "| group | route | mode | status | performance | accessibility | best-practices | seo | key findings |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...matrixRows,
    "",
    "## Repeated Root Causes",
    "| cause | affected routes | evidence | safe improvement direction |",
    "| --- | --- | --- | --- |",
    ...causeLines,
    "",
    "## Local Dev Noise",
    "| cause | affected routes | evidence | interpretation |",
    "| --- | --- | --- | --- |",
    ...noiseLines,
    "",
    "## Suggested Goal Prompts",
    "- Goal: Improve ReadMates affected routes for the top repeated page-quality cause without changing product behavior.",
    "- Goal: Fix route entry failures separately before interpreting Lighthouse scores.",
    "",
  ].join("\n");
}

export async function writeLighthouseDiagnosticReport(
  input: WriteReportInput,
): Promise<ReportWriteResult> {
  await mkdir(input.outputDir, { recursive: true });
  const summaryPath = join(input.outputDir, "summary.md");
  const routesPath = join(input.outputDir, "routes.json");
  const findingsPath = join(input.outputDir, "findings.json");

  await writeFile(summaryPath, buildSummary(input), "utf8");
  await writeFile(
    routesPath,
    JSON.stringify(
      input.results.map((result) => ({
        routeId: result.routeId,
        group: result.group,
        path: result.path,
        mode: result.mode,
        status: result.status,
      })),
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(findingsPath, JSON.stringify(input.results, null, 2), "utf8");

  return { summaryPath, routesPath, findingsPath };
}
