import { expect, test, type Page, type Route } from "@playwright/test";
import type { HostSessionDetailResponse } from "@/features/host/api/host-contracts";
import {
  hostSessionDetailResponse,
  isHostSessionDetailRequest,
  routeHostEditorShell,
} from "./aigen-test-fixtures";
import {
  expectMinimumTargetSize,
  expectNoHorizontalOverflow,
  expectReducedMotion,
  expectVisibleFocus,
} from "./support/visual-authority-contract";

const CLUB_SLUG = "club-a";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const PATH = `/clubs/${CLUB_SLUG}/app/host/sessions/${SESSION_ID}`;

function meeting(): HostSessionDetailResponse {
  const meetingDate = new Date();
  meetingDate.setDate(meetingDate.getDate() + 1);
  const year = meetingDate.getFullYear();
  const month = String(meetingDate.getMonth() + 1).padStart(2, "0");
  const day = String(meetingDate.getDate()).padStart(2, "0");
  return {
    ...hostSessionDetailResponse(SESSION_ID),
    title: "긴 한글 모임 제목과 a deliberately long English meeting title",
    date: `${year}-${month}-${day}`,
    state: "OPEN",
    attendees: Array.from({ length: 500 }, (_, index) => ({
      membershipId: `synthetic-member-${index + 1}`,
      avatarKey: "banana-green-book",
      displayName: `합성 독자 ${index + 1} Reader with a long name`,
      accountName: `합성 독자 ${index + 1}`,
      rsvpStatus: index % 4 === 0 ? "NO_RESPONSE" as const : "GOING" as const,
      attendanceStatus: index % 3 === 0 ? "UNKNOWN" as const : "ATTENDED" as const,
      participationStatus: "ACTIVE" as const,
      attendanceRevision: 1,
      seenScheduleRevision: index % 2 === 0 ? 1 : null,
      scheduleSeenAt: index % 2 === 0 ? "2026-08-29T01:02:03Z" : null,
      scheduleSeenState: index % 2 === 0 ? "CURRENT" as const : "UNSEEN" as const,
    })),
  };
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function routeWorkspace(page: Page) {
  await routeHostEditorShell(page, CLUB_SLUG);
  await page.route("**/api/observability/frontend-events", (route) => route.fulfill({ status: 204 }));
  await page.route(`**/api/bff/api/host/sessions/${SESSION_ID}/publication/convergence**`, (route) => route.fulfill({ status: 204 }));
  await page.route(`**/api/bff/api/host/sessions/${SESSION_ID}**`, async (route) => {
    if (!isHostSessionDetailRequest(route, SESSION_ID)) return route.fallback();
    await json(route, meeting());
  });
}

test("host workspace keeps its essential semantics and keyboard path across focused browsers", async ({ page }, testInfo) => {
  await routeWorkspace(page);
  await page.goto(PATH);
  await expectReducedMotion(page);

  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("긴 한글 모임 제목");
  await expect(page.locator(".rm-meeting-diary")).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "모임의 걸음" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "모임의 걸음" }).getByRole("listitem")).toHaveCount(6);
  await expect(page.getByRole("region", { name: "지금 할 일" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "관련 작업" })).toBeVisible();
  await expect(page.getByRole("region", { name: "진행 목록" })).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "현재 모임 작업" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "모임 작업 목차" })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  const responses = page.getByRole("navigation", { name: "관련 작업" }).getByRole("link", { name: "참석 응답", exact: true });
  await responses.click();
  await expect(page).toHaveURL(/section=responses/);
  const responsesSheet = page.getByRole("dialog", { name: "참석 응답" });
  await expect(responsesSheet).toBeVisible();
  await expect(responsesSheet).toHaveAttribute("aria-modal", "true");
  await expect(responsesSheet.locator(".rm-meeting-response-ledger__row")).toHaveCount(500);
  await expect(page.getByRole("searchbox", { name: "참여자 검색" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: /합성 독자 1 Reader with a long name 실제 출석/ })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(responsesSheet).toBeHidden();

  if (testInfo.project.name === "webkit-mobile-host") {
    const trigger = page.getByRole("button", { name: "모임 정보" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "모임 정보" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expectMinimumTargetSize(page.locator(".rm-host-session-workspace__cta--mobile"));
  } else {
    const attendance = page.getByRole("navigation", { name: "관련 작업" }).getByRole("link", { name: /실제 출석/ });
    await attendance.focus();
    await expectVisibleFocus(attendance);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/section=attendance/);
    const attendanceSheet = page.getByRole("dialog", { name: "출석" });
    await expect(attendanceSheet).toBeVisible();
    await expect(attendanceSheet).toHaveAttribute("aria-modal", "true");
    await expectMinimumTargetSize(page.locator(".rm-host-session-workspace__cta--desktop"));
  }
});
