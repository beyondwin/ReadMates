import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  clubReminderPolicy,
  createOpenSessionFixture,
  loginWithGoogleFixture,
  manualDispatchCount,
  notificationEventCount,
  resetE2eState,
} from "./readmates-e2e-db";
import {
  createHostRolloutEvidence,
  type HostRolloutObservation,
  writeHostRolloutEvidence,
} from "./support/host-rollout-evidence";

test.describe.configure({ mode: "serial" });

const CLUB_ID = "00000000-0000-0000-0000-000000000001";
const CLUB_SLUG = "reading-sai";
const observations: HostRolloutObservation[] = [];

function observe(observation: HostRolloutObservation) {
  if (!observations.some(({ caseId }) => caseId === observation.caseId)) {
    observations.push(observation);
  }
}

function resetRolloutState() {
  resetE2eState({
    cleanupGeneratedSessions: true,
    cleanupManualNotifications: true,
    cleanupNotificationPolicy: true,
    googleLoginEmails: ["host@example.com", "member1@example.com"],
  });
}

async function hostJson(
  page: Page,
  path: string,
  method: "POST" | "PUT",
  body?: unknown,
) {
  return page.evaluate(async ({ requestPath, requestMethod, requestBody }) => {
    const response = await fetch(requestPath, {
      method: requestMethod,
      headers: {
        "Content-Type": "application/json",
        "X-Readmates-Client-Contract": "v3",
      },
      body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
    });
    const text = await response.text();
    return {
      status: response.status,
      body: text ? JSON.parse(text) : null,
    };
  }, { requestPath: path, requestMethod: method, requestBody: body });
}

test.beforeEach(resetRolloutState);
test.afterEach(resetRolloutState);

test.afterAll(() => {
  if (observations.length === 0) return;
  writeHostRolloutEvidence(
    resolve("output/host-rollout/local/compatibility.observation.json"),
    createHostRolloutEvidence(observations),
  );
});

test("V2_V3 capability is public-safe and host reads remain available", async ({ page, request }) => {
  const capability = await request.get("/api/bff/__internal/client-contract-status");
  expect(capability.status()).toBe(200);
  expect(capability.headers()["cache-control"]).toBe("no-store");
  expect(await capability.json()).toEqual({
    schemaVersion: 1,
    supportedHostClientContracts: ["v2", "v3"],
  });
  observe({
    caseId: "capability-probe-no-store",
    layer: "bff",
    generation: "v3",
    status: capability.status(),
  });

  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto(`/clubs/${CLUB_SLUG}/app/host`);
  const readStatus = await page.evaluate(async (clubSlug) => {
    const response = await fetch(
      `/api/bff/api/host/sessions?clubSlug=${encodeURIComponent(clubSlug)}`,
      { cache: "no-store" },
    );
    return response.status;
  }, CLUB_SLUG);
  expect(readStatus).toBe(200);
  observe({
    caseId: "reads-unaffected",
    layer: "backend",
    generation: "missing",
    status: readStatus,
  });
});

test("reachable v3 support stack preserves notification policy preview confirm and dispatch semantics", async ({ page }) => {
  const sessionId = createOpenSessionFixture();
  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto(`/clubs/${CLUB_SLUG}/app/host/notifications?sessionId=${sessionId}`);

  const policyRequest = page.waitForRequest((request) =>
    request.method() === "PUT" && request.url().includes("/host/notifications/policy"),
  );
  const policyResponse = page.waitForResponse((response) =>
    response.request().method() === "PUT" && response.url().includes("/host/notifications/policy"),
  );
  await page.getByRole("switch", { name: "모임 전날 자동 리마인더" }).click();
  const policyWrite = await policyRequest;
  const policyResult = await policyResponse;
  expect(policyWrite.headers()["x-readmates-client-contract"]).toBe("v3");
  expect(policyWrite.postDataJSON()).toEqual({ sessionReminderEnabled: true });
  expect(policyResult.status(), await policyResult.text()).toBe(200);
  expect(clubReminderPolicy(CLUB_ID)).toBe(true);
  observe({ caseId: "notification-policy", layer: "browser", generation: "v3", status: 200 });

  const options = await page.evaluate(async ({ clubSlug, id }) => {
    const response = await fetch(
      `/api/bff/api/host/notifications/manual/options?clubSlug=${encodeURIComponent(clubSlug)}&sessionId=${encodeURIComponent(id)}`,
      { cache: "no-store" },
    );
    if (!response.ok) throw new Error(`manual options failed: ${response.status}`);
    return response.json() as Promise<{
      templates: Array<{ eventType: string; contentRevision: string }>;
    }>;
  }, { clubSlug: CLUB_SLUG, id: sessionId });
  const reminder = options.templates.find(({ eventType }) => eventType === "SESSION_REMINDER_DUE");
  expect(reminder?.contentRevision).toMatch(/^[0-9a-f]{64}$/);
  const selection = {
    sessionId,
    eventType: "SESSION_REMINDER_DUE",
    contentRevision: reminder!.contentRevision,
    audience: "ALL_ACTIVE_MEMBERS",
    requestedChannels: "BOTH",
    selectedMembershipIds: [],
    excludedMembershipIds: [],
    includedMembershipIds: [],
    sendMode: "NOW",
  };

  const previewRequest = page.waitForRequest((request) =>
    request.method() === "POST" && request.url().includes("/host/notifications/manual/preview"),
  );
  const preview = await hostJson(
    page,
    `/api/bff/api/host/notifications/manual/preview?clubSlug=${CLUB_SLUG}`,
    "POST",
    selection,
  );
  const previewWrite = await previewRequest;
  expect(previewWrite.headers()["x-readmates-client-contract"]).toBe("v3");
  expect(previewWrite.postDataJSON()).toEqual(selection);
  expect(preview.status).toBe(200);
  expect(preview.body).toMatchObject({
    previewId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
    template: { eventType: selection.eventType },
    audience: { baseGroup: selection.audience },
    channels: { requested: selection.requestedChannels },
  });
  expect(manualDispatchCount(sessionId, selection.eventType)).toBe(0);
  expect(notificationEventCount(sessionId, selection.eventType)).toBe(0);
  observe({ caseId: "notification-preview", layer: "backend", generation: "v3", status: 200 });

  const confirmBody = {
    ...selection,
    previewId: preview.body.previewId,
    resendConfirmed: false,
  };
  const confirmRequest = page.waitForRequest((request) =>
    request.method() === "POST"
      && request.url().includes("/host/notifications/manual")
      && !request.url().includes("/preview"),
  );
  const confirm = await hostJson(
    page,
    `/api/bff/api/host/notifications/manual?clubSlug=${CLUB_SLUG}`,
    "POST",
    confirmBody,
  );
  const confirmWrite = await confirmRequest;
  expect(confirmWrite.headers()["x-readmates-client-contract"]).toBe("v3");
  expect(confirmWrite.postDataJSON()).toEqual(confirmBody);
  expect(confirm.status).toBe(200);
  expect(confirm.body).toMatchObject({
    status: expect.any(String),
    summary: { requestedChannels: selection.requestedChannels },
  });
  expect(manualDispatchCount(sessionId, selection.eventType)).toBe(1);
  expect(notificationEventCount(sessionId, selection.eventType)).toBe(1);
  observe({ caseId: "notification-confirm", layer: "backend", generation: "v3", status: 200 });

  const dispatch = await hostJson(
    page,
    `/api/bff/api/host/notifications/process?clubSlug=${CLUB_SLUG}`,
    "POST",
  );
  expect(dispatch.status).toBe(200);
  expect(dispatch.body).toEqual({ processed: expect.any(Number) });
  observe({ caseId: "notification-dispatch", layer: "backend", generation: "v3", status: 200 });
  observe({
    caseId: "browser-v3-bff-v2v3-backend-support",
    layer: "browser",
    generation: "v3",
    status: 200,
  });
});
