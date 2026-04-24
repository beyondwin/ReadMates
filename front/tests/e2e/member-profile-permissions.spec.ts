import { expect, test, type Page } from "@playwright/test";
import {
  cleanupGeneratedSessions,
  cleanupViewerGoogleUserFixtures,
  createOpenSessionFixture,
  loginWithGoogleFixture,
  resetSeedGoogleLogins,
  runMysql,
  setMembershipStatus,
} from "./readmates-e2e-db";

const hostEmail = "host@example.com";
const selfEditMemberEmail = "member5@example.com";
const hostTargetMemberEmail = "member4@example.com";
const seededEmails = [hostEmail, selfEditMemberEmail, hostTargetMemberEmail];
const viewerEmails: string[] = [];

let uniqueCounter = 0;

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function uniqueDisplayName(prefix: string) {
  uniqueCounter += 1;
  return `${prefix}${Date.now().toString(36)}${uniqueCounter}`;
}

function uniqueViewerEmail(label: string) {
  uniqueCounter += 1;
  return `e2e.profile.${label}.${Date.now()}.${uniqueCounter}@example.com`;
}

function resetSeededProfiles() {
  resetSeedGoogleLogins(seededEmails);
  setMembershipStatus(selfEditMemberEmail, "ACTIVE");
  setMembershipStatus(hostTargetMemberEmail, "ACTIVE");
  runMysql(`
update users
set short_name = case lower(email)
    when ${sqlString(hostEmail)} then '호스트'
    when ${sqlString(selfEditMemberEmail)} then '멤버5'
    when ${sqlString(hostTargetMemberEmail)} then '멤버4'
    else short_name
  end,
  updated_at = utc_timestamp(6)
where lower(email) in (${seededEmails.map(sqlString).join(", ")});

update memberships
join users on users.id = memberships.user_id
set memberships.short_name = users.short_name,
    memberships.updated_at = utc_timestamp(6)
where lower(users.email) in (${seededEmails.map(sqlString).join(", ")});
`);
}

async function logout(page: Page) {
  await page.evaluate(async () => {
    const response = await fetch("/api/bff/api/auth/logout", { method: "POST" });
    if (!response.ok) {
      throw new Error(`Logout failed: ${response.status}`);
    }
  });
  await page.context().clearCookies();
}

test.beforeEach(() => {
  viewerEmails.length = 0;
  cleanupGeneratedSessions();
  createOpenSessionFixture();
  resetSeededProfiles();
});

test.afterEach(() => {
  if (viewerEmails.length > 0) {
    cleanupViewerGoogleUserFixtures(viewerEmails);
  }
  cleanupGeneratedSessions();
  resetSeededProfiles();
});

test("member cannot edit own profile display name from my page", async ({ page }) => {
  await loginWithGoogleFixture(page, selfEditMemberEmail);
  await page.goto("/app/me");

  await expect(page.getByRole("heading", { name: "계정과 기록", level: 1 })).toBeVisible();
  const personalSettings = page.locator("section").filter({ has: page.getByRole("heading", { name: "개인 설정" }) });
  await expect(personalSettings.getByText("멤버5", { exact: true }).first()).toBeVisible();
  await expect(personalSettings.getByText("@멤버5")).toHaveCount(0);
  await expect(personalSettings.getByRole("button", { name: "이름 변경" })).toHaveCount(0);
  await expect(personalSettings.getByRole("textbox", { name: "이름" })).toHaveCount(0);
});

test("host edits a same-club member display name and sees the row update", async ({ page }) => {
  const updatedDisplayName = uniqueDisplayName("Host");

  await loginWithGoogleFixture(page, hostEmail);
  await page.goto("/app/me");

  await expect(page.getByRole("heading", { name: "계정과 기록", level: 1 })).toBeVisible();
  const myPagePersonalSettings = page.locator("section").filter({ has: page.getByRole("heading", { name: "개인 설정" }) });
  await expect(myPagePersonalSettings.getByText("호스트", { exact: true }).first()).toBeVisible();
  await expect(myPagePersonalSettings.getByRole("button", { name: "이름 변경" })).toHaveCount(0);
  await expect(myPagePersonalSettings.getByRole("textbox", { name: "이름" })).toHaveCount(0);

  await page.goto("/app/host/members");

  await expect(page.getByRole("heading", { name: "멤버 관리", level: 1 })).toBeVisible();
  await page.getByRole("tab", { name: "활성 멤버" }).click();

  const memberRow = page.getByRole("article").filter({ hasText: hostTargetMemberEmail });
  await expect(memberRow).toContainText("멤버4");
  await expect(memberRow).not.toContainText("@멤버4");

  await memberRow.getByRole("button", { name: "이름 변경" }).click();
  const dialog = page.getByRole("dialog", { name: /이름 수정/ });
  await dialog.getByRole("textbox", { name: "이름" }).fill(updatedDisplayName);

  const profileResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      response.url().includes("/api/bff/api/host/members/") &&
      response.url().includes("/profile") &&
      response.status() === 200,
  );
  await dialog.getByRole("button", { name: "이름 저장" }).click();
  await profileResponse;

  await expect(page.getByRole("status")).toContainText("이름을 저장했습니다.");
  await expect(memberRow).toContainText(updatedDisplayName);
  await expect(memberRow).not.toContainText(`@${updatedDisplayName}`);
});

test("viewer can read member routes but cannot use current-session write actions or host routes", async ({ page }) => {
  const viewerEmail = uniqueViewerEmail("readonly");
  viewerEmails.push(viewerEmail);

  await loginWithGoogleFixture(page, viewerEmail, { displayName: "E2E Profile Viewer" });
  await page.goto("/app/me");

  await expect(page.getByRole("heading", { name: "계정과 기록", level: 1 })).toBeVisible();
  await expect(page.getByText("둘러보기 멤버").first()).toBeVisible();

  await page.goto("/app/session/current");
  await expect(page.getByRole("heading", { level: 1, name: "E2E 현재 세션 책" })).toBeVisible();
  await expect(page.getByText("둘러보기 멤버는 RSVP, 읽기 진행률, 질문, 서평을 저장할 수 없습니다.").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "참석" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "진행률 저장" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "질문 저장" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "서평 저장" })).toHaveCount(0);

  await page.goto("/app/host/members");
  await expect(page).toHaveURL(/\/app\/?$/);

  await logout(page);
});
