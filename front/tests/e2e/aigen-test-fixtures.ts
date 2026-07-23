import type { Page, Route } from "@playwright/test";
import type { AiGenerationJobResponse, SessionImportV1 } from "@/features/host/aigen/api/aigen-contracts";
import type { HostSessionDetailResponse } from "@/features/host/api/host-contracts";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";

export function trackNotificationMutationRequests(page: Page) {
  const requests: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (
      request.method() !== "GET"
      && (
        path.endsWith("/api/host/notifications/manual")
        || path.endsWith("/api/host/notifications/manual/preview")
        || path.includes("/host-action-notification")
      )
    ) {
      requests.push(`${request.method()} ${path}`);
    }
  });
  return () => [...requests];
}

export function hostAuthResponse(clubSlug: string): AuthMeResponse {
  return {
    authenticated: true,
    userId: "user-host-e2e",
    membershipId: "m-1",
    clubId: "club-a-id",
    email: "host@example.com",
    displayName: "E2E 호스트",
    accountName: "E2E 호스트",
    role: "HOST",
    membershipStatus: "ACTIVE",
    approvalState: "ACTIVE",
    currentMembership: {
      membershipId: "m-1",
      clubId: "club-a-id",
      clubSlug,
      displayName: "E2E 호스트",
      role: "HOST",
      membershipStatus: "ACTIVE",
      approvalState: "ACTIVE",
    },
    joinedClubs: [
      {
        clubId: "club-a-id",
        clubSlug,
        clubName: "E2E 클럽",
        membershipId: "m-1",
        role: "HOST",
        status: "ACTIVE",
        primaryHost: null,
      },
    ],
    recommendedAppEntryUrl: `/clubs/${encodeURIComponent(clubSlug)}/app`,
  };
}

export async function fulfillHostAuth(route: Route, clubSlug: string): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(hostAuthResponse(clubSlug)),
  });
}

export function isHostSessionDetailRequest(route: Route, sessionId: string): boolean {
  return new URL(route.request().url()).pathname ===
    `/api/bff/api/host/sessions/${encodeURIComponent(sessionId)}`;
}

export async function routeHostEditorShell(page: Page, clubSlug: string): Promise<void> {
  await page.route("**/api/bff/api/auth/me**", async (route) => {
    await fulfillHostAuth(route, clubSlug);
  });

  await page.route("**/api/bff/api/sessions/current**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ currentSession: null }),
    });
  });

  await page.route("**/api/bff/api/host/notifications/manual/dispatches**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], nextCursor: null }),
    });
  });

  await page.route("**/api/bff/api/host/sessions/*/ai-generate/jobs/recent**", async (route) => {
    await route.fulfill({ status: 204 });
  });

  await page.route("**/api/bff/api/host/sessions/*/ai-generate/models**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        models: [{ id: "claude-sonnet-4-6", provider: "CLAUDE", isDefault: true }],
      }),
    });
  });

  await page.route("**/api/bff/api/host/capabilities**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sessionRecordDrafts: true,
        hostActionNotificationConfirmationRequired: true,
      }),
    });
  });

  await page.route("**/api/bff/api/host/sessions/*/record-editor**", async (route) => {
    const pathSegments = new URL(route.request().url()).pathname.split("/");
    const recordEditorIndex = pathSegments.lastIndexOf("record-editor");
    const sessionId = pathSegments[recordEditorIndex - 1] ?? "session-e2e";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sessionId,
        liveRevision: 0,
        liveSnapshot: {
          schema: "readmates-session-record:v1",
          visibility: "HOST_ONLY",
          publicationSummary: "",
          highlights: [],
          oneLineReviews: [],
          feedbackDocument: { fileName: "", title: "", markdown: "" },
        },
        draft: null,
        draftLiveBaseStale: false,
        validationSummary: { valid: true, issues: [] },
      }),
    });
  });

  await page.route("**/api/bff/api/host/sessions/*/history**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], nextCursor: null }),
    });
  });
}

export function groundedTranscript(
  turns: Array<{ speaker: string; at: string; text: string }>,
): string {
  return [
    "공개 테스트 독서모임",
    "2026. 7. 14. 오후 7:30 · 42분 10초",
    [...new Set(turns.map((turn) => turn.speaker))].join(", "),
    "",
    ...turns.flatMap((turn) => [
      `${turn.speaker} ${turn.at}`,
      turn.text,
      "",
    ]),
  ].join("\n");
}

export function groundedSnapshot(summary = "공개 합성 요약입니다."): SessionImportV1 {
  return {
    format: "readmates.session.v1",
    sessionNumber: 7,
    bookTitle: "공개 테스트 책",
    meetingDate: "2026-07-14",
    summary,
    highlights: [{ authorName: "공개 회원 A", text: "공개 합성 하이라이트입니다." }],
    oneLineReviews: [{ authorName: "공개 회원 B", text: "공개 합성 한줄평입니다." }],
    feedbackDocumentFileName: "session-7-feedback.md",
    feedbackDocumentMarkdown: "# 공개 합성 피드백\n\n안전한 테스트 내용입니다.",
  };
}

export function groundedSucceededJob(jobId: string, revision = 1): AiGenerationJobResponse {
  const target = (section: "SUMMARY" | "HIGHLIGHTS" | "ONE_LINE_REVIEWS" | "FEEDBACK_DOCUMENT") => ({
    section,
    targetId: `r${revision}:${section}:0`,
    ordinal: 0,
    turnId: section === "ONE_LINE_REVIEWS" ? "turn-2" : "turn-1",
    startSeconds: section === "ONE_LINE_REVIEWS" ? 45 : 0,
    speakerName: section === "ONE_LINE_REVIEWS" ? "공개 회원 B" : "공개 회원 A",
    excerpt: "공개 합성 근거 발언입니다.",
    truncated: section === "SUMMARY",
  });
  return {
    jobId,
    status: "SUCCEEDED",
    stage: "READY",
    progressPct: 100,
    model: "claude-sonnet-4-6",
    result: groundedSnapshot(),
    error: null,
    tokens: { input: 1000, cachedInput: 0, output: 500 },
    costEstimateUsd: "0.12",
    warnings: [],
    revision,
    groundingStatus: "VALID",
    evidence: [target("SUMMARY"), target("HIGHLIGHTS"), target("ONE_LINE_REVIEWS"), target("FEEDBACK_DOCUMENT")],
    sectionReviewStatuses: {
      SUMMARY: "PENDING_REVIEW",
      HIGHLIGHTS: "PENDING_REVIEW",
      ONE_LINE_REVIEWS: "PENDING_REVIEW",
      FEEDBACK_DOCUMENT: "PENDING_REVIEW",
    },
  };
}

export function hostSessionDetailResponse(sessionId: string): HostSessionDetailResponse {
  return {
    sessionId,
    sessionNumber: 7,
    title: "E2E 세션",
    bookTitle: "E2E 책",
    bookAuthor: "E2E 저자",
    bookLink: null,
    bookImageUrl: null,
    locationLabel: "온라인",
    meetingUrl: null,
    meetingPasscode: null,
    date: "2026-05-16",
    startTime: "20:00",
    endTime: "22:00",
    questionDeadlineAt: "2026-05-15T12:00:00Z",
    visibility: "HOST_ONLY",
    publication: null,
    state: "OPEN",
    attendees: [],
    feedbackDocument: {
      uploaded: false,
      fileName: null,
      uploadedAt: null,
    },
  };
}
