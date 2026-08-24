import { test, expect, chromium } from "@playwright/test";
import type { APIResponse, Page, Response } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  assertExactBoundaryObservation,
  protectedEvidenceEnabled,
  readVerifiedPrimedBrowserState,
  requireCacheSafetyEvidenceConfig,
  writePassingCacheSafetyReport,
  writePrimedBrowserState,
} from "./public-projection-cache-evidence";

type ProjectionResponse = {
  generation: number;
  readable: boolean;
  body: string | null;
  maxAgeSeconds: number;
  staleWhileRevalidateSeconds: number;
};

class ControllableClock {
  nowSeconds = 0;

  advance(seconds: number) {
    this.nowSeconds += seconds;
  }
}

class FakeOrigin {
  private response: ProjectionResponse;

  constructor(response: ProjectionResponse) {
    this.response = response;
  }

  current() {
    return { ...this.response };
  }

  deployPolicy(maxAgeSeconds: number, staleWhileRevalidateSeconds: number) {
    this.response = { ...this.response, maxAgeSeconds, staleWhileRevalidateSeconds };
  }

  replace(generation: number, readable: boolean, body: string | null) {
    this.response = { ...this.response, generation, readable, body };
  }
}

class GenerationCheckingEdge {
  private cached: ProjectionResponse | null = null;

  constructor(private readonly origin: FakeOrigin) {}

  prime() {
    this.cached = this.origin.current();
    return this.cached;
  }

  read() {
    const marker = this.origin.current();
    if (!marker.readable) {
      this.cached = null;
      return marker;
    }
    if (!this.cached || this.cached.generation !== marker.generation) {
      this.cached = marker;
    }
    return { ...this.cached };
  }
}

class FakeBrowserCache {
  private cached: (ProjectionResponse & { storedAt: number }) | null = null;

  constructor(
    private readonly clock: ControllableClock,
    private readonly edge: GenerationCheckingEdge,
  ) {}

  prime() {
    return this.store(this.edge.prime());
  }

  navigate() {
    if (this.cached) {
      const age = this.clock.nowSeconds - this.cached.storedAt;
      const staleLimit = this.cached.maxAgeSeconds + this.cached.staleWhileRevalidateSeconds;
      if (age < this.cached.maxAgeSeconds || age < staleLimit) {
        return { ...this.cached };
      }
    }
    return this.store(this.edge.read());
  }

  reload() {
    return this.navigate();
  }

  back() {
    return this.navigate();
  }

  newNavigation() {
    return this.store(this.edge.read());
  }

  private store(response: ProjectionResponse) {
    this.cached = { ...response, storedAt: this.clock.nowSeconds };
    return { ...this.cached };
  }
}

const provenCases = new Set<string>();

function proveCase(caseId: string) {
  provenCases.add(caseId);
}

function isProtectedReporterRun(commandId: string) {
  return protectedEvidenceEnabled() && process.env.READMATES_HOST_ROLLOUT_COMMAND_ID === commandId;
}

function cacheControlSeconds(cacheControl: string, directive: string) {
  const matched = new RegExp(`${directive}=(\\d+)`, "i").exec(cacheControl);
  return matched ? Number(matched[1]) : null;
}

function assertExactApiResponse(response: APIResponse, expectedUrl: string) {
  assertExactBoundaryObservation({
    expectedUrl,
    responseUrl: response.url(),
    status: response.status(),
  });
}

function assertExactBrowserResponse(response: Response | null, page: Page, expectedUrl: string): Response {
  expect(response).not.toBeNull();
  if (!response) throw new Error("protected browser boundary returned no navigation response");
  assertExactBoundaryObservation({
    expectedUrl,
    responseUrl: response.url(),
    status: response.status(),
    redirectedFromUrl: response.request().redirectedFrom()?.url(),
    finalPageUrl: page.url(),
  });
  return response;
}

test.describe.configure({ mode: "serial" });

test("@prechange browser retains the previous 120 plus 600 policy for the full 720-second window", async () => {
  const clock = new ControllableClock();
  const origin = new FakeOrigin({
    generation: 1,
    readable: true,
    body: "prechange-public-body",
    maxAgeSeconds: 120,
    staleWhileRevalidateSeconds: 600,
  });
  const browser = new FakeBrowserCache(clock, new GenerationCheckingEdge(origin));

  expect(browser.prime().body).toBe("prechange-public-body");
  origin.deployPolicy(60, 0);
  origin.replace(2, false, null);
  clock.advance(719);
  expect(browser.back().body).toBe("prechange-public-body");
  clock.advance(1);
  expect(browser.reload().readable).toBe(false);

  if (isProtectedReporterRun("seed-r2a-prechange-cache")) {
    const config = requireCacheSafetyEvidenceConfig("seed-r2a-prechange-cache");
    mkdirSync(config.primedBrowserProfile, { recursive: true });
    if (config.phase === "pre-change") {
      const context = await chromium.launchPersistentContext(config.primedBrowserProfile);
      try {
        const primedPage = context.pages()[0] ?? (await context.newPage());
        const primeUrl = config.expectedCdnRevokedUrl;
        const response = assertExactBrowserResponse(await primedPage.goto(primeUrl), primedPage, primeUrl);
        expect(response.status()).toBe(200);
        expect(response.headers().etag).toBe(config.oldGenerationEtag);
        const cacheControl = response.headers()["cache-control"] ?? "";
        expect(cacheControlSeconds(cacheControl, "max-age")).toBe(120);
        expect(cacheControlSeconds(cacheControl, "stale-while-revalidate")).toBe(600);
        writePrimedBrowserState(config, {
          schemaVersion: "readmates.public-cache.prime.v1",
          artifactId: config.primedBrowserArtifactId,
          profileNonce: randomUUID().replaceAll("-", ""),
          primeUrl,
          oldGenerationEtag: config.oldGenerationEtag,
          primedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
        });
      } finally {
        await context.close();
      }
      return;
    }

    const state = readVerifiedPrimedBrowserState(config);
    const context = await chromium.launchPersistentContext(config.primedBrowserProfile);
    try {
      const proofPage = context.pages()[0] ?? (await context.newPage());
      const response = assertExactBrowserResponse(
        await proofPage.goto(config.expectedCdnRevokedUrl),
        proofPage,
        config.expectedCdnRevokedUrl,
      );
      expect(response.status()).toBe(404);
      expect(response.headers().etag).not.toBe(state.oldGenerationEtag);
      proveCase("browser-previous-policy-720s");
      writePassingCacheSafetyReport("seed-r2a-prechange-cache", provenCases);
    } finally {
      await context.close();
    }
  }
});

test("@policy-deployed origin and generation-checking edge never serve a revoked old generation", async ({ request }) => {
  const actual = await request.get(
    "/api/bff/api/public/clubs/reading-sai/sessions/00000000-0000-0000-0000-000000000306",
  );
  expect(actual.status()).toBe(200);
  expect(actual.headers()["cache-control"]).toBe("public, max-age=60, must-revalidate");
  expect(actual.headers().etag).toMatch(/^"public-record-g\d+-r\d+"$/);

  const origin = new FakeOrigin({
    generation: 4,
    readable: true,
    body: "generation-four-body",
    maxAgeSeconds: 60,
    staleWhileRevalidateSeconds: 0,
  });
  const edge = new GenerationCheckingEdge(origin);
  expect(edge.prime().body).toBe("generation-four-body");

  origin.replace(5, false, null);

  expect(origin.current()).toMatchObject({ generation: 5, readable: false, body: null });
  expect(edge.read()).toMatchObject({ generation: 5, readable: false, body: null });
  expect(edge.read().body).toBeNull();

  if (isProtectedReporterRun("deploy-r2a-cache-policy")) {
    const config = requireCacheSafetyEvidenceConfig("deploy-r2a-cache-policy");
    expect(config.phase).toBe("policy-deployed");
    const headers = { "If-None-Match": config.oldGenerationEtag };
    const originDeny = await request.get(config.expectedOriginRevokedUrl, { headers, maxRedirects: 0 });
    assertExactApiResponse(originDeny, config.expectedOriginRevokedUrl);
    expect(originDeny.status()).toBe(404);
    expect(originDeny.headers()["cache-control"]).toContain("no-store");
    proveCase("origin-immediate-deny");

    const bffDeny = await request.get(config.expectedBffRevokedUrl, { headers, maxRedirects: 0 });
    assertExactApiResponse(bffDeny, config.expectedBffRevokedUrl);
    expect(bffDeny.status()).toBe(404);
    expect(bffDeny.headers()["cache-control"]).toContain("no-store");
    expect(bffDeny.headers().etag).toBeUndefined();
    proveCase("bff-generation-deny");

    const cdnDeny = await request.get(config.expectedCdnRevokedUrl, { headers, maxRedirects: 0 });
    assertExactApiResponse(cdnDeny, config.expectedCdnRevokedUrl);
    expect(cdnDeny.status()).toBe(404);
    expect(cdnDeny.headers()["cache-control"]).toContain("no-store");
    expect(cdnDeny.headers().etag).toBeUndefined();
    expect(cdnDeny.headers()["cf-cache-status"]).toBeTruthy();
    expect(cdnDeny.headers()["cf-cache-status"].toUpperCase()).not.toBe("HIT");
    proveCase("cdn-old-generation-not-served");

    writePassingCacheSafetyReport("deploy-r2a-cache-policy", provenCases);
  }
});

test("new browser policy converges general reads by 120 seconds and emergency reads by 60 without revoked SWR", async ({ page, request }) => {
  const generalClock = new ControllableClock();
  const generalOrigin = new FakeOrigin({
    generation: 8,
    readable: true,
    body: "general-old",
    maxAgeSeconds: 120,
    staleWhileRevalidateSeconds: 0,
  });
  const generalBrowser = new FakeBrowserCache(
    generalClock,
    new GenerationCheckingEdge(generalOrigin),
  );
  generalBrowser.prime();
  generalOrigin.replace(9, true, "general-new");
  generalClock.advance(119);
  expect(generalBrowser.back().body).toBe("general-old");
  generalClock.advance(1);
  expect(generalBrowser.reload().body).toBe("general-new");

  const emergencyClock = new ControllableClock();
  const emergencyOrigin = new FakeOrigin({
    generation: 20,
    readable: true,
    body: "emergency-old",
    maxAgeSeconds: 60,
    staleWhileRevalidateSeconds: 0,
  });
  const emergencyBrowser = new FakeBrowserCache(
    emergencyClock,
    new GenerationCheckingEdge(emergencyOrigin),
  );
  emergencyBrowser.prime();
  emergencyOrigin.replace(21, false, null);
  emergencyClock.advance(59);
  expect(emergencyBrowser.back().body).toBe("emergency-old");
  emergencyClock.advance(1);
  expect(emergencyBrowser.back().body).toBeNull();
  expect(emergencyBrowser.reload().body).toBeNull();
  expect(emergencyBrowser.newNavigation().body).toBeNull();

  if (isProtectedReporterRun("playwright-r2a-cache-safety")) {
    const config = requireCacheSafetyEvidenceConfig("playwright-r2a-cache-safety");
    expect(config.phase).toBe("post-wait");
    const state = readVerifiedPrimedBrowserState(config);
    const publicClubUrl = config.expectedCdnClubUrl;
    const general = assertExactBrowserResponse(await page.goto(publicClubUrl), page, publicClubUrl);
    expect(general.status()).toBe(200);
    const generalCacheControl = general.headers()["cache-control"] ?? "";
    expect(cacheControlSeconds(generalCacheControl, "max-age")).not.toBeNull();
    expect(cacheControlSeconds(generalCacheControl, "max-age")!).toBeLessThanOrEqual(120);
    expect(generalCacheControl.toLowerCase()).not.toContain("stale-while-revalidate");
    proveCase("browser-general-120s");

    const emergency = await request.get(config.expectedCdnStableSessionUrl, { maxRedirects: 0 });
    assertExactApiResponse(emergency, config.expectedCdnStableSessionUrl);
    expect(emergency.status()).toBe(200);
    const emergencyCacheControl = emergency.headers()["cache-control"] ?? "";
    expect(cacheControlSeconds(emergencyCacheControl, "max-age")).not.toBeNull();
    expect(cacheControlSeconds(emergencyCacheControl, "max-age")!).toBeLessThanOrEqual(60);
    expect(emergencyCacheControl.toLowerCase()).not.toContain("stale-while-revalidate");
    proveCase("browser-emergency-60s");

    const context = await chromium.launchPersistentContext(config.primedBrowserProfile);
    try {
      const primedPage = context.pages()[0] ?? (await context.newPage());
      const denied = assertExactBrowserResponse(
        await primedPage.goto(config.expectedCdnRevokedUrl),
        primedPage,
        config.expectedCdnRevokedUrl,
      );
      expect(denied.status()).toBe(404);
      expect(denied.headers().etag).not.toBe(state.oldGenerationEtag);
      const reloaded = assertExactBrowserResponse(
        await primedPage.reload(),
        primedPage,
        config.expectedCdnRevokedUrl,
      );
      expect(reloaded.status()).toBe(404);
      const newNavigation = await context.newPage();
      const freshResponse = assertExactBrowserResponse(
        await newNavigation.goto(config.expectedCdnRevokedUrl),
        newNavigation,
        config.expectedCdnRevokedUrl,
      );
      expect(freshResponse.status()).toBe(404);
      await newNavigation.close();
      proveCase("browser-proof-after-wait");
    } finally {
      await context.close();
    }

    writePassingCacheSafetyReport("playwright-r2a-cache-safety", provenCases);
  }
});
