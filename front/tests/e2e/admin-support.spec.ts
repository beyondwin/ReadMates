import { expect, test, type Page, type Route } from "@playwright/test";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { routeEmptyAdminOperations } from "./admin-operations-e2e-fixtures";
import { expectNoHorizontalOverflow } from "./support/visual-authority-contract";

const CLUB_ID = "club-1";
const SUBJECT_ID = "support-1";

function platformAdminAuth(): AuthMeResponse {
  return {
    authenticated: true,
    userId: "owner-1",
    membershipId: null,
    clubId: null,
    email: "owner@example.com",
    displayName: "Owner admin",
    accountName: "Owner admin",
    role: null,
    membershipStatus: null,
    approvalState: "INACTIVE",
    currentMembership: null,
    joinedClubs: [],
    platformAdmin: { userId: "owner-1", email: "owner@example.com", role: "OWNER" },
    recommendedAppEntryUrl: "/admin",
  };
}

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function routeSupport(page: Page): Promise<void> {
  await routeEmptyAdminOperations(page);
  await page.route("**/api/bff/api/auth/me**", async (route) => json(route, 200, platformAdminAuth()));
  await page.route("**/api/bff/api/admin/summary", async (route) => json(route, 200, {
    platformRole: "OWNER",
    activeClubCount: 1,
    domainActionRequiredCount: 0,
    domains: [],
    domainsRequiringAction: [],
  }));
  await page.route("**/api/bff/api/admin/capabilities", async (route) => json(route, 200, {
    schemaVersion: 1,
    role: "OWNER",
    status: "ACTIVE",
    capabilities: ["VIEW_SUPPORT", "MANAGE_SUPPORT_ACCESS"],
    generatedAt: "2026-08-25T10:00:00Z",
  }));
  await page.route("**/api/bff/api/admin/clubs", async (route) => json(route, 200, {
    items: [{
      clubId: CLUB_ID,
      slug: "reading-sai",
      name: "읽는사이",
      tagline: "",
      about: "",
      status: "ACTIVE",
      publicVisibility: "PUBLIC",
      domainCount: 0,
      domainActionRequiredCount: 0,
      notificationFailureCount: 0,
      aiFailureCount: 0,
      firstHostOnboardingState: "ASSIGNED",
      adminRevision: 1,
    }],
    nextCursor: null,
  }));
  await page.route("**/api/bff/api/admin/support/search**", async (route) => json(route, 200, [{
    subjectId: SUBJECT_ID,
    displayName: "지원관리자",
    maskedEmail: "a***@example.com",
    kind: "PLATFORM_ADMIN",
    platformAdminRole: "SUPPORT",
    platformAdminStatus: "ACTIVE",
    clubMembershipSummary: [],
    grantEligible: true,
    grantBlockedReason: null,
  }]));
  await page.route("**/api/bff/api/admin/support/grants/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/revoke/preview")) {
      await json(route, 200, {
        previewId: "revoke-preview-1",
        commandType: "REVOKE",
        grantId: "grant-1",
        clubId: CLUB_ID,
        scope: "HOST_SUPPORT_READ",
        grantExpiresAt: "2026-08-25T12:00:00Z",
        reasonCategory: "MEMBER_ASSISTANCE",
        notePresent: false,
        impactCodes: ["REVOKE_SUPPORT_ACCESS"],
        expiresAt: "2026-08-25T10:10:00Z",
        fingerprintPrefix: "00112233",
      });
      return;
    }
    if (path.endsWith("/revoke/confirm")) {
      await json(route, 200, receipt("REVOKE", "ACTIVE", "REVOKED"));
    }
  });
  await page.route("**/api/bff/api/admin/support/grants/preview", async (route) => json(route, 200, {
    previewId: "create-preview-1",
    commandType: "CREATE",
    grantId: null,
    clubId: CLUB_ID,
    scope: "HOST_SUPPORT_READ",
    grantExpiresAt: "2026-08-25T12:00:00Z",
    reasonCategory: "MEMBER_ASSISTANCE",
    notePresent: true,
    impactCodes: ["GRANT_SUPPORT_ACCESS"],
    expiresAt: "2026-08-25T10:10:00Z",
    fingerprintPrefix: "00112233",
  }));
  await page.route("**/api/bff/api/admin/support/grants/confirm", async (route) => json(route, 200, receipt("CREATE", "ABSENT", "ACTIVE")));
  await page.route("**/api/bff/api/admin/support/grants?**", async (route) => json(route, 200, {
    items: [{
      grantId: "grant-1",
      clubId: CLUB_ID,
      clubName: "읽는사이",
      granteeDisplayName: "지원관리자",
      granteeMaskedEmail: "a***@example.com",
      scope: "HOST_SUPPORT_READ",
      reasonCategory: "MEMBER_ASSISTANCE",
      notePresent: true,
      expiresAt: "2026-05-27T12:00:00Z",
      createdAt: "2026-05-27T10:00:00Z",
      revokedAt: null,
      status: "ACTIVE",
      createdByRole: "OWNER",
    }],
    nextCursor: null,
  }));
}

function receipt(commandType: "CREATE" | "REVOKE", beforeStatus: string, afterStatus: string) {
  return { receiptId: `${commandType.toLowerCase()}-receipt-1`, previewId: `${commandType.toLowerCase()}-preview-1`, commandType, grantId: "grant-1", clubId: CLUB_ID, scope: "HOST_SUPPORT_READ", grantExpiresAt: "2026-08-25T12:00:00Z", reasonCategory: "MEMBER_ASSISTANCE", notePresent: true, beforeStatus, afterStatus, outcome: "SUCCEEDED", createdAt: "2026-08-25T10:00:00Z" };
}

test("owner searches support subject then creates and revokes grant", async ({ page }) => {
  await routeSupport(page);

  await page.goto(`/admin/support?clubId=${CLUB_ID}`);
  await expectNoHorizontalOverflow(page);

  await page.getByPlaceholder("이름 또는 이메일").fill("admin-support@example.com");
  await page.getByRole("button", { name: "검색" }).click();
  await expect(page.getByRole("button", { name: /지원관리자/ })).toBeVisible();
  await expect(page.getByText("admin-support@example.com")).toHaveCount(0);

  await page.getByRole("button", { name: /지원관리자/ }).click();
  await page.getByRole("textbox", { name: "검토 시에만 확인하는 사유 메모 (저장되지 않음)" }).fill("ticket");
  await page.getByRole("button", { name: "발급 검토" }).click();
  await page.getByRole("button", { name: "지원 접근 발급" }).click();
  await expect(page.getByRole("region", { name: "명령 기록" })).toContainText("create-receipt-1");
  await expect(page.getByText("내부 메모")).toHaveCount(0);
  await page.getByRole("button", { name: "권한 취소 검토" }).click();
  await page.getByRole("button", { name: "취소 검토", exact: true }).click();
  await page.getByRole("button", { name: "취소 확정" }).click();
});

async function expectNoSupportPrivateSentinels(page: Page): Promise<void> {
  await expect(page.getByText("member1@example.com")).toHaveCount(0);
  await expect(page.getByText("private.example.com")).toHaveCount(0);
  await expect(page.getByText("{\"")).toHaveCount(0);
}

test("owner captures support grant risk visual evidence on desktop and mobile", async ({ page }, testInfo) => {
  await routeSupport(page);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/admin/support?clubId=${CLUB_ID}`);
  await page.getByPlaceholder("이름 또는 이메일").fill("admin-support@example.com");
  await page.getByRole("button", { name: "검색" }).click();
  await page.getByRole("button", { name: /지원관리자/ }).click();
  await expect(page.getByRole("heading", { name: "지원 접근 권한 발급" })).toBeVisible();
  await expectNoSupportPrivateSentinels(page);
  const desktopScreenshot = await page.screenshot({
    path: testInfo.outputPath("admin-support-desktop.png"),
    fullPage: true,
  });
  expect(desktopScreenshot.byteLength).toBeGreaterThan(10_000);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/admin/support?clubId=${CLUB_ID}`);
  await page.getByPlaceholder("이름 또는 이메일").fill("admin-support@example.com");
  await page.getByRole("button", { name: "검색" }).click();
  await page.getByRole("button", { name: /지원관리자/ }).click();
  await expect(page.getByRole("heading", { name: "지원 접근 권한 발급" })).toBeVisible();
  await expectNoSupportPrivateSentinels(page);
  const mobileScreenshot = await page.screenshot({
    path: testInfo.outputPath("admin-support-mobile.png"),
    fullPage: true,
  });
  expect(mobileScreenshot.byteLength).toBeGreaterThan(10_000);
});
