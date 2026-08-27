import { expect, test, type Page, type Route } from "@playwright/test";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import type { PlatformAdminRole } from "@/features/platform-admin/api/platform-admin-contracts";
import { routeEmptyAdminOperations } from "./admin-operations-e2e-fixtures";
import {
  VISUAL_AUTHORITY_VIEWPORTS,
  expectNoHorizontalOverflow,
} from "./support/visual-authority-contract";

const CLUB_ID = "club-1";

function platformAdminAuth(role: PlatformAdminRole): AuthMeResponse {
  const email = `${role.toLowerCase()}@example.test`;
  return {
    authenticated: true,
    userId: `platform-${role.toLowerCase()}-user`,
    membershipId: null,
    clubId: null,
    email,
    displayName: `${role} admin`,
    accountName: `${role} admin`,
    role: null,
    membershipStatus: null,
    approvalState: "INACTIVE",
    currentMembership: null,
    joinedClubs: [],
    platformAdmin: {
      userId: `platform-${role.toLowerCase()}-user`,
      email,
      role,
    },
    recommendedAppEntryUrl: "/admin",
  };
}

async function json(
  route: Route,
  status: number,
  body: unknown,
): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function routePlatformAdminShell(page: Page): Promise<void> {
  await routeEmptyAdminOperations(page);
  await page.route("**/api/bff/api/auth/me**", async (route) => {
    await json(route, 200, platformAdminAuth("OWNER"));
  });
  await page.route("**/api/bff/api/admin/summary", async (route) => {
    await json(route, 200, {
      platformRole: "OWNER",
      activeClubCount: 1,
      domainActionRequiredCount: 0,
      domains: [],
      domainsRequiringAction: [],
    });
  });
  await page.route("**/api/bff/api/admin/capabilities**", async (route) => {
    await json(route, 200, {
      schemaVersion: 1,
      role: "OWNER",
      status: "ACTIVE",
      capabilities: [
        "VIEW_TODAY",
        "VIEW_CLUBS",
        "VIEW_CLUB_OPERATIONS",
        "VIEW_SUPPORT",
        "MANAGE_CLUBS",
        "MANAGE_CLUB_DOMAINS",
      ],
      generatedAt: "2026-08-24T00:00:00Z",
    });
  });
  await page.route(`**/api/bff/api/admin/clubs/${CLUB_ID}`, async (route) => {
    await json(route, 200, {
      clubId: CLUB_ID,
      slug: "reading-sai",
      name: "읽는사이",
      tagline: "함께 읽는 클럽",
      about: "공개 소개",
      status: "ACTIVE",
      publicVisibility: "PUBLIC",
      domainCount: 1,
      domainActionRequiredCount: 0,
      notificationFailureCount: 0,
      aiFailureCount: 0,
      firstHostOnboardingState: "ASSIGNED",
      adminRevision: 11,
      domains: [
        {
          id: "domain-1",
          clubId: CLUB_ID,
          hostname: "reading-sai.example.test",
          kind: "CUSTOM_DOMAIN",
          status: "ACTIVE",
          desiredState: "ENABLED",
          manualAction: "NONE",
          errorCode: null,
          isPrimary: true,
          verifiedAt: null,
          lastCheckedAt: null,
        },
      ],
    });
  });
  await page.route(
    `**/api/bff/api/admin/clubs/${CLUB_ID}/metadata`,
    async (route) => {
      await json(route, 409, {
        code: "REVISION_CONFLICT",
        message: "Revision conflict",
        status: 409,
      });
    },
  );
  await page.route(
    `**/api/bff/api/admin/support/grants?clubId=${CLUB_ID}&status=ACTIVE`,
    async (route) => {
      await json(route, 200, { items: [{ grantId: "grant-1" }], nextCursor: null });
    },
  );
  await page.route(
    `**/api/bff/api/admin/clubs/${CLUB_ID}/operations`,
    async (route) => {
      await json(route, 200, {
        schema: "admin.club_operations_snapshot.v1",
        generatedAt: "2026-05-27T00:00:00Z",
        club: {
          clubId: CLUB_ID,
          slug: "reading-sai",
          name: "읽는사이",
          status: "ACTIVE",
          publicVisibility: "PUBLIC",
        },
        readiness: { state: "READY", blockingReasons: [], nextAction: null },
        memberActivity: {
          activeCount: 8,
          dormantCount: 1,
          pendingViewerCount: 2,
          hostCount: 1,
        },
        sessionProgress: {
          upcomingCount: 2,
          currentOpenCount: 1,
          closedCount: 5,
          publishedRecordCount: 4,
          incompleteRecordCount: 1,
        },
        notificationHealth: {
          pending: 1,
          failed: 1,
          dead: 0,
          lastSuccessAt: null,
          failureClusters: [],
          recentFailed7d: 4,
          priorFailed7d: 1,
        },
        aiUsage: {
          activeJobs: 0,
          failedRecentJobs: 1,
          staleCandidates: 0,
          costEstimateUsd: "0.1200",
          state: "HAS_ACTIVITY",
          priorFailedJobs7d: 0,
        },
        closingRisks: {
          incompleteCount: 2,
          blockedCount: 1,
          readyCount: 1,
          items: [
            {
              sessionId: "session-7",
              sessionNumber: 7,
              bookTitle: "페인트",
              meetingDate: "2026-06-18",
              overallState: "BLOCKED",
              primaryBlocker: "FEEDBACK_DOCUMENT_INVALID",
              hostClosingHref:
                "/clubs/reading-sai/app/host/sessions/session-7/closing",
            },
            {
              sessionId:
                "RAW_MEMBER_EMAIL_SENTINEL PRIVATE_DOMAIN_SENTINEL RAW_JSON_SENTINEL ADMIN_ROUTE_SENTINEL",
              sessionNumber: 8,
              bookTitle: "긴긴밤",
              meetingDate: "2026-06-25",
              overallState: "RAW_JSON_SENTINEL",
              primaryBlocker:
                "RAW_MEMBER_EMAIL_SENTINEL PRIVATE_DOMAIN_SENTINEL ADMIN_ROUTE_SENTINEL",
              hostClosingHref:
                "/clubs/reading-sai/app/host/sessions/session-8/closing",
            },
          ],
        },
        safeLinks: [
          {
            label: "Host app",
            href: "/clubs/reading-sai/app",
            kind: "HOST_ROUTE",
          },
          {
            label: "알림 운영",
            href: `/admin/notifications?clubId=${CLUB_ID}`,
            kind: "ADMIN_ROUTE",
          },
        ],
      });
    },
  );
}

test("owner views aggregate club operations without host-owned commands", async ({
  page,
}) => {
  await routePlatformAdminShell(page);

  await page.goto(`/admin/clubs/${CLUB_ID}`);

  await expect(
    page.getByRole("heading", { name: "읽는사이", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "읽는사이 운영 스냅샷" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "클로징 확인 필요" }),
  ).toBeVisible();
  await expect(page.getByText("미완료 2 · 차단 1 · 준비 1")).toBeVisible();
  await expect(page.getByText("No.07 · 페인트")).toBeVisible();
  await expect(page.getByText("2026-06-18")).toBeVisible();
  await expect(page.getByText("피드백 문서 확인 필요")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "호스트 클로징 보드" }).first(),
  ).toHaveAttribute(
    "href",
    "/clubs/reading-sai/app/host/sessions/session-7/closing",
  );
  await expect(page.getByText("지원 grant")).toBeVisible();
  await expect(page.getByRole("link", { name: "알림 ledger" })).toHaveAttribute(
    "href",
    `/admin/notifications?clubId=${CLUB_ID}`,
  );
  await expect(page.getByText("알림 실패 (7일)")).toBeVisible();
  await expect(page.getByText(/지난 7일 대비/).first()).toBeVisible();
  await expect(
    page.getByText(
      /RAW_MEMBER_EMAIL_SENTINEL|PRIVATE_DOMAIN_SENTINEL|RAW_JSON_SENTINEL|ADMIN_ROUTE_SENTINEL/,
    ),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: /RSVP|참석 응답|출석|세션 편집|모임 편집|발행|세션 종료|모임 종료|알림 발송/,
    }),
  ).toHaveCount(0);
});

test("owner views club operations closing risks without mobile horizontal overflow", async ({
  page,
}) => {
  await routePlatformAdminShell(page);
  await page.setViewportSize(VISUAL_AUTHORITY_VIEWPORTS.mobile);

  await page.goto(`/admin/clubs/${CLUB_ID}`);
  await expect(
    page.getByRole("heading", { name: "클로징 확인 필요" }),
  ).toBeVisible();
  await expect(page.getByText("No.07 · 페인트")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("revision conflict keeps the operator on detail and offers authoritative refresh", async ({
  page,
}) => {
  await routePlatformAdminShell(page);
  await page.goto(`/admin/clubs/${CLUB_ID}`);
  await page.getByRole("button", { name: "편집" }).click();
  await page.getByRole("button", { name: "공개 정보 저장" }).click();
  await expect(page.getByRole("alert")).toContainText("최신 상태");
  await page.getByRole("button", { name: "최신 상태 불러오기" }).click();
  await expect(page).toHaveURL(`/admin/clubs/${CLUB_ID}`);
  await expect(
    page.getByRole("heading", { name: "읽는사이", exact: true }),
  ).toBeVisible();
});

test("rejects a different primary area as club detail return state", async ({
  page,
}) => {
  await routePlatformAdminShell(page);
  await page.goto(
    `/admin/clubs/${CLUB_ID}?returnTo=${encodeURIComponent("/admin/today")}&focusId=${CLUB_ID}`,
  );
  await expect(
    page.getByRole("link", { name: "← 클럽 목록" }),
  ).toHaveAttribute("href", "/admin/clubs");
});
