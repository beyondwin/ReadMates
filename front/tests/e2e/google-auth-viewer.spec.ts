import { expect, test } from "@playwright/test";
import {
  cleanupViewerGoogleUserFixtures,
  cleanupGeneratedSessions,
  createOpenSessionFixture,
  loginWithGoogleFixture,
} from "./readmates-e2e-db";

const seededFeedbackSessionId = "00000000-0000-0000-0000-000000000301";
const viewerEmails: string[] = [];

function uniqueViewerEmail(label: string) {
  return `e2e.viewer.${label}.${Date.now()}@example.com`;
}

test.beforeEach(() => {
  viewerEmails.length = 0;
  cleanupGeneratedSessions();
  createOpenSessionFixture();
});

test.afterEach(() => {
  if (viewerEmails.length > 0) {
    cleanupViewerGoogleUserFixtures(viewerEmails);
  }
  cleanupGeneratedSessions();
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

test("uninvited Google user exposes viewer API state", async ({ page }) => {
  const viewerEmail = uniqueViewerEmail("api");
  viewerEmails.push(viewerEmail);

  await loginWithGoogleFixture(page, viewerEmail);
  await page.goto("/");

  const authMe = await page.evaluate(async () => {
    const response = await fetch("/api/bff/api/auth/me");
    return {
      status: response.status,
      body: await response.json(),
    };
  });

  expect(authMe.status).toBe(200);
  expect(authMe.body.membershipStatus).toBe("VIEWER");
  expect(authMe.body.approvalState).toBe("VIEWER");

  const viewerApp = await page.evaluate(async () => {
    const response = await fetch("/api/bff/api/app/viewer");
    return {
      status: response.status,
      body: await response.json(),
    };
  });

  expect(viewerApp.status).toBe(200);
  expect(viewerApp.body.approvalState).toBe("VIEWER");
});

test("uninvited google login becomes read-only viewer who can browse sessions", async ({ page }) => {
  const viewerEmail = uniqueViewerEmail("browse");
  viewerEmails.push(viewerEmail);

  await loginWithGoogleFixture(page, viewerEmail);
  await page.goto("/app");

  await expect(page).toHaveURL(/\/app\/?$/);
  await expect(page.getByText("둘러보기 멤버").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /PDF로 저장/ })).toHaveCount(0);

  await page.goto("/app/host");
  await expect(page).toHaveURL(/\/app\/?$/);

  await page.goto("/app/host/sessions/new");
  await expect(page).toHaveURL(/\/app\/?$/);

  const currentAuth = await page.evaluate(async () => {
    const response = await fetch("/api/bff/api/auth/me", { cache: "no-store" });
    return response.json() as Promise<{ approvalState: string }>;
  });
  expect(currentAuth.approvalState).toBe("VIEWER");

  const viewerAppStatus = await page.evaluate(async () => {
    const response = await fetch("/api/bff/api/app/viewer", { cache: "no-store" });
    return response.status;
  });
  expect(viewerAppStatus).toBe(200);

  await page.goto("/app/archive");
  await expect(page.getByRole("heading", { name: "기록 저장소" })).toBeVisible();
  await expect(page.getByText("No.06").first()).toBeVisible();

  await page.goto("/app/session/current");
  await expect(page.getByText("정식 멤버가 되면 RSVP와 질문 작성이 열립니다.").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "참석" })).toHaveCount(0);

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

  await page.goto(`/app/feedback/${seededFeedbackSessionId}`);
  await expect(page.getByRole("heading", { name: "피드백 문서는 정식 멤버와 참석자에게만 열립니다." })).toBeVisible();
});
