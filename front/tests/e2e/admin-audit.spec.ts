import { expect, test, type Page, type Route } from "@playwright/test";
import type { PlatformAdminRole } from "@/features/platform-admin/api/platform-admin-contracts";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { routeEmptyAdminOperations } from "./admin-operations-e2e-fixtures";
import {
  VISUAL_AUTHORITY_VIEWPORTS,
  expectMinimumTargetSize,
  expectNoHorizontalOverflow,
} from "./support/visual-authority-contract";

function platformAdminAuth(role: PlatformAdminRole): AuthMeResponse {
  const email = `${role.toLowerCase()}@example.com`;
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
    platformAdmin: { userId: `platform-${role.toLowerCase()}-user`, email, role },
    recommendedAppEntryUrl: "/admin",
  };
}

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function routePlatformAdminShell(page: Page, role: PlatformAdminRole): Promise<void> {
  await routeEmptyAdminOperations(page);
  await page.route("**/api/bff/api/auth/me**", async (route) => {
    await json(route, 200, platformAdminAuth(role));
  });
  await page.route("**/api/bff/api/admin/summary", async (route) => {
    await json(route, 200, {
      platformRole: role,
      activeClubCount: 1,
      domainActionRequiredCount: 0,
      domains: [],
      domainsRequiringAction: [],
    });
  });
  await page.route("**/api/bff/api/admin/capabilities", async (route) => {
    await json(route, 200, {
      schemaVersion: 1,
      role,
      status: "ACTIVE",
      capabilities: ["VIEW_AUDIT", "VIEW_SENSITIVE_AUDIT"],
      generatedAt: "2026-08-25T00:00:00Z",
    });
  });
  await page.route("**/api/bff/api/admin/clubs", async (route) => {
    await json(route, 200, { items: [] });
  });
}

async function routeAudit(page: Page): Promise<void> {
  await page.route("**/api/bff/api/admin/audit/events**", async (route) => {
    await json(route, 200, {
      generatedAt: "2026-05-27T00:00:00Z",
      filters: { range: "7d" },
      summary: { visibleCount: 2, sourceUnavailableCount: 0, metadataUnavailableCount: 0, unavailableSources: [] },
      nextCursor: null,
      items: [
        {
          id: "platform_audit_events:event-1",
          occurredAt: "2026-05-27T00:01:00Z",
          sourceSlice: "S5",
          sourceTable: "platform_audit_events",
          actionCategory: "NOTIFICATION",
          actionType: "ADMIN_NOTIFICATION_REPLAY_CONFIRMED",
          outcome: "SUCCESS",
          actor: { userId: "platform-owner-user", role: "OWNER", displayLabel: "OWNER" },
          target: { clubId: "club-1", userId: null, jobId: null, eventId: "preview-1", label: "Replay preview" },
          summary: "알림 재처리가 확정되었습니다.",
          safeMetadata: [{ label: "selectionHashPrefix", value: "aaaaaaaa", kind: "fingerprint" }],
          metadataState: "AVAILABLE",
        },
        {
          id: "platform_audit_events:event-2",
          occurredAt: "2026-05-27T00:00:00Z",
          sourceSlice: "S4",
          sourceTable: "platform_audit_events",
          actionCategory: "SUPPORT",
          actionType: "SUPPORT_ACCESS_GRANT_CREATED",
          outcome: "FAILED",
          actor: { userId: "platform-owner-user", role: "OWNER", displayLabel: "OWNER" },
          target: { clubId: "club-1", userId: null, jobId: null, eventId: null, label: "사용자 숨김" },
          summary: "support grant가 생성되었습니다.",
          safeMetadata: [{ label: "scope", value: "METADATA_READ", kind: "code" }],
          metadataState: "AVAILABLE",
        },
      ],
    });
  });
}

async function routeSensitiveAudit(page: Page, onBody: (body: unknown) => void): Promise<void> {
  await page.route("**/api/bff/api/admin/audit/events/search", async (route) => {
    onBody(route.request().postDataJSON());
    await json(route, 200, {
      generatedAt: "2026-05-27T00:00:00Z",
      filters: { from: "2026-05-20T00:00:00Z", to: "2026-05-27T00:00:00Z" },
      summary: { visibleCount: 1, sourceUnavailableCount: 0, metadataUnavailableCount: 0, unavailableSources: [] },
      nextCursor: null,
      items: [{
        id: "platform_audit_events:search-1",
        occurredAt: "2026-05-27T00:01:00Z",
        sourceSlice: "S4",
        sourceTable: "platform_audit_events",
        actionCategory: "SUPPORT",
        actionType: "SUPPORT_ACCESS_GRANT_CREATED",
        outcome: "SUCCESS",
        actor: { userId: null, role: "OWNER", displayLabel: "OWNER" },
        target: { clubId: "club-1", userId: null, jobId: null, eventId: null, label: "사용자 숨김" },
        summary: "민감 대상과 연결된 안전한 감사 증거입니다.",
        safeMetadata: [{ label: "reasonCategory", value: "MEMBER_ASSISTANCE", kind: "code" }],
        metadataState: "AVAILABLE",
      }],
    });
  });
}

test("owner reviews admin audit ledger without raw private fields", async ({ page }) => {
  await routePlatformAdminShell(page, "OWNER");
  await routeAudit(page);

  await page.goto("/admin/audit");

  await expect(page.getByRole("heading", { name: "운영 처리 기록" })).toBeVisible();
  const ledger = page.getByLabel("처리 기록 목록");
  await expect(ledger.getByRole("button", { name: /알림 재처리 대상에 알림 재처리를 확정했습니다/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "알림 재처리를 확정했습니다." })).toBeVisible();
  const supportRow = ledger.getByRole("button", { name: /지원 접근 대상에 지원 접근 권한을 부여했습니다/ });
  await expect(supportRow).toBeVisible();
  await expect(supportRow).not.toContainText("support grant");
  await supportRow.click();
  await expect(page).toHaveURL(/event=platform_audit_events%3Aevent-2|event=platform_audit_events:event-2/);
  await expect(page).toHaveURL(/mode=detail/);
  const detail = page.getByRole("region", { name: "감사 이벤트 상세" });
  await expect(detail.getByRole("heading", { name: "지원 접근 권한을 부여했습니다." })).toBeVisible();
  await expect(detail.getByText("support grant가 생성되었습니다.")).toBeHidden();
  await expect(detail.getByText("METADATA_READ")).toBeHidden();
  await detail.getByText("기술 정보", { exact: true }).click();
  await expect(detail.getByText("support grant가 생성되었습니다.")).toBeVisible();
  await expect(detail.getByText("METADATA_READ")).toBeVisible();
  await expect(page.getByLabel("행위자 역할").getByRole("option", { name: "소유자" })).toHaveAttribute("value", "OWNER");
  await expect(page.getByLabel("소스 영역").getByRole("option", { name: "지원 접근" })).toHaveAttribute("value", "S4");
  await expect(page.getByLabel("행동 분류").getByRole("option", { name: "알림" })).toHaveAttribute("value", "NOTIFICATION");
  await expect(page.getByText("member1@example.com")).toHaveCount(0);
  await expect(page.getByText("{\"")).toHaveCount(0);
});

test("sensitive audit target stays in POST memory and out of browser persistence", async ({ page }) => {
  const sentinel = "private.member@example.com";
  let requestBody: unknown = null;
  await routePlatformAdminShell(page, "OWNER");
  await routeAudit(page);
  await routeSensitiveAudit(page, (body) => { requestBody = body; });

  await page.goto("/admin/audit?sourceSlice=S4");
  await page.getByRole("searchbox", { name: "민감 대상 검색" }).fill(sentinel);
  await page.getByRole("button", { name: "대상 검색" }).click();

  await expect(page.getByRole("button", { name: /지원 접근 권한을 부여했습니다/ })).toBeVisible();
  expect(requestBody).toMatchObject({ sensitiveTarget: sentinel, sourceSlice: "S4" });
  await expect(page).toHaveURL(/\/admin\/audit\?sourceSlice=S4$/);
  const persisted = await page.evaluate(() => JSON.stringify({
    history: history.state,
    local: { ...localStorage },
    session: { ...sessionStorage },
  }));
  expect(persisted).not.toContain(sentinel);
});

async function expectNoAuditPrivateSentinels(page: Page): Promise<void> {
  await expect(page.getByText("member1@example.com")).toHaveCount(0);
  await expect(page.getByText("private.example.com")).toHaveCount(0);
  await expect(page.getByText("{\"")).toHaveCount(0);
}

test("owner captures audit operation summary visual evidence on desktop and mobile", async ({ page }, testInfo) => {
  await routePlatformAdminShell(page, "OWNER");
  await routeAudit(page);

  await page.setViewportSize(VISUAL_AUTHORITY_VIEWPORTS.desktopWide);
  await page.goto("/admin/audit");
  await expect(page.getByRole("heading", { name: "운영 처리 기록" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expect(page.getByText("운영 판단")).toBeVisible();
  await expectNoAuditPrivateSentinels(page);
  const desktopScreenshot = await page.screenshot({
    path: testInfo.outputPath("admin-audit-desktop.png"),
    fullPage: true,
  });
  expect(desktopScreenshot.byteLength).toBeGreaterThan(10_000);

  await page.setViewportSize(VISUAL_AUTHORITY_VIEWPORTS.mobile);
  await page.goto("/admin/audit");
  await expect(page.getByRole("heading", { name: "운영 처리 기록" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button", { name: /지원 접근 권한을 부여했습니다/ }).click();
  await expect(page).toHaveURL(/mode=detail/);
  await expect(page.getByRole("region", { name: "감사 이벤트 상세" }).getByText("확인 필요", { exact: true })).toBeVisible();
  await expectMinimumTargetSize(page.getByRole("button", { name: "목록으로" }));
  await page.getByRole("button", { name: "목록으로" }).click();
  await expect(page).not.toHaveURL(/mode=detail/);
  await expect(page.getByRole("button", { name: /지원 접근 권한을 부여했습니다/ })).toBeFocused();
  await expectNoAuditPrivateSentinels(page);
  const mobileScreenshot = await page.screenshot({
    path: testInfo.outputPath("admin-audit-mobile.png"),
    fullPage: true,
  });
  expect(mobileScreenshot.byteLength).toBeGreaterThan(10_000);
});
