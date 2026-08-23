import { expect, test, type Page, type Route } from "@playwright/test";
import { boundedPublicCacheControl } from "../../functions/_shared/cache";

type CachedProjection = {
  body: string;
  status: number;
  storedAtSeconds: number;
  maxAgeSeconds: number;
  staleWhileRevalidateSeconds: number;
};

class FakePublicEdge {
  nowSeconds = 0;
  originBody = "generation-1-public-body";
  originReadable = true;
  originCacheControl = "public, max-age=120, stale-while-revalidate=600";
  cached: CachedProjection | null = null;

  updateOrigin(body: string) {
    this.originBody = body;
  }

  revokeOrigin() {
    this.originReadable = false;
  }

  deployBoundedPolicy(path: string) {
    this.originCacheControl = boundedPublicCacheControl(path, this.originCacheControl);
  }

  async handle(route: Route) {
    const cached = this.cached;
    if (cached) {
      const age = this.nowSeconds - cached.storedAtSeconds;
      if (age <= cached.maxAgeSeconds + cached.staleWhileRevalidateSeconds) {
        await route.fulfill({
          status: cached.status,
          contentType: "text/html",
          headers: { "Cache-Control": this.cacheControl(cached) },
          body: `<main data-cache="edge">${cached.body}</main>`,
        });
        return;
      }
    }

    const status = this.originReadable ? 200 : 404;
    const body = this.originReadable ? this.originBody : "origin-denied";
    const policy = parseCacheControl(this.originCacheControl);
    if (status === 200) {
      this.cached = {
        body,
        status,
        storedAtSeconds: this.nowSeconds,
        ...policy,
      };
    } else {
      this.cached = null;
    }
    await route.fulfill({
      status,
      contentType: "text/html",
      headers: { "Cache-Control": status === 200 ? this.originCacheControl : "no-store" },
      body: `<main data-cache="origin">${body}</main>`,
    });
  }

  private cacheControl(cached: CachedProjection) {
    const stale = cached.staleWhileRevalidateSeconds > 0
      ? `, stale-while-revalidate=${cached.staleWhileRevalidateSeconds}`
      : ", must-revalidate";
    return `public, max-age=${cached.maxAgeSeconds}${stale}`;
  }
}

function parseCacheControl(value: string) {
  const maxAgeSeconds = Number(/(?:^|,)\s*max-age=(\d+)/i.exec(value)?.[1] ?? 0);
  const staleWhileRevalidateSeconds = Number(
    /(?:^|,)\s*stale-while-revalidate=(\d+)/i.exec(value)?.[1] ?? 0,
  );
  return { maxAgeSeconds, staleWhileRevalidateSeconds };
}

async function installFakeEdge(page: Page, edge: FakePublicEdge) {
  await page.route("https://public-cache.example.test/**", (route) => edge.handle(route));
}

test("general public projection converges by 120 seconds under a deterministic cache clock", async ({ page }) => {
  const edge = new FakePublicEdge();
  edge.originCacheControl = "public, max-age=120, must-revalidate";
  await installFakeEdge(page, edge);

  await page.goto("https://public-cache.example.test/records/session-1?visit=initial");
  await expect(page.locator("main")).toHaveText("generation-1-public-body");
  edge.updateOrigin("generation-2-public-body");

  edge.nowSeconds = 119;
  await page.goto("https://public-cache.example.test/records/session-1?visit=before-boundary");
  await expect(page.locator("main")).toHaveText("generation-1-public-body");

  edge.nowSeconds = 121;
  await page.goto("https://public-cache.example.test/records/session-1?visit=after-boundary");
  await expect(page.locator("main")).toHaveText("generation-2-public-body");
});

test("bounded public detail policy denies revoked bodies after 60 seconds without SWR on new navigation reload or Back", async ({ page }) => {
  const edge = new FakePublicEdge();
  const publicDetailPath = "/api/public/clubs/reading-sai/sessions/session-1";
  edge.deployBoundedPolicy(publicDetailPath);
  expect(edge.originCacheControl).toBe("public, max-age=60, must-revalidate");
  await installFakeEdge(page, edge);

  await page.goto("https://public-cache.example.test/records/session-1?visit=initial");
  await expect(page.locator("main")).toHaveText("generation-1-public-body");
  edge.revokeOrigin();

  edge.nowSeconds = 59;
  await page.goto("https://public-cache.example.test/records/session-1?visit=fresh-window");
  await expect(page.locator("main")).toHaveText("generation-1-public-body");

  edge.nowSeconds = 61;
  await page.goto("https://public-cache.example.test/records/session-1?visit=new-navigation");
  await expect(page.locator("main")).toHaveText("origin-denied");
  await page.reload();
  await expect(page.locator("main")).toHaveText("origin-denied");
  await page.goBack();
  await expect(page.locator("main")).toHaveText("origin-denied");
});

test("a browser holding the old 120 plus 600 policy is unsafe until the full 720-second activation window expires", async ({ page }) => {
  const edge = new FakePublicEdge();
  await installFakeEdge(page, edge);
  const publicDetailPath = "/api/public/clubs/reading-sai/sessions/session-1";

  await page.goto("https://public-cache.example.test/records/session-1?visit=old-policy");
  await expect(page.locator("main")).toHaveText("generation-1-public-body");
  edge.deployBoundedPolicy(publicDetailPath);
  edge.revokeOrigin();

  edge.nowSeconds = 719;
  await page.goto("https://public-cache.example.test/records/session-1?visit=old-browser-stale");
  await expect(page.locator("main")).toHaveText("generation-1-public-body");

  edge.nowSeconds = 721;
  await page.goto("https://public-cache.example.test/records/session-1?visit=activation-safe");
  await expect(page.locator("main")).toHaveText("origin-denied");
  await page.reload();
  await expect(page.locator("main")).toHaveText("origin-denied");
});
