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

async function replaceProfileDirect(
  page: Page,
  displayName: string,
  avatarKey: string,
  clubSlug?: string,
) {
  return page.evaluate(async ({ displayName: selectedDisplayName, avatarKey: selectedAvatarKey, clubSlug: selectedClubSlug }) => {
    const query = selectedClubSlug === undefined ? "" : `?clubSlug=${encodeURIComponent(selectedClubSlug)}`;
    const response = await fetch(`/api/bff/api/me/profile${query}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: selectedDisplayName, avatarKey: selectedAvatarKey }),
    });
    const body = await response.json().catch(() => null) as Record<string, unknown> | null;
    return { status: response.status, body };
  }, { displayName, avatarKey, clubSlug });
}

async function scopedProfile(page: Page, clubSlug: string) {
  return page.evaluate(async (selectedClubSlug) => {
    const response = await fetch(
      `/api/bff/api/app/me?clubSlug=${encodeURIComponent(selectedClubSlug)}`,
      { cache: "no-store" },
    );
    return {
      status: response.status,
      body: await response.json() as { displayName?: string; avatarKey?: string },
    };
  }, clubSlug);
}

async function scopedAuthProfile(page: Page, clubSlug: string) {
  return page.evaluate(async (selectedClubSlug) => {
    const response = await fetch(
      `/api/bff/api/auth/me?clubSlug=${encodeURIComponent(selectedClubSlug)}`,
      { cache: "no-store" },
    );
    return {
      status: response.status,
      body: await response.json() as { displayName?: string; avatarKey?: string },
    };
  }, clubSlug);
}

function membershipProfile(email: string, clubSlug: string) {
  const value = mysqlScalar(`
select concat(memberships.short_name, '|', memberships.avatar_key)
from memberships
join users on users.id = memberships.user_id
join clubs on clubs.id = memberships.club_id
where lower(users.email) = ${sqlString(email)}
  and clubs.slug = ${sqlString(clubSlug)};
`);
  const [displayName, avatarKey] = value.split("|");
  return { displayName, avatarKey };
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
  await page.goto("/login");
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

test("updates name and avatar atomically in the selected club", async ({ page }) => {
  const updatedDisplayName = uniqueDisplayName("Atomic");
  ensureSecondClubFixture();
  runMysql(`
insert into clubs (id, slug, name, tagline, about, status)
values ('00000000-0000-0000-0000-000000000099', 'other-book-club', '다른 북클럽', '테스트 클럽', '테스트 클럽입니다.', 'ACTIVE')
on duplicate key update updated_at = utc_timestamp(6);

insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
select uuid(), clubs.id, users.id, 'MEMBER', 'ACTIVE', utc_timestamp(6), '두번째멤버5', 'moon-green-book'
from users
join clubs on clubs.slug = 'sample-book-club'
where lower(users.email) = ${sqlString(selfEditMemberEmail)}
on duplicate key update
  status = 'ACTIVE',
  short_name = '두번째멤버5',
  avatar_key = 'moon-green-book',
  updated_at = utc_timestamp(6);
`);
  const originalSelectedProfile = membershipProfile(selfEditMemberEmail, "reading-sai");

  try {
    await loginWithGoogleFixture(page, selfEditMemberEmail);
    const originalSecondProfile = membershipProfile(selfEditMemberEmail, "sample-book-club");
    await page.goto("/");

    const saved = await replaceProfileDirect(
      page,
      updatedDisplayName,
      "cloud-green-book",
      "reading-sai",
    );
    expect(saved).toEqual({
      status: 200,
      body: expect.objectContaining({
        displayName: updatedDisplayName,
        avatarKey: "cloud-green-book",
      }),
    });
    await expect.poll(() => membershipProfile(selfEditMemberEmail, "reading-sai")).toEqual({
      displayName: updatedDisplayName,
      avatarKey: "cloud-green-book",
    });

    const appProfile = await scopedProfile(page, "reading-sai");
    expect(appProfile).toEqual({
      status: 200,
      body: expect.objectContaining({
        displayName: updatedDisplayName,
        avatarKey: "cloud-green-book",
      }),
    });
    const authProfile = await scopedAuthProfile(page, "reading-sai");
    expect(authProfile).toEqual({
      status: 200,
      body: expect.objectContaining({
        displayName: updatedDisplayName,
        avatarKey: "cloud-green-book",
      }),
    });
    expect(membershipProfile(selfEditMemberEmail, "sample-book-club")).toEqual(originalSecondProfile);

    const assertRejectedWithoutMutation = async (
      request: () => Promise<{ status: number; body: Record<string, unknown> | null }>,
      expectedStatus: number,
      expectedCode: string | null,
    ) => {
      const beforeSelected = membershipProfile(selfEditMemberEmail, "reading-sai");
      const beforeSecond = membershipProfile(selfEditMemberEmail, "sample-book-club");
      const response = await request();
      expect(response.status).toBe(expectedStatus);
      if (expectedCode !== null) expect(response.body?.code).toBe(expectedCode);
      expect(membershipProfile(selfEditMemberEmail, "reading-sai")).toEqual(beforeSelected);
      expect(membershipProfile(selfEditMemberEmail, "sample-book-club")).toEqual(beforeSecond);
    };

    await assertRejectedWithoutMutation(
      () => replaceProfileDirect(page, uniqueDisplayName("Missing"), "moon-green-book"),
      404,
      "MEMBER_NOT_FOUND",
    );
    await assertRejectedWithoutMutation(
      () => replaceProfileDirect(page, uniqueDisplayName("Invalid"), "moon-green-book", "bad--slug"),
      404,
      "MEMBER_NOT_FOUND",
    );
    await assertRejectedWithoutMutation(
      () => replaceProfileDirect(page, uniqueDisplayName("Other"), "moon-green-book", "other-book-club"),
      404,
      "MEMBER_NOT_FOUND",
    );

    await logout(page);
    await assertRejectedWithoutMutation(
      () => replaceProfileDirect(page, uniqueDisplayName("Anonymous"), "moon-green-book", "reading-sai"),
      401,
      null,
    );
    await loginWithGoogleFixture(page, selfEditMemberEmail);
    await page.goto("/");

    setMembershipStatus(selfEditMemberEmail, "LEFT");
    await assertRejectedWithoutMutation(
      () => replaceProfileDirect(page, uniqueDisplayName("Blocked"), "moon-green-book", "reading-sai"),
      403,
      "MEMBERSHIP_NOT_ALLOWED",
    );
    setMembershipStatus(selfEditMemberEmail, "ACTIVE");

    await assertRejectedWithoutMutation(
      () => replaceProfileDirect(page, uniqueDisplayName("Legacy"), "hedgehog-green-book", "reading-sai"),
      400,
      "AVATAR_KEY_INVALID",
    );
    await assertRejectedWithoutMutation(
      () => replaceProfileDirect(page, "멤버4", "moon-green-book", "reading-sai"),
      409,
      "DISPLAY_NAME_DUPLICATE",
    );
  } finally {
    runMysql(`
update memberships
join users on users.id = memberships.user_id
join clubs on clubs.id = memberships.club_id
set memberships.short_name = ${sqlString(originalSelectedProfile.displayName)},
    memberships.avatar_key = ${sqlString(originalSelectedProfile.avatarKey)},
    memberships.status = 'ACTIVE',
    memberships.updated_at = utc_timestamp(6)
where lower(users.email) = ${sqlString(selfEditMemberEmail)}
  and clubs.slug = 'reading-sai';

delete memberships
from memberships
join users on users.id = memberships.user_id
join clubs on clubs.id = memberships.club_id
where lower(users.email) = ${sqlString(selfEditMemberEmail)}
  and clubs.slug = 'sample-book-club';

delete from clubs where slug = 'other-book-club';
`);
  }
});

test("active member account settings expose read-only profile identity", async ({ page }) => {
  await mockMyReadingShelfJourney(page);
  await loginWithGoogleFixture(page, selfEditMemberEmail);
  await page.goto("/app/me/settings");

  await expect(page.getByRole("heading", { name: "계정 설정", level: 1 })).toBeVisible();
  await expect(page.getByText(selfEditMemberEmail)).toBeVisible();
  await expect(page.getByText("멤버5", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("@멤버5")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "프로필 편집" })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "이름" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "클럽 탈퇴…" })).toBeVisible();
});

test("active members edit their profile from member space and refresh the account-menu name", async ({ page }) => {
  const updatedDisplayName = uniqueDisplayName("Member");
  const originalProfile = membershipProfile(selfEditMemberEmail, "reading-sai");
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
  await page.route("**/api/bff/api/me/profile**", async (route) => {
    expect(route.request().method()).toBe("PUT");
    expect(route.request().postDataJSON()).toEqual({
      displayName: updatedDisplayName,
      avatarKey: originalProfile.avatarKey,
    });
    refreshedDisplayName = updatedDisplayName;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        membershipId: "e2e-member-profile",
        displayName: updatedDisplayName,
        accountName: selfEditMemberEmail,
        profileImageUrl: null,
        avatarKey: originalProfile.avatarKey,
      }),
    });
  });
  await mockMyReadingShelfJourney(page, "three-recent-readings");
  await loginWithGoogleFixture(page, selfEditMemberEmail);
  await page.goto("/app/me");

  await page.getByRole("button", { name: "프로필 편집" }).click();
  const dialog = page.getByRole("dialog", { name: "프로필 편집" });
  await dialog.getByRole("textbox", { name: "표시 이름" }).fill(updatedDisplayName);
  await dialog.getByRole("button", { name: "변경사항 저장" }).click();

  await expect(page.getByRole("heading", { level: 1, name: updatedDisplayName })).toBeVisible();
  await expect(page.getByRole("button", { name: `${updatedDisplayName} 계정 메뉴` })).toBeVisible();
});

test("active members save an allowlisted avatar from My Space and refresh account identity", async ({ page }) => {
  const email = uniqueViewerEmail("active-avatar-ui");
  fixtureEmails.push(email);
  await mockMyReadingShelfJourney(page, "three-recent-readings");
  await loginWithGoogleFixture(page, email, { displayName: "E2E Active Avatar" });
  setMembershipStatus(email, "ACTIVE");
  const originalProfile = membershipProfile(email, "reading-sai");
  await page.goto("/app/me");

  const opener = page.getByRole("button", { name: "프로필 편집" });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "프로필 편집" });
  await dialog.getByRole("button", { name: "아바타 선택, 현재 문장 사이의 구름" }).click();
  const picker = page.getByRole("dialog", { name: "아바타 선택" });
  await picker.getByRole("button", { name: "문장 사이의 구름, 초록 책을 읽는 구름 선택" }).click();
  await picker.getByRole("button", { name: "선택 완료" }).click();
  const saved = page.waitForResponse(
    (response) => response.request().method() === "PUT" && response.url().includes("/api/bff/api/me/profile"),
  );
  await dialog.getByRole("button", { name: "변경사항 저장" }).click();

  expect((await saved).status()).toBe(200);
  await expect(page.locator(".rm-member-profile__avatar img")).toHaveAttribute(
    "src",
    "/assets/avatars/book-club/cloud-green-book.webp",
  );
  await expect(page.getByRole("button", { name: "E2E Active Avatar 계정 메뉴" }).locator("img")).toHaveAttribute(
    "src",
    "/assets/avatars/book-club/cloud-green-book.webp",
  );
  expect(mysqlScalar(`
select concat(memberships.short_name, '|', memberships.avatar_key)
from memberships
join users on users.id = memberships.user_id
where lower(users.email) = ${sqlString(email)}
  and memberships.club_id = '00000000-0000-0000-0000-000000000001';
`)).toBe(`${originalProfile.displayName}|cloud-green-book`);
});

test("suspended members omit account navigation and profile editing from member space", async ({ page }) => {
  const email = uniqueViewerEmail("suspended-avatar");
  fixtureEmails.push(email);
  await mockMyReadingShelfJourney(page, "three-recent-readings");
  await loginWithGoogleFixture(page, email, { displayName: "E2E Suspended Avatar" });
  setMembershipStatus(email, "SUSPENDED");
  await page.goto("/app/me");

  const shelf = page.locator(".rm-member-space");
  await expect(shelf.getByRole("button", { name: "프로필 편집" })).toHaveCount(0);
  await expect(shelf.getByRole("link", {
    name: /계정 (관리|설정)/,
  })).toHaveCount(0);
  await expect(shelf.locator(".rm-member-profile__avatar img")).toHaveAttribute(
    "src",
    /\/assets\/avatars\/book-club\/[a-z0-9-]+\.webp$/,
  );
  await expect(shelf.getByRole("list", {
    name: "최근 독서 기록",
  })).toBeVisible();

  const directUpdate = await replaceProfileDirect(page, "E2E Suspended Avatar", "cloud-green-book", "reading-sai");
  expect(directUpdate.status).toBe(200);
  expect(directUpdate.body?.avatarKey).toBe("cloud-green-book");
});

test("left and inactive members cannot open or directly mutate the avatar picker", async ({ page }) => {
  for (const status of ["LEFT", "INACTIVE"] as const) {
    const email = uniqueViewerEmail(`${status.toLowerCase()}-avatar`);
    fixtureEmails.push(email);
    await loginWithGoogleFixture(page, email, { displayName: `E2E ${status} Avatar` });
    setMembershipStatus(email, status);
    await page.goto("/");

    const directUpdate = await replaceProfileDirect(page, `E2E ${status} Avatar`, "cloud-green-book", "reading-sai");
    expect(directUpdate.status).toBe(403);
    expect(directUpdate.body?.code).toBe("MEMBERSHIP_NOT_ALLOWED");

    await page.goto("/app/me");
    await expect(page.getByRole("button", { name: "프로필 편집" })).toHaveCount(0);
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

    const directUpdate = await replaceProfileDirect(page, `E2E Duplicate ${index + 1}`, "cloud-green-book", "reading-sai");
    expect(directUpdate.status).toBe(200);
    expect(directUpdate.body?.avatarKey).toBe("cloud-green-book");
    await logout(page);
  }

  expect(mysqlScalar(`
select count(*)
from memberships
join users on users.id = memberships.user_id
where memberships.club_id = '00000000-0000-0000-0000-000000000001'
  and lower(users.email) in (${emails.map(sqlString).join(", ")})
  and memberships.avatar_key = 'cloud-green-book';
`)).toBe("2");
});

test("mixed membership edit gates and avatar updates remain independent across clubs", async ({ page }) => {
  const email = uniqueViewerEmail("cross-club-avatar");
  const displayName = "Cross Club Avatar";
  fixtureEmails.push(email);
  await loginWithGoogleFixture(page, email, { displayName });
  setMembershipStatus(email, "ACTIVE");
  ensureSecondClubFixture();
  runMysql(`
insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
select uuid(), clubs.id, users.id, 'MEMBER', 'VIEWER', utc_timestamp(6), users.short_name, 'cloud-green-book'
from users
join clubs on clubs.slug = 'sample-book-club'
where lower(users.email) = ${sqlString(email)}
on duplicate key update
  status = 'VIEWER',
  avatar_key = 'cloud-green-book',
  updated_at = utc_timestamp(6);
`);
  await page.goto("/");

  await page.goto("/clubs/reading-sai/app/me");
  await expect(page.getByRole("button", { name: "프로필 편집" })).toBeVisible();
  await page.goto("/clubs/sample-book-club/app/me");
  await expect(page.getByRole("button", { name: "프로필 편집" })).toHaveCount(0);

  const readingSaiUpdate = await replaceProfileDirect(page, displayName, "cloud-green-book", "reading-sai");
  expect(readingSaiUpdate.status).toBe(200);
  const sampleClubUpdate = await replaceProfileDirect(page, displayName, "moon-green-book", "sample-book-club");
  expect(sampleClubUpdate.status).toBe(200);

  const readingSaiProfile = await scopedProfile(page, "reading-sai");
  const sampleClubProfile = await scopedProfile(page, "sample-book-club");
  expect(readingSaiProfile).toEqual({
    status: 200,
    body: expect.objectContaining({ avatarKey: "cloud-green-book" }),
  });
  expect(sampleClubProfile).toEqual({
    status: 200,
    body: expect.objectContaining({ avatarKey: "moon-green-book" }),
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
  await expect(page.getByRole("button", { name: "프로필 편집" })).toHaveCount(0);
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
  await expect(viewerShelf.getByRole("button", { name: "프로필 편집" })).toHaveCount(0);
  await expect(viewerShelf.getByRole("link", {
    name: /계정 (관리|설정)/,
  })).toHaveCount(0);
  await expect(viewerShelf.getByRole("list", {
    name: "최근 독서 기록",
  })).toBeVisible();
  const directUpdate = await replaceProfileDirect(page, "E2E Profile Viewer", "cloud-green-book", "reading-sai");
  expect(directUpdate.status).toBe(200);
  expect(directUpdate.body?.avatarKey).toBe("cloud-green-book");

  await page.goto("/app/me/settings");

  await expect(page.getByRole("heading", { name: "계정 설정", level: 1 })).toBeVisible();
  await expect(page.getByText("둘러보기 멤버").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "프로필 편집" })).toHaveCount(0);
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
  const currentSession = page.locator(".rm-current-session-desktop");
  await expect(currentSession.getByText("정식 멤버가 되면 참여 기능과 작성 기능이 열립니다.")).toBeVisible();
  for (const label of ["참석", "아직 미정", "불참", "진행률 저장", "질문 저장", "서평 저장"]) {
    await expect(currentSession.getByRole("button", { name: label })).toBeDisabled();
  }
  await expect(currentSession.getByRole("slider", { name: "읽기 진행률" })).toBeDisabled();

  await page.goto("/app/host/members");
  await expect(page).toHaveURL(/\/app\/?$/);

  await logout(page);
});
