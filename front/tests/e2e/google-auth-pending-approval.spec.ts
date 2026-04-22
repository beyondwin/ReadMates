import { expect, test } from "@playwright/test";
import {
  cleanupPendingGoogleUserFixtures,
  createPendingGoogleUserFixture,
  loginWithGoogleFixture,
} from "./readmates-e2e-db";
import { installPrintSpy, readPrintCallCount } from "./print-spy";

const pendingEmail = "e2e.pending.google@example.com";
const seededFeedbackSessionId = "00000000-0000-0000-0000-000000000301";

test.beforeEach(() => {
  cleanupPendingGoogleUserFixtures([pendingEmail]);
  createPendingGoogleUserFixture(pendingEmail);
});

test.afterEach(() => {
  cleanupPendingGoogleUserFixtures([pendingEmail]);
});

test("anonymous user remains unauthorized for restricted APIs", async ({ page }) => {
  await page.goto("/");

  const hostDashboardStatus = await page.evaluate(async () => {
    const response = await fetch("/api/bff/api/host/dashboard", { cache: "no-store" });
    return response.status;
  });
  expect(hostDashboardStatus).toBe(401);

  const rsvpStatus = await page.evaluate(async () => {
    const response = await fetch("/api/bff/api/sessions/current/rsvp", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "GOING" }),
    });
    return response.status;
  });
  expect(rsvpStatus).toBe(401);

  const feedbackDocumentStatus = await page.evaluate(async (sessionId) => {
    const response = await fetch(`/api/bff/api/sessions/${sessionId}/feedback-document`, { cache: "no-store" });
    return response.status;
  }, seededFeedbackSessionId);
  expect(feedbackDocumentStatus).toBe(401);
});

test("pending Google user exposes pending approval API state", async ({ page }) => {
  await loginWithGoogleFixture(page, pendingEmail);
  await page.goto("/");

  const authMe = await page.evaluate(async () => {
    const response = await fetch("/api/bff/api/auth/me");
    return {
      status: response.status,
      body: await response.json(),
    };
  });

  expect(authMe.status).toBe(200);
  expect(authMe.body.approvalState).toBe("PENDING_APPROVAL");

  const pendingApp = await page.evaluate(async () => {
    const response = await fetch("/api/bff/api/app/pending");
    return {
      status: response.status,
      body: await response.json(),
    };
  });

  expect(pendingApp.status).toBe(200);
  expect(pendingApp.body.approvalState).toBe("PENDING_APPROVAL");
});

test("new google user waits for host approval and cannot access restricted flows", async ({ page }) => {
  await loginWithGoogleFixture(page, pendingEmail);
  await page.goto("/app");

  await expect(page).toHaveURL(/\/app\/pending/);
  await expect(page.getByText("가입 승인 대기")).toBeVisible();
  await expect(page.getByRole("heading", { name: /호스트 승인/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /PDF로 저장/ })).toHaveCount(0);

  await page.goto("/app/host");
  await expect(page).toHaveURL(/\/app\/pending/);

  await page.goto("/app/host/sessions/new");
  await expect(page).toHaveURL(/\/app\/pending/);

  const currentAuth = await page.evaluate(async () => {
    const response = await fetch("/api/bff/api/auth/me", { cache: "no-store" });
    return response.json() as Promise<{ approvalState: string }>;
  });
  expect(currentAuth.approvalState).toBe("PENDING_APPROVAL");

  const pendingAppStatus = await page.evaluate(async () => {
    const response = await fetch("/api/bff/api/app/pending", { cache: "no-store" });
    return response.status;
  });
  expect(pendingAppStatus).toBe(200);

  const hostDashboardStatus = await page.evaluate(async () => {
    const response = await fetch("/api/bff/api/host/dashboard", { cache: "no-store" });
    return response.status;
  });
  expect(hostDashboardStatus).toBe(403);

  const rsvpStatus = await page.evaluate(async () => {
    const response = await fetch("/api/bff/api/sessions/current/rsvp", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "GOING" }),
    });
    return response.status;
  });
  expect(rsvpStatus).toBe(403);

  const feedbackDocumentStatus = await page.evaluate(async (sessionId) => {
    const response = await fetch(`/api/bff/api/sessions/${sessionId}/feedback-document`, { cache: "no-store" });
    return response.status;
  }, seededFeedbackSessionId);
  expect(feedbackDocumentStatus).toBe(403);

  await installPrintSpy(page);
  await page.goto(`/app/feedback/${seededFeedbackSessionId}/print`);
  await expect(page).toHaveURL(/\/app\/pending/);
  await expect(page.getByRole("heading", { name: /호스트 승인/ })).toBeVisible();
  await expect.poll(() => readPrintCallCount(page)).toBe(0);
});
