import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { runRouteDiagnostic, type LighthouseAdapter } from "../tests/lighthouse/lighthouse-runner";
import { LIGHTHOUSE_ROUTE_INVENTORY, filterRoutes } from "../tests/lighthouse/route-inventory";
import { writeLighthouseDiagnosticReport } from "../tests/lighthouse/report-writer";
import type {
  LighthouseRouteAuth,
  LighthouseRouteFilters,
  LighthouseRouteGroup,
} from "../tests/lighthouse/types";

type CliOptions = LighthouseRouteFilters & {
  outputDir: string;
  baseUrl: string;
};

const authLabels: Record<Exclude<LighthouseRouteAuth, "none">, string> = {
  member: "안멤버1",
  host: "김호스트 · 호스트",
  admin: "플랫폼 관리자 · OWNER",
};

function stringArg(name: string) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function parseGroup(value: string | undefined): LighthouseRouteGroup | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "public" || value === "member" || value === "host" || value === "admin") {
    return value;
  }
  throw new Error(`Unsupported --group value: ${value}`);
}

function parseLimit(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--limit must be a positive integer, received ${value}`);
  }
  return parsed;
}

function timestampSlug(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function parseCliOptions(): CliOptions {
  return {
    group: parseGroup(stringArg("--group")),
    routeId: stringArg("--route"),
    limit: parseLimit(stringArg("--limit")),
    outputDir:
      stringArg("--output") ??
      process.env.LIGHTHOUSE_OUTPUT_DIR ??
      resolve(process.cwd(), "..", ".tmp", "lighthouse", timestampSlug()),
    baseUrl: process.env.LIGHTHOUSE_BASE_URL ?? `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3100"}`,
  };
}

async function findFreePort() {
  return await new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolvePort(address.port);
        } else {
          reject(new Error("Unable to allocate a local debug port"));
        }
      });
    });
  });
}

async function ensureAuth(page: Page, auth: LighthouseRouteAuth, baseUrl: string) {
  if (auth === "none") {
    return;
  }
  await page.goto(new URL("/login", baseUrl).toString());
  await page.getByRole("button", { name: authLabels[auth] }).click();
  await page.waitForLoadState("networkidle");
}

function createLighthouseAdapter(port: number): LighthouseAdapter {
  return async (url, route) => {
    const { default: lighthouse } = await import("lighthouse");
    const modeFlags = route.mode === "navigation" ? {} : { disableStorageReset: true };
    const result = await lighthouse(url, {
      port,
      output: ["json", "html"],
      logLevel: "error",
      onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
      ...modeFlags,
    });

    if (!result) {
      throw new Error("Lighthouse did not return a result");
    }
    return result;
  };
}

async function run() {
  const options = parseCliOptions();
  const routes = filterRoutes(LIGHTHOUSE_ROUTE_INVENTORY, options);
  if (routes.length === 0) {
    throw new Error("No Lighthouse routes matched the provided filters");
  }

  await mkdir(options.outputDir, { recursive: true });
  const debugPort = await findFreePort();
  const userDataDir = join(options.outputDir, "chromium-profile");
  const context: BrowserContext = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    args: [`--remote-debugging-port=${debugPort}`],
  });

  try {
    const page = await context.newPage();
    const lighthouseAdapter = createLighthouseAdapter(debugPort);
    const results = [];
    let activeAuth: LighthouseRouteAuth = "none";

    for (const route of routes) {
      if (route.auth !== activeAuth) {
        await ensureAuth(page, route.auth, options.baseUrl);
        activeAuth = route.auth;
      }
      results.push(await runRouteDiagnostic({
        baseUrl: options.baseUrl,
        page,
        lighthouse: lighthouseAdapter,
        outputDir: options.outputDir,
      }, route));
    }

    const report = await writeLighthouseDiagnosticReport({
      outputDir: options.outputDir,
      runContext: {
        commit: process.env.GITHUB_SHA ?? "local",
        timestamp: new Date().toISOString(),
        deviceProfile: "desktop-chromium",
        serverProfile: process.env.LIGHTHOUSE_SERVER_PROFILE ?? "local-dev",
      },
      results,
    });

    console.log(`Lighthouse diagnostic complete: ${report.summaryPath}`);
  } finally {
    await context.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
