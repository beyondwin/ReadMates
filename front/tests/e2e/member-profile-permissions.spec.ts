import { expect, test, type Page } from "@playwright/test";
import {
  cleanupGeneratedSessions,
  cleanupSecondClubFixture,
  cleanupViewerGoogleUserFixtures,
  createOpenSessionFixture,
  ensureSecondClubFixture,
  loginWithGoogleFixture,
  resetSeedGoogleLogins,
  runMysql,
  setMembershipStatus,
} from "./readmates-e2e-db";
import {
  mockMemberParticipationProfile,
  mockMyReadingShelfJourney,
} from "./my-reading-shelf-fixtures";

test.describe.configure({ mode: "serial" });

const hostEmail = "host@example.com";
const selfEditMemberEmail = "member5@example.com";
const hostTargetMemberEmail = "member4@example.com";
const seededEmails = [hostEmail, selfEditMemberEmail, hostTargetMemberEmail];
const fixtureEmails: string[] = [];

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
  return `e2e.profile.${label}.${Date.now()}.${uniqueCounter}@example.test`;
}

function mysqlScalar(sql: string) {
  return runMysql(sql).trim().split(/\s+/).at(-1) ?? "";
}

async function updateAvatarDirect(page: Page, avatarKey: string, clubSlug?: string) {
  return page.evaluate(async ({ avatarKey: selectedAvatarKey, clubSlug: selectedClubSlug }) => {
    const query = selectedClubSlug ? `?clubSlug=${encodeURIComponent(selectedClubSlug)}` : "";
    const response = await fetch(`/api/bff/api/me/avatar${query}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatarKey: selectedAvatarKey }),
    });
    const body = await response.json().catch(() => null) as Record<string, unknown> | null;
    return { status: response.status, body };
  }, { avatarKey, clubSlug });
}

async function scopedProfile(page: Page, clubSlug: string) {
  return page.evaluate(async (selectedClubSlug) => {
    const response = await fetch(
      `/api/bff/api/app/me?clubSlug=${encodeURIComponent(selectedClubSlug)}`,
      { cache: "no-store" },
    );
    return {
      status: response.status,
      body: await response.json() as { avatarKey?: string },
    };
  }, clubSlug);
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
  fixtureEmails.length = 0;
  cleanupGeneratedSessions();
  createOpenSessionFixture();
  resetSeededProfiles();
});

test.afterEach(() => {
  if (fixtureEmails.length > 0) {
    runMysql(`
delete memberships
from memberships
join users on users.id = memberships.user_id
join clubs on clubs.id = memberships.club_id
where clubs.slug = 'sample-book-club'
  and lower(users.email) in (${fixtureEmails.map(sqlString).join(", ")});
`);
    cleanupViewerGoogleUserFixtures(fixtureEmails);
  }
  cleanupSecondClubFixture();
  cleanupGeneratedSessions();
  resetSeededProfiles();
});

test("active member account settings expose read-only profile identity", async ({ page }) => {
  await mockMyReadingShelfJourney(page);
  await loginWithGoogleFixture(page, selfEditMemberEmail);
  await page.goto("/app/me/settings");

  await expect(page.getByRole("heading", { name: "계정 설정", level: 1 })).toBeVisible();
  await expect(page.getByText(selfEditMemberEmail)).toBeVisible();
  await expect(page.getByText("멤버5", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("@멤버5")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "이름 변경" })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "이름" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "클럽 탈퇴…" })).toBeVisible();
});

test("active members edit their profile from member space and refresh the account-menu name", async ({ page }) => {
  const updatedDisplayName = uniqueDisplayName("Member");
  let refreshedDisplayName: string | null = null;
  let authPayload: Record<string, unknown> | null = null;

  await page.route("**/api/bff/api/auth/me", async (route) => {
    if (!authPayload) {
      const upstream = await route.fetch();
      authPayload = await upstream.json() as Record<string, unknown>;
    }

    await route.fulfill({
      json: { ...authPayload, displayName: refreshedDisplayName ?? authPayload.displayName },
    });
  });
  await page.route("**/api/bff/api/me/profile", async (route) => {
    expect(route.request().method()).toBe("PATCH");
    expect(route.request().postDataJSON()).toEqual({ displayName: updatedDisplayName });
    refreshedDisplayName = updatedDisplayName;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        membershipId: "e2e-member-profile",
        displayName: updatedDisplayName,
        accountName: selfEditMemberEmail,
        profileImageUrl: null,
      }),
    });
  });
  await mockMyReadingShelfJourney(page, "three-recent-readings");
  await loginWithGoogleFixture(page, selfEditMemberEmail);
  await page.goto("/app/me");

  await page.getByRole("button", { name: "이름 변경" }).click();
  await page.getByRole("textbox", { name: "표시 이름" }).fill(updatedDisplayName);
  await page.getByRole("button", { name: "이름 저장" }).click();

  await expect(page.getByRole("heading", { level: 1, name: updatedDisplayName })).toBeVisible();
  await expect(page.getByRole("button", { name: `${updatedDisplayName} 계정 메뉴` })).toBeVisible();
});

test("active members save an allowlisted avatar from My Space and refresh account identity", async ({ page }) => {
  const email = uniqueViewerEmail("active-avatar-ui");
  fixtureEmails.push(email);
  await mockMyReadingShelfJourney(page, "three-recent-readings");
  await loginWithGoogleFixture(page, email, { displayName: "E2E Active Avatar" });
  setMembershipStatus(email, "ACTIVE");
  await page.goto("/app/me");

  const opener = page.getByRole("button", { name: "아바타 바꾸기" });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "나의 아바타 선택" });
  await dialog.getByRole("button", { name: "초록 찻잔을 든 고슴도치 선택" }).click();
  const saved = page.waitForResponse(
    (response) => response.request().method() === "PATCH" && response.url().includes("/api/bff/api/me/avatar"),
  );
  await dialog.getByRole("button", { name: "이 아바타로 변경" }).click();

  expect((await saved).status()).toBe(200);
  await expect(opener.locator("img")).toHaveAttribute(
    "src",
    "/assets/avatars/book-club/hedgehog-green-mug.webp",
  );
  await expect(page.getByRole("button", { name: "E2E Active Avatar 계정 메뉴" }).locator("img")).toHaveAttribute(
    "src",
    "/assets/avatars/book-club/hedgehog-green-mug.webp",
  );
  expect(mysqlScalar(`
select avatar_key
from memberships
join users on users.id = memberships.user_id
where lower(users.email) = ${sqlString(email)}
  and memberships.club_id = '00000000-0000-0000-0000-000000000001';
`)).toBe("hedgehog-green-mug");
});

test("suspended members omit account navigation and profile editing from member space", async ({ page }) => {
  const email = uniqueViewerEmail("suspended-avatar");
  fixtureEmails.push(email);
  await mockMyReadingShelfJourney(page, "three-recent-readings");
  await loginWithGoogleFixture(page, email, { displayName: "E2E Suspended Avatar" });
  setMembershipStatus(email, "SUSPENDED");
  await page.goto("/app/me");

  const shelf = page.locator(".rm-member-space");
  await expect(shelf.getByRole("button", { name: "이름 변경" })).toHaveCount(0);
  await expect(shelf.getByRole("button", { name: "아바타 바꾸기" })).toHaveCount(0);
  await expect(shelf.getByRole("link", {
    name: /계정 (관리|설정)/,
  })).toHaveCount(0);
  const decorativeAvatar = shelf.locator(".rm-avatar-picker--decorative");
  await expect(decorativeAvatar).toHaveCSS("grid-column-start", "1");
  await expect(decorativeAvatar).toHaveCSS("grid-row-start", "1");
  await expect(decorativeAvatar).toHaveCSS("grid-row-end", "span 2");
  await expect(decorativeAvatar).toHaveCSS("align-self", "start");
  await expect(shelf.getByRole("list", {
    name: "최근 독서 기록",
  })).toBeVisible();

  const directUpdate = await updateAvatarDirect(page, "hedgehog-green-mug");
  expect(directUpdate.status).toBe(200);
  expect(directUpdate.body?.avatarKey).toBe("hedgehog-green-mug");
});

test("left and inactive members cannot open or directly mutate the avatar picker", async ({ page }) => {
  for (const status of ["LEFT", "INACTIVE"] as const) {
    const email = uniqueViewerEmail(`${status.toLowerCase()}-avatar`);
    fixtureEmails.push(email);
    await loginWithGoogleFixture(page, email, { displayName: `E2E ${status} Avatar` });
    setMembershipStatus(email, status);
    await page.goto("/");

    const directUpdate = await updateAvatarDirect(page, "hedgehog-green-mug");
    expect(directUpdate.status).toBe(403);
    expect(directUpdate.body?.code).toBe("MEMBERSHIP_NOT_ALLOWED");

    await page.goto("/app/me");
    await expect(page.getByRole("button", { name: "아바타 바꾸기" })).toHaveCount(0);
    await logout(page);
  }
});

test("two active members may store the same avatar key in one club", async ({ page }) => {
  const emails = [uniqueViewerEmail("duplicate-a"), uniqueViewerEmail("duplicate-b")];
  fixtureEmails.push(...emails);

  for (const [index, email] of emails.entries()) {
    await loginWithGoogleFixture(page, email, { displayName: `E2E Duplicate ${index + 1}` });
    setMembershipStatus(email, "ACTIVE");
    await page.goto("/");

    const directUpdate = await updateAvatarDirect(page, "hedgehog-green-mug", "reading-sai");
    expect(directUpdate.status).toBe(200);
    expect(directUpdate.body?.avatarKey).toBe("hedgehog-green-mug");
    await logout(page);
  }

  expect(mysqlScalar(`
select count(*)
from memberships
join users on users.id = memberships.user_id
where memberships.club_id = '00000000-0000-0000-0000-000000000001'
  and lower(users.email) in (${emails.map(sqlString).join(", ")})
  and memberships.avatar_key = 'hedgehog-green-mug';
`)).toBe("2");
});

test("avatar updates remain independent across club memberships", async ({ page }) => {
  const email = uniqueViewerEmail("cross-club-avatar");
  fixtureEmails.push(email);
  await loginWithGoogleFixture(page, email, { displayName: "E2E Cross Club Avatar" });
  setMembershipStatus(email, "ACTIVE");
  ensureSecondClubFixture();
  runMysql(`
insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
select uuid(), clubs.id, users.id, 'MEMBER', 'ACTIVE', utc_timestamp(6), users.short_name, 'turtle-winter-book'
from users
join clubs on clubs.slug = 'sample-book-club'
where lower(users.email) = ${sqlString(email)}
on duplicate key update
  status = 'ACTIVE',
  avatar_key = 'turtle-winter-book',
  updated_at = utc_timestamp(6);
`);
  await page.goto("/");

  const readingSaiUpdate = await updateAvatarDirect(page, "hedgehog-green-mug", "reading-sai");
  expect(readingSaiUpdate.status).toBe(200);
  const sampleClubUpdate = await updateAvatarDirect(page, "fox-glasses-mug", "sample-book-club");
  expect(sampleClubUpdate.status).toBe(200);

  const readingSaiProfile = await scopedProfile(page, "reading-sai");
  const sampleClubProfile = await scopedProfile(page, "sample-book-club");
  expect(readingSaiProfile).toEqual({
    status: 200,
    body: expect.objectContaining({ avatarKey: "hedgehog-green-mug" }),
  });
  expect(sampleClubProfile).toEqual({
    status: 200,
    body: expect.objectContaining({ avatarKey: "fox-glasses-mug" }),
  });
});

test("an empty reading shelf omits recent-session navigation", async ({ page }) => {
  await mockMemberParticipationProfile(page, "empty");
  await mockMyReadingShelfJourney(page, "empty");
  await loginWithGoogleFixture(page, hostEmail);
  await page.goto("/app/me");

  await expect(page.getByText(
    "첫 모임 이후 이곳에 읽은 기록이 이어집니다.",
  )).toBeVisible();
  const utilities = page.getByRole("region", { name: "내 공간 관리" });
  await expect(utilities.getByRole("link", {
    name: "알림 받은 알림과 수신 설정",
    exact: true,
  })).toHaveAttribute("href", "/app/notifications");
  await expect(utilities.getByRole("link", {
    name: "계정 설정 프로필과 멤버십 정보",
    exact: true,
  })).toHaveAttribute("href", "/app/me/settings");
  await expect(page.getByRole("list", {
    name: "최근 독서 기록",
  })).toHaveCount(0);
  await expect(page.getByRole("link", {
    name: "전체 보기",
  })).toHaveCount(0);
});

test("host edits a same-club member display name and sees the row update", async ({ page }) => {
  const updatedDisplayName = uniqueDisplayName("Host");

  await mockMyReadingShelfJourney(page);
  await loginWithGoogleFixture(page, hostEmail);
  await page.goto("/app/me/settings");

  await expect(page.getByRole("heading", { name: "계정 설정", level: 1 })).toBeVisible();
  await expect(page.getByText("호스트", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "이름 변경" })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "이름" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "클럽 탈퇴…" })).toBeVisible();

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

test("viewer can read member routes but cannot use current-session write actions or host routes", async ({
  page,
}, testInfo) => {
  const viewerEmail = uniqueViewerEmail("readonly");
  fixtureEmails.push(viewerEmail);

  await mockMemberParticipationProfile(page, "empty");
  await mockMyReadingShelfJourney(page, "three-recent-readings");
  await loginWithGoogleFixture(page, viewerEmail, { displayName: "E2E Profile Viewer" });
  await page.goto("/app/me");

  const viewerShelf = page.locator(".rm-member-space");
  await expect(viewerShelf.getByRole("button", { name: "이름 변경" })).toHaveCount(0);
  await expect(viewerShelf.getByRole("button", { name: "아바타 바꾸기" })).toHaveCount(0);
  await expect(viewerShelf.getByRole("link", {
    name: /계정 (관리|설정)/,
  })).toHaveCount(0);
  await expect(viewerShelf.getByRole("list", {
    name: "최근 독서 기록",
  })).toBeVisible();
  const directUpdate = await updateAvatarDirect(page, "hedgehog-green-mug");
  expect(directUpdate.status).toBe(200);
  expect(directUpdate.body?.avatarKey).toBe("hedgehog-green-mug");

  await page.goto("/app/me/settings");

  await expect(page.getByRole("heading", { name: "계정 설정", level: 1 })).toBeVisible();
  await expect(page.getByText("둘러보기 멤버").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "이름 변경" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "클럽 탈퇴…" })).toBeVisible();
  await expect(page.getByRole("button", { name: "로그아웃" })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "클럽 탈퇴…" }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("viewer-settings.png"),
  });
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto("/app/notifications/settings");
  await expect(page.getByRole("heading", { name: "알림", level: 1 })).toBeVisible();
  await expect(page.getByText("알림 수신은 현재 멤버십에서 제공되지 않습니다.")).toBeVisible();
  await expect(page.getByRole("switch")).toHaveCount(0);

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
