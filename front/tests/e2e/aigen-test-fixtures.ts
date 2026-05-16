import type { Page, Route } from "@playwright/test";
import type { HostSessionDetailResponse } from "@/features/host/api/host-contracts";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";

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
