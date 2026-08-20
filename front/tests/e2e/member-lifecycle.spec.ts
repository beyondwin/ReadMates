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
  await page.goto("/app/host/sessions/new");
  await page.getByRole("tab", { name: "기본 정보" }).click();
  await page.getByLabel("세션 제목").fill("7회차 모임 · 생명주기 테스트");
  await page.getByLabel("책 제목").fill(lifecycleBookTitle);
  await page.getByLabel("저자").fill("테스트 저자");
  await page.getByLabel("모임 날짜").fill("2026-05-20");
  await page.getByRole("button", { name: "세션 문서 저장" }).click();

  await expectCanonicalMeetingUrl(page);
  await expect(page.getByRole("heading", { name: "세션 문서 편집" })).toBeVisible();
  const meetingUrl = page.url();
  await page.getByRole("button", { name: "멤버에게 열기" }).click();
  const dialog = page.getByRole("dialog", { name: "멤버에게 열기" });
  await expect(dialog).toBeVisible();
  const openResponse = page.waitForResponse(
    (response) => response.url().includes("/api/bff/api/host/sessions/") && response.url().includes("/open") && response.status() === 200,
  );
  await dialog.getByRole("button", { name: "멤버에게 열기" }).click();
  await openResponse;
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
  await page.getByRole("tab", { name: "개요" }).click();
  await expect(page.getByRole("button", { name: "모임 마치기" })).toBeVisible();

  await page.getByRole("button", { name: "모임 마치기" }).click();
  const dialog = page.getByRole("dialog", { name: "모임 마치기" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "취소" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "모임 마치기" })).toBeVisible();

  await page.getByRole("button", { name: "모임 마치기" }).click();
  const closeResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/bff/api/host/sessions/") &&
      response.url().includes("/close") &&
      response.status() === 200,
  );
  await page.getByRole("dialog", { name: "모임 마치기" }).getByRole("button", { name: "모임 마치기" }).click();
  await closeResponse;
  await expect(page.getByRole("button", { name: "다시 진행 중으로" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /모임을 마쳤습니다/ })).toBeVisible();
});

test("host suspends member and member cannot save current session activity", async ({ context, page }) => {
  await loginWithGoogleFixture(page, "host@example.com");
  await createOpenSessionThroughUi(page);

  await page.goto("/app/host/members");
  await page.getByRole("tab", { name: "활성 멤버" }).click();

  const memberRow = page.getByRole("article").filter({ hasText: lifecycleMemberEmail });
  await expect(memberRow).toContainText("이번 세션 참여");

  await memberRow.getByRole("button", { name: "정지" }).click();
  const dialog = page.getByRole("dialog", { name: /정지할까요/ });
  await dialog.getByLabel("이번 세션부터 바로 정지").check();

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
  await expect(memberPage.getByRole("note").filter({ hasText: "멤버십이 일시 정지되어 새 기록을 남길 수 없습니다." })).toBeVisible();
  await expect(memberPage.getByRole("button", { name: "질문 저장" })).toBeDisabled();
});
