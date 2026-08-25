import { expect, test, type Page, type Route } from "@playwright/test";
import type { HostSessionDetailResponse } from "@/features/host/api/host-contracts";
import {
  fulfillHostAuth,
  hostSessionDetailResponse,
  isHostSessionDetailRequest,
  routeHostEditorShell,
} from "./aigen-test-fixtures";

const CLUB_SLUG = "club-a";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const meetingPath = `/clubs/${CLUB_SLUG}/app/host/sessions/${SESSION_ID}`;

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function meeting(): HostSessionDetailResponse {
  return {
    ...hostSessionDetailResponse(SESSION_ID),
    sessionNumber: 27,
    title: "경계가 긴 한글 모임 제목과 A deliberately long English meeting title",
    bookTitle: "우리가 서로의 세계를 읽는 책",
    locationLabel: "온라인 · 안전한 합성 장소",
    state: "OPEN",
    versions: {
      sessionRevision: 7,
      exposureRevision: 2,
      participantSetRevision: 3,
      recordDraftRevision: null,
      liveRecordRevision: null,
      publicationRevision: 1,
    },
    attendanceSnapshotId: "attendance-snapshot-3",
    accessScope: "HOST_ONLY",
    siteVisibility: "HIDDEN",
    attendees: Array.from({ length: 50 }, (_, index) => ({
      membershipId: `member-${index}`,
      avatarKey: "banana-green-book",
      displayName: `합성 독자 ${index + 1}`,
      accountName: `합성 독자 ${index + 1}`,
      rsvpStatus: index % 4 === 0 ? "NO_RESPONSE" as const : "GOING" as const,
      attendanceStatus: index % 3 === 0 ? "UNKNOWN" as const : "ATTENDED" as const,
      participationStatus: "ACTIVE" as const,
      attendanceRevision: 1,
    })),
  };
}

async function routeWorkspace(page: Page) {
  await routeHostEditorShell(page, CLUB_SLUG);
  await page.route("**/api/bff/api/auth/me**", (route) => fulfillHostAuth(route, CLUB_SLUG));
  await page.route(`**/api/bff/api/host/sessions/${SESSION_ID}**`, async (route) => {
    if (!isHostSessionDetailRequest(route, SESSION_ID)) return route.fallback();
    await json(route, meeting());
  });
}

test("host sees one Meeting Folio with canonical local links and independent publication language", async ({ page }) => {
  await routeWorkspace(page);
  await page.goto(meetingPath);

  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "현재 모임 작업" })).toBeVisible();
  await expect(page.getByRole("link", { name: /참석 응답/ })).toHaveAttribute("href", /section=responses/);
  await expect(page.getByRole("complementary", { name: "지금 확인할 일" })).toContainText("게스트·멤버");
  await expect(page.getByRole("complementary", { name: "지금 확인할 일" })).toContainText("공개 기록에 게시 안 됨");
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(page.getByText(/\d+\/\d+ 완료/)).toHaveCount(0);

  await page.getByRole("link", { name: /실제 출석/ }).click();
  await expect(page).toHaveURL(/section=attendance/);
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
});

test("mobile task sheet is modal, keyboard-dismissible, and restores its trigger", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await routeWorkspace(page);
  await page.goto(meetingPath);
  const trigger = page.getByRole("button", { name: "모임 작업 목차" });
  await trigger.click();
  const sheet = page.getByRole("dialog", { name: "모임 작업 목차" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute("aria-modal", "true");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test("record panel failure does not remove basic meeting work and exposes retry", async ({ page }) => {
  await routeWorkspace(page);
  await page.route(`**/api/bff/api/host/sessions/${SESSION_ID}/record-editor**`, (route) => json(route, { code: "UNAVAILABLE" }, 503));
  await page.goto(`${meetingPath}?section=records`);
  await expect(page.getByRole("alert")).toContainText("모임 기록을 불러오지 못했습니다");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("경계가 긴 한글 모임 제목");
  await expect(page.getByRole("link", { name: "개요" })).toBeVisible();
  await expect(page.getByRole("button", { name: "모임 기록 다시 시도" })).toBeVisible();
});
