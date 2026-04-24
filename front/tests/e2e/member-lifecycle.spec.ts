import { expect, test, type Page } from "@playwright/test";
import { cleanupGeneratedSessions, loginWithGoogleFixture, resetSeedGoogleLogins, setMembershipStatus } from "./readmates-e2e-db";

test.describe.configure({ mode: "serial" });

const lifecycleMemberEmail = "member5@example.com";
const lifecycleBookTitle = "생명주기 테스트 책";

function resetLifecycleState() {
  cleanupGeneratedSessions();
  setMembershipStatus(lifecycleMemberEmail, "ACTIVE");
  resetSeedGoogleLogins(["host@example.com", lifecycleMemberEmail]);
}

async function createOpenSessionThroughUi(page: Page) {
  await page.goto("/app/host/sessions/new");
  await page.getByLabel("세션 제목").fill("7회차 모임 · 생명주기 테스트");
  await page.getByLabel("책 제목").fill(lifecycleBookTitle);
  await page.getByLabel("저자").fill("테스트 저자");
  await page.getByLabel("모임 날짜").fill("2026-05-20");
  await page.getByRole("button", { name: "새 세션 만들기" }).click();

  await expect(page).toHaveURL(/\/app\/session\/current/);
  await expect(page.getByRole("heading", { level: 1, name: lifecycleBookTitle })).toBeVisible();
}

test.beforeEach(() => {
  resetLifecycleState();
});

test.afterEach(() => {
  resetLifecycleState();
});

test("host suspends member and member cannot save current session activity", async ({ context, page }) => {
  await loginWithGoogleFixture(page, "host@example.com");
  await createOpenSessionThroughUi(page);

  await page.goto("/app/host/members");
  await page.getByRole("tab", { name: "활성 멤버" }).click();

  const memberRow = page.getByRole("article").filter({ hasText: lifecycleMemberEmail });
  await expect(memberRow).toContainText("이번 세션 참여 중");

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
