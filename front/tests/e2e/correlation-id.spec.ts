import { expect, test } from "@playwright/test";
import {
  cleanupGeneratedSessions,
  createOpenSessionFixture,
  loginWithGoogleFixture,
  resetSeedGoogleLogins,
  runMysql,
} from "./readmates-e2e-db";

// `/api/bff/api/auth/me` is a GET-safe BFF endpoint reachable without prior auth
// in every test profile (see multi-club-flow.spec.ts and public-auth-member-host.spec.ts
// for prior art). It exercises the same proxy layer (front/functions/api/bff/[[path]].ts)
// that sets the X-Readmates-Request-Id header on the outbound response.
const BFF_GET_ENDPOINT = "/api/bff/api/auth/me";

test("BFF response exposes generated X-Readmates-Request-Id header for /api/bff/** calls", async ({ page }) => {
  // page.evaluate(fetch) runs in the page context; a prior page.goto is required
  // so relative URLs resolve against baseURL — matches prior art in
  // multi-club-flow.spec.ts and public-auth-member-host.spec.ts.
  await page.goto("/");
  const headerValue = await page.evaluate(async (url) => {
    const response = await fetch(url, { cache: "no-store" });
    return response.headers.get("x-readmates-request-id");
  }, BFF_GET_ENDPOINT);

  expect(headerValue).not.toBeNull();
  // Matches front/functions/_shared/proxy.ts:REQUEST_ID_PATTERN — generated ids are 12 hex chars.
  expect(headerValue).toMatch(/^[A-Za-z0-9-]{12,64}$/);
});

test("client-supplied X-Readmates-Request-Id is preserved end-to-end on /api/bff/** calls", async ({ page }) => {
  await page.goto("/");
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

test("host lifecycle reverse stores the request ID on the audit row", async ({ page }) => {
  cleanupGeneratedSessions();
  const sessionId = createOpenSessionFixture({ number: 8, bookTitle: "요청 ID 감사 모임" });
  runMysql(`update sessions set state = 'CLOSED', updated_at = utc_timestamp(6) where id = '${sessionId}'`);
  resetSeedGoogleLogins(["host@example.com"]);
  const requestId = "e2e-correlation-lifecycle-1";
  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto(`/clubs/reading-sai/app/host/sessions/${sessionId}`);
  await expect(page.getByRole("region", { name: "지금 할 일" })).toBeVisible();
  await page.route(`**/api/bff/api/host/sessions/${sessionId}/reopen**`, async (route) => {
    await route.continue({
      headers: {
        ...route.request().headers(),
        "x-readmates-request-id": requestId,
      },
    });
  });
  await page.getByRole("button", { name: "다시 준비 중으로" }).click();
  const dialog = page.getByRole("dialog", { name: "다시 준비 중으로" });
  await dialog.getByLabel("변경 사유").selectOption("OPERATIONAL_RECOVERY");
  const reverse = page.waitForResponse((response) => (
    response.request().method() === "POST"
    && response.url().includes(`/host/sessions/${sessionId}/reopen`)
  ));
  await dialog.getByRole("button", { name: "다시 준비 중으로" }).click();
  expect((await reverse).status()).toBe(200);
  const audit = runMysql(`
select request_id, reason_code
from host_session_lifecycle_audit
where session_id = '${sessionId}'
  and action_type = 'REOPENED';
`);
  expect(audit).toContain(requestId);
  expect(audit).toContain("OPERATIONAL_RECOVERY");
  cleanupGeneratedSessions();
  resetSeedGoogleLogins(["host@example.com"]);
});
