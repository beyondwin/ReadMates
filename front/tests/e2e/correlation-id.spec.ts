import { expect, test } from "@playwright/test";

// `/api/bff/api/auth/me` is a GET-safe BFF endpoint reachable without prior auth
// in every test profile (see multi-club-flow.spec.ts and public-auth-member-host.spec.ts
// for prior art). It exercises the same proxy layer (front/functions/api/bff/[[path]].ts)
// that sets the X-Readmates-Request-Id header on the outbound response.
const BFF_GET_ENDPOINT = "/api/bff/api/auth/me";

test("BFF response exposes generated X-Readmates-Request-Id header for /api/bff/** calls", async ({ page }) => {
  const headerValue = await page.evaluate(async (url) => {
    const response = await fetch(url, { cache: "no-store" });
    return response.headers.get("x-readmates-request-id");
  }, BFF_GET_ENDPOINT);

  expect(headerValue).not.toBeNull();
  // Matches front/functions/_shared/proxy.ts:REQUEST_ID_PATTERN — generated ids are 12 hex chars.
  expect(headerValue).toMatch(/^[A-Za-z0-9-]{12,64}$/);
});

test("client-supplied X-Readmates-Request-Id is preserved end-to-end on /api/bff/** calls", async ({ page }) => {
  const supplied = "client-correlation-abc1234";
  const headerValue = await page.evaluate(
    async ({ url, requestId }) => {
      const response = await fetch(url, {
        cache: "no-store",
        headers: { "X-Readmates-Request-Id": requestId },
      });
      return response.headers.get("x-readmates-request-id");
    },
    { url: BFF_GET_ENDPOINT, requestId: supplied },
  );

  expect(headerValue).toBe(supplied);
});
