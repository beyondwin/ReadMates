import { expect, test, type Page } from "@playwright/test";
import { hostMeetingUrlPattern, loginWithGoogleFixture, resetE2eState, setMembershipStatus } from "./readmates-e2e-db";

test.describe.configure({ mode: "serial" });

const lifecycleMemberEmail = "member5@example.com";
const lifecycleBookTitle = "생명주기 테스트 책";
const hostMeetingPath = hostMeetingUrlPattern;

function resetLifecycleState() {
  resetE2eState({
    cleanupGeneratedSessions: true,
    googleLoginEmails: ["host@example.com", lifecycleMemberEmail],
  });
  setMembershipStatus(lifecycleMemberEmail, "ACTIVE");
}

async function expectCanonicalMeetingUrl(page: Page) {
  await expect(page).toHaveURL(hostMeetingPath);
  expect(new URL(page.url()).pathname).not.toMatch(/\/edit\/?$/);
}

async function createOpenSessionThroughUi(page: Page) {
  await page.goto("/clubs/reading-sai/app/host/sessions/new");
  await expect(page.getByLabel("모임 제목")).toBeVisible();
  await page.getByLabel("모임 제목").fill("7회차 모임 · 생명주기 테스트");
  await page.getByLabel("책 제목").fill(lifecycleBookTitle);
  await page.getByLabel("저자").fill("테스트 저자");
  await page.getByLabel("모임 날짜").fill("2026-05-20");
  await page.getByRole("form", { name: "새 모임 정보" }).getByRole("button", { name: "모임 초안 저장" }).click();
  await expect(page.getByRole("heading", { name: "모임 초안을 저장했습니다" })).toBeVisible();
  const openCta = page.getByRole("button", { name: "멤버와 준비 시작" });
  await expect(openCta).toBeVisible();
  await openCta.click();
  const dialog = page.getByRole("dialog", { name: "멤버와 준비 시작" });
  await expect(dialog).toBeVisible();
  const openResponse = page.waitForResponse(
    (response) => response.url().includes("/api/bff/api/host/sessions/") && response.url().includes("/open") && response.status() === 200,
  );
  await dialog.getByRole("button", { name: "확인하고 준비 시작" }).click();
  await openResponse;
  await expectCanonicalMeetingUrl(page);
  const meetingUrl = page.url();
  await page.goto("/app/session/current");

  await expect(page).toHaveURL(/\/app\/session\/current/);
  await expect(page.getByRole("heading", { level: 1, name: lifecycleBookTitle })).toBeVisible();
  return meetingUrl;
}

test.beforeEach(() => {
  resetLifecycleState();
});

test.afterEach(() => {
  resetLifecycleState();
});

test("host confirms before closing a session from the editor overview", async ({ page }) => {
  await loginWithGoogleFixture(page, "host@example.com");
  const meetingUrl = await createOpenSessionThroughUi(page);

  await page.goto(meetingUrl);
  await expect(page.getByRole("region", { name: "지금 할 일" })).toBeVisible();
  const primaryActions = page.getByRole("region", { name: "지금 할 일" });
  const checkAttendance = primaryActions.getByRole("button", { name: "실제 출석 확인" });
  const finish = primaryActions.getByRole("button", { name: "모임 마치기" });
  await expect(checkAttendance.or(finish)).toBeVisible({ timeout: 10_000 });
  if (await checkAttendance.count()) {
    await checkAttendance.click();
    const attendancePanel = page.getByRole("region", { name: "출석" });
    const collapse = attendancePanel.getByRole("button", { name: "접기" });
    await expect(collapse).toBeVisible();
    const attendButtons = attendancePanel.getByRole("button", { name: /참석$/ });
    await expect(attendButtons.first()).toBeVisible();
    const attendCount = await attendButtons.count();
    for (let index = 0; index < attendCount; index += 1) {
      const button = attendButtons.nth(index);
      if ((await button.getAttribute("aria-pressed")) !== "true") {
        const save = page.waitForResponse((response) => (
          response.request().method() === "POST"
          && response.url().includes("/attendance")
        ));
        await button.click();
        expect((await save).ok()).toBe(true);
      }
      await expect(button).toHaveAttribute("aria-pressed", "true");
    }
  }
  await expect(finish).toBeVisible({ timeout: 10_000 });

  await finish.click();
  const dialog = page.getByRole("dialog", { name: "모임 마치기" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "취소" }).click();
  await expect(dialog).toBeHidden();
  await expect(finish).toBeVisible();

  await finish.click();
  const closeResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/bff/api/host/sessions/") &&
      response.url().includes("/close") &&
      response.status() === 200,
  );
  await page.getByRole("dialog", { name: "모임 마치기" }).getByRole("button", { name: "모임 마치기" }).click();
  await closeResponse;
  await expect(page.getByRole("button", { name: "다시 준비 중으로" })).toBeVisible();
  await expect(page.getByText("기록 정리 중")).toBeVisible();
});

test("host suspends member and member cannot save current session activity", async ({ context, page }) => {
  await loginWithGoogleFixture(page, "host@example.com");
  await createOpenSessionThroughUi(page);

  await page.goto("/clubs/reading-sai/app/host/members");
  await page.getByRole("tab", { name: "활성 멤버" }).click();

  const memberRow = page.getByRole("article").filter({ hasText: lifecycleMemberEmail });
  await expect(memberRow).toContainText("이번 모임 참여");

  await memberRow.getByRole("button", { name: "정지" }).click();
  const dialog = page.getByRole("dialog", { name: /정지할까요/ });
  await dialog.getByLabel("이번 모임부터 바로 정지").check();

  const suspendResponse = page.waitForResponse(
    (response) => response.url().includes("/api/bff/api/host/members/") && response.url().includes("/suspend") && response.status() === 200,
  );
  await dialog.getByRole("button", { name: "정지" }).click();
  await suspendResponse;

  await page.getByRole("tab", { name: "정지됨" }).click();
  await expect(page.getByRole("article").filter({ hasText: lifecycleMemberEmail })).toContainText("정지됨");

  const memberPage = await context.newPage();
  await loginWithGoogleFixture(memberPage, lifecycleMemberEmail);
  await memberPage.goto("/app/session/current");

  await expect(memberPage.getByRole("heading", { level: 1, name: lifecycleBookTitle })).toBeVisible();
  await expect(memberPage.getByRole("note").filter({ hasText: "현재 모임은 읽기 전용입니다." })).toBeVisible();
  await expect(memberPage.getByRole("button", { name: "질문 저장" })).toBeDisabled();
});
