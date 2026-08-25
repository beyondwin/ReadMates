import { expect, test, type Page } from "@playwright/test";
import {
  cleanupGeneratedSessions,
  loginWithGoogleFixture,
  resetSeedGoogleLogins,
} from "./readmates-e2e-db";

test.describe.configure({ mode: "serial" });

const CLUB_SLUG = "reading-sai";
const NEW_MEETING_PATH = `/clubs/${CLUB_SLUG}/app/host/sessions/new`;

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test.describe("dedicated new meeting workspace", () => {
  test.beforeEach(async ({ page }) => {
    cleanupGeneratedSessions();
    resetSeedGoogleLogins(["host@example.com"]);
    await loginWithGoogleFixture(page, "host@example.com");
  });

  test.afterEach(() => {
    cleanupGeneratedSessions();
    resetSeedGoogleLogins(["host@example.com"]);
  });

  test("creates once after response loss and keeps the 320px keyboard-safe flow", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 844 });
    const notificationWrites: string[] = [];
    let createCount = 0;
    let createdSessionId = "";

    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (request.method() !== "GET" && path.includes("/api/host/notifications/")) {
        notificationWrites.push(`${request.method()} ${path}`);
      }
    });
    await page.route((url) => url.pathname === "/api/bff/api/host/sessions", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      createCount += 1;
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      const body = await response.json() as { sessionId: string };
      createdSessionId = body.sessionId;
      await route.abort("failed");
    });

    await page.goto(NEW_MEETING_PATH);
    await expect(page.getByRole("heading", { level: 1, name: "새 모임 만들기" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "새 모임 작성 목차" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const screenshot = await page.screenshot({
      path: testInfo.outputPath("host-new-meeting-form-320x844.png"),
      fullPage: true,
    });
    expect(screenshot.byteLength).toBeGreaterThan(10_000);

    const overLimitTitle = "📚".repeat(256);
    await page.getByLabel("모임 제목").fill(overLimitTitle);
    await page.getByLabel("책 제목").fill("응답을 기다리는 문장들");
    await page.getByLabel("저자").fill("테스트 저자");
    if (!(await page.getByLabel("모임 날짜").inputValue())) {
      await page.getByLabel("모임 날짜").fill("2026-09-12");
    }
    await page.getByRole("button", { name: "모임 초안 저장" }).click();
    await expect(page.getByLabel("모임 제목")).toBeFocused();
    await expect(page.getByLabel("모임 제목")).toHaveValue(overLimitTitle);
    await expect(page.getByText("모임 제목은 255자까지 입력할 수 있습니다.")).toBeVisible();

    await page.getByLabel("모임 제목").fill("새 모임 · 응답을 기다리는 문장들");
    await page.getByLabel("미팅 URL").fill("https://meet.example.com/readmates-e2e");
    await page.getByLabel("Passcode · 선택").fill("room-e2e-8");
    await expect(page.getByLabel("Passcode · 선택")).toBeFocused();
    await page.keyboard.press("Tab");
    await expectNoHorizontalOverflow(page);

    await page.getByRole("button", { name: "모임 초안 저장" }).click();
    await expect(page.getByRole("heading", { name: "모임 초안을 저장했습니다" })).toBeVisible();
    expect(createCount).toBe(1);
    expect(createdSessionId).not.toBe("");
    expect(notificationWrites).toEqual([]);
    await expect(page.getByText("DRAFT")).toBeVisible();
    await expect(page.getByText("HOST_ONLY")).toBeVisible();
    await expect(page.getByText("HIDDEN")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const prepare = page.getByRole("button", { name: "멤버와 준비 시작" });
    const prepareBox = await prepare.boundingBox();
    expect(prepareBox).not.toBeNull();
    expect(prepareBox!.x).toBeGreaterThanOrEqual(0);
    expect(prepareBox!.x + prepareBox!.width).toBeLessThanOrEqual(320);

    await page.route(`**/api/bff/api/host/sessions/${createdSessionId}/open**`, async (route) => {
      expect(route.request().method()).toBe("POST");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sessionId: createdSessionId,
          state: "OPEN",
          accessScope: "GUEST_READABLE",
        }),
      });
    });
    await prepare.click();
    await expect(page.getByRole("dialog", { name: "멤버와 준비 시작" })).toBeVisible();
    await page.getByRole("button", { name: "확인하고 준비 시작" }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(
      `/clubs/${CLUB_SLUG}/app/host/sessions/${createdSessionId}`,
    );

  });
});
