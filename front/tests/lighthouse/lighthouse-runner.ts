import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { summarizeLhr } from "./finding-classifier";
import type { LighthouseRouteDefinition, NormalizedLighthouseResult } from "./types";

export type LighthouseAdapterResult = {
  lhr: Parameters<typeof summarizeLhr>[1];
  report?: string | string[];
};

export type LighthouseAdapter = (
  url: string,
  route: LighthouseRouteDefinition,
) => Promise<LighthouseAdapterResult>;

export type RouteDiagnosticContext = {
  baseUrl: string;
  page: Pick<Page, "goto" | "waitForLoadState" | "getByText">;
  lighthouse: LighthouseAdapter;
  outputDir: string;
};

function absoluteUrl(baseUrl: string, path: string) {
  return new URL(path, baseUrl).toString();
}

function reportPair(report: string | string[] | undefined) {
  if (Array.isArray(report)) {
    return { json: report[0] ?? "{}", html: report[1] ?? "" };
  }
  return { json: report ?? "{}", html: "" };
}

async function writeRawReports(
  outputDir: string,
  route: LighthouseRouteDefinition,
  lighthouseResult: LighthouseAdapterResult,
) {
  const resultsDir = join(outputDir, "results");
  const reportsDir = join(outputDir, "reports");
  await mkdir(resultsDir, { recursive: true });
  await mkdir(reportsDir, { recursive: true });

  const pair = reportPair(lighthouseResult.report);
  const jsonPath = join(resultsDir, `${route.id}.json`);
  const htmlPath = join(reportsDir, `${route.id}.html`);

  await writeFile(jsonPath, pair.json, "utf8");
  await writeFile(htmlPath, pair.html, "utf8");

  return {
    reportJsonPath: `results/${route.id}.json`,
    reportHtmlPath: `reports/${route.id}.html`,
  };
}

function routeFailure(
  route: LighthouseRouteDefinition,
  failureReason: string,
): NormalizedLighthouseResult {
  return {
    routeId: route.id,
    group: route.group,
    path: route.path,
    mode: route.mode,
    status: "route_failure",
    scores: {
      performance: null,
      accessibility: null,
      bestPractices: null,
      seo: null,
    },
    findings: [
      {
        auditId: "route-entry",
        title: failureReason,
        score: null,
        numericValue: null,
        bucket: "route_data_failure",
      },
    ],
    failureReason,
  };
}

export async function runRouteDiagnostic(
  context: RouteDiagnosticContext,
  route: LighthouseRouteDefinition,
): Promise<NormalizedLighthouseResult> {
  const url = absoluteUrl(context.baseUrl, route.path);
  try {
    await context.page.goto(url);
    await context.page.waitForLoadState("networkidle");
    if (route.expectedText) {
      await context.page.getByText(route.expectedText, { exact: false }).waitFor({ timeout: 15_000 });
    }
  } catch (error) {
    return routeFailure(route, error instanceof Error ? error.message : String(error));
  }

  try {
    const lighthouseResult = await context.lighthouse(url, route);
    const reportPaths = await writeRawReports(context.outputDir, route, lighthouseResult);
    return Object.assign(summarizeLhr(route, lighthouseResult.lhr), reportPaths);
  } catch (error) {
    return Object.assign(routeFailure(route, error instanceof Error ? error.message : String(error)), {
      status: "audit_failure" as const,
      findings: [
        {
          auditId: "lighthouse-runtime",
          title: error instanceof Error ? error.message : String(error),
          score: null,
          numericValue: null,
          bucket: "audit_failure" as const,
        },
      ],
    });
  }
}

export async function runLighthouseRoutes(
  context: RouteDiagnosticContext,
  routes: LighthouseRouteDefinition[],
) {
  const results: NormalizedLighthouseResult[] = [];
  for (const route of routes) {
    results.push(await runRouteDiagnostic(context, route));
  }
  return results;
}
