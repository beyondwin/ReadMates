import { expect, test, type Page, type Route } from "@playwright/test";
import { onRequest } from "../../functions/api/bff/[[path]]";

type StoredResponse = {
  response: Response;
  storedAtSeconds: number;
  maxAgeSeconds: number;
  staleWhileRevalidateSeconds: number;
};

class DeterministicCache {
  nowSeconds = 0;
  private readonly entries = new Map<string, StoredResponse>();

  async match(request: Request): Promise<Response | undefined> {
    const entry = this.entries.get(request.url);
    if (!entry) return undefined;
    const age = this.nowSeconds - entry.storedAtSeconds;
    if (age > entry.maxAgeSeconds + entry.staleWhileRevalidateSeconds) {
      this.entries.delete(request.url);
      return undefined;
    }
    return entry.response.clone();
  }

  async put(request: Request, response: Response): Promise<void> {
    const policy = parseCacheControl(response.headers.get("Cache-Control") ?? "");
    this.entries.set(request.url, {
      response: response.clone(),
      storedAtSeconds: this.nowSeconds,
      ...policy,
    });
  }

  async delete(request: Request): Promise<boolean> {
    return this.entries.delete(request.url);
  }

  seed(requestUrl: string, response: Response) {
    const policy = parseCacheControl(response.headers.get("Cache-Control") ?? "");
    this.entries.set(requestUrl, {
      response: response.clone(),
      storedAtSeconds: this.nowSeconds,
      ...policy,
    });
  }
}

class ActualBffHarness {
  readonly cache = new DeterministicCache();
  private readonly origin = new Map<string, { body: string; status: number; cacheControl?: string }>();

  setOrigin(path: string, body: string, cacheControl = "public, max-age=120, stale-while-revalidate=600") {
    this.origin.set(path, { body, status: 200, cacheControl });
  }

  revoke(path: string) {
    this.origin.set(path, { body: "origin-denied", status: 404 });
  }

  seedOldBrowserResponse(path: string, body: string) {
    this.cache.seed(
      bffUrl(path),
      new Response(body, {
        status: 200,
        headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=600" },
      }),
    );
  }

  async dispatch(path: string) {
    const priorFetch = globalThis.fetch;
    const globals = globalThis as typeof globalThis & { caches?: unknown };
    const priorCaches = globals.caches;
    const pending: Array<Promise<unknown>> = [];
    globalThis.fetch = async (input) => {
      const originPath = new URL(String(input)).pathname;
      const result = this.origin.get(originPath) ?? { body: "origin-denied", status: 404 };
      return new Response(result.body, {
        status: result.status,
        headers: result.cacheControl ? { "Cache-Control": result.cacheControl } : undefined,
      });
    };
    Object.defineProperty(globals, "caches", {
      configurable: true,
      writable: true,
      value: { default: this.cache },
    });
    try {
      const response = await onRequest({
        request: new Request(bffUrl(path)),
        env: {
          READMATES_API_BASE_URL: "https://api.example.test",
          READMATES_BFF_SECRET: "test-bff-secret",
        },
        params: { path: path.replace(/^\//, "").split("/") },
        waitUntil: (promise) => pending.push(promise),
      });
      await Promise.all(pending);
      return {
        status: response.status,
        body: await response.text(),
        cacheControl: response.headers.get("Cache-Control") ?? "",
      };
    } finally {
      globalThis.fetch = priorFetch;
      if (priorCaches === undefined) {
        Reflect.deleteProperty(globals, "caches");
      } else {
        Object.defineProperty(globals, "caches", {
          configurable: true,
          writable: true,
          value: priorCaches,
        });
      }
    }
  }
}

function parseCacheControl(value: string) {
  return {
    maxAgeSeconds: Number(/(?:^|,)\s*max-age=(\d+)/i.exec(value)?.[1] ?? 0),
    staleWhileRevalidateSeconds: Number(
      /(?:^|,)\s*stale-while-revalidate=(\d+)/i.exec(value)?.[1] ?? 0,
    ),
  };
}

function bffUrl(path: string) {
  return `https://browser.example.test/api/bff${path}`;
}

async function installActualBff(page: Page, harness: ActualBffHarness) {
  await page.route("https://browser.example.test/api/bff/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/bff", "");
    const response = await harness.dispatch(path);
    await route.fulfill({
      status: response.status,
      headers: { "Cache-Control": response.cacheControl, "Content-Type": "text/plain" },
      body: response.body,
    });
  });
  await page.route("https://browser.example.test/view**", serveBrowserView);
}

async function serveBrowserView(route: Route) {
  const path = new URL(route.request().url()).searchParams.get("path") ?? "/missing";
  await route.fulfill({
    status: 200,
    headers: { "Cache-Control": "no-store", "Content-Type": "text/html" },
    body: `
      <main data-status="loading"></main>
      <script>
        window.addEventListener("unload", () => {});
        fetch(${JSON.stringify(bffUrl(path))}, { cache: "no-store" }).then(async (response) => {
          const main = document.querySelector("main");
          main.textContent = await response.text();
          main.dataset.status = String(response.status);
          main.dataset.cacheControl = response.headers.get("Cache-Control") || "";
        });
      </script>
    `,
  });
}

async function visit(page: Page, path: string, visitId: string) {
  await page.goto(
    `https://browser.example.test/view?path=${encodeURIComponent(path)}&visit=${visitId}`,
  );
  await expect(page.locator("main")).not.toHaveAttribute("data-status", "loading");
}

test.describe.configure({ mode: "serial" });

test("actual BFF stops serving a revoked public club list after 60 seconds", async ({ page }) => {
  const harness = new ActualBffHarness();
  const path = "/api/public/clubs/reading-sai";
  harness.setOrigin(path, "generation-1-club", "public, max-age=60, must-revalidate");
  await installActualBff(page, harness);

  await visit(page, path, "initial");
  await expect(page.locator("main")).toHaveText("generation-1-club");
  await expect(page.locator("main")).toHaveAttribute(
    "data-cache-control",
    "public, max-age=60, must-revalidate",
  );
  harness.revoke(path);

  harness.cache.nowSeconds = 59;
  await visit(page, path, "before-boundary");
  await expect(page.locator("main")).toHaveText("generation-1-club");

  harness.cache.nowSeconds = 61;
  await visit(page, path, "after-boundary");
  await expect(page.locator("main")).toHaveText("origin-denied");
  await expect(page.locator("main")).toHaveAttribute("data-cache-control", "no-store");
});

test("actual BFF detail policy denies after 60 seconds on navigation reload and Back", async ({ page }) => {
  const harness = new ActualBffHarness();
  const path = "/api/public/clubs/reading-sai/sessions/session-1";
  harness.setOrigin(path, "generation-1-detail");
  await installActualBff(page, harness);

  await visit(page, path, "initial");
  await expect(page.locator("main")).toHaveText("generation-1-detail");
  await expect(page.locator("main")).toHaveAttribute(
    "data-cache-control",
    "public, max-age=60, must-revalidate",
  );
  harness.revoke(path);

  harness.cache.nowSeconds = 59;
  await visit(page, path, "fresh-window");
  await expect(page.locator("main")).toHaveText("generation-1-detail");

  harness.cache.nowSeconds = 61;
  await visit(page, path, "new-navigation");
  await expect(page.locator("main")).toHaveText("origin-denied");
  await expect(page.locator("main")).toHaveAttribute("data-cache-control", "no-store");
  await page.reload();
  await expect(page.locator("main")).toHaveText("origin-denied");
  await visit(page, path, "back-target");
  await page.goBack();
  await expect(page.locator("main")).toHaveText("origin-denied");
  await expect(page.locator("main")).toHaveAttribute("data-cache-control", "no-store");
});

test("actual BFF rejects an old 120 plus 600 response only after the full 720 seconds", async ({ page }) => {
  const harness = new ActualBffHarness();
  const path = "/api/public/clubs/reading-sai/sessions/session-1";
  harness.seedOldBrowserResponse(path, "old-browser-detail");
  harness.revoke(path);
  await installActualBff(page, harness);

  harness.cache.nowSeconds = 719;
  await visit(page, path, "old-policy-still-live");
  await expect(page.locator("main")).toHaveText("old-browser-detail");

  harness.cache.nowSeconds = 721;
  await visit(page, path, "activation-safe");
  await expect(page.locator("main")).toHaveText("origin-denied");
  await expect(page.locator("main")).toHaveAttribute("data-cache-control", "no-store");
  await page.reload();
  await expect(page.locator("main")).toHaveText("origin-denied");
});
