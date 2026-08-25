import { expect, test, type Page, type Route } from "@playwright/test";
import type { HostSessionDetailResponse } from "@/features/host/api/host-contracts";
import {
  hostSessionDetailResponse,
  isHostSessionDetailRequest,
  routeHostEditorShell,
} from "./aigen-test-fixtures";

const CLUB_SLUG = "club-a";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const PATH = `/clubs/${CLUB_SLUG}/app/host/sessions/${SESSION_ID}?section=responses`;

function meeting(): HostSessionDetailResponse {
  return {
    ...hostSessionDetailResponse(SESSION_ID),
    title: "긴 한글 모임 제목과 a deliberately long English meeting title",
    attendees: Array.from({ length: 500 }, (_, index) => ({
      membershipId: `synthetic-member-${index + 1}`,
      avatarKey: "banana-green-book",
      displayName: `합성 독자 ${index + 1} Reader with a long name`,
      accountName: `합성 독자 ${index + 1}`,
      rsvpStatus: index % 4 === 0 ? "NO_RESPONSE" as const : "GOING" as const,
      attendanceStatus: index % 3 === 0 ? "UNKNOWN" as const : "ATTENDED" as const,
      participationStatus: "ACTIVE" as const,
      attendanceRevision: 1,
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
  await page.emulateMedia({ reducedMotion: "reduce" });
  await routeWorkspace(page);
  await page.goto(PATH);

  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("긴 한글 모임 제목");
  await expect(page.locator(".rm-meeting-response-ledger__row")).toHaveCount(500);
  await expect(page.getByRole("searchbox", { name: "참여자 검색" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: /합성 독자 1 Reader with a long name 실제 출석/ })).toBeVisible();

  if (testInfo.project.name === "webkit-mobile-host") {
    const trigger = page.getByRole("button", { name: "모임 작업 목차" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "모임 작업 목차" });
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog.getByRole("navigation", { name: "모임 작업 목차" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  } else {
    await expect(page.getByRole("navigation", { name: "현재 모임 작업" })).toBeVisible();
    await page.getByRole("link", { name: /실제 출석/ }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/section=attendance/);
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  }
});
