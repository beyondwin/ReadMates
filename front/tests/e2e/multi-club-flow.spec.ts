import { expect, test } from "@playwright/test";
import {
  cleanupSecondClubFixture,
  cleanupSecondClubInvitedMembers,
  createSecondClubInviteFixture,
  ensureSecondClubFixture,
  loginWithGoogleFixture,
  resetSeedGoogleLogins,
  runMysql,
} from "./readmates-e2e-db";

const secondClubInviteEmail = "sample.club.invited@example.com";

test.describe.configure({ mode: "serial" });

test.beforeEach(() => {
  ensureSecondClubFixture();
  resetSeedGoogleLogins(["host@example.com", secondClubInviteEmail]);
});

test.afterEach(() => {
  cleanupSecondClubInvitedMembers([secondClubInviteEmail]);
  ensureSecondClubFixture();
  cleanupSecondClubFixture();
  resetSeedGoogleLogins(["host@example.com", secondClubInviteEmail]);
});

test("public club routes and APIs stay isolated by slug", async ({ page }) => {
  await page.goto("/clubs/sample-book-club");
  await expect(page.getByRole("heading", { name: "샘플 북클럽" })).toBeVisible();

  const publicClubs = await page.evaluate(async () => {
    const [readingSai, sampleClub] = await Promise.all([
      fetch("/api/bff/api/public/clubs/reading-sai", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/bff/api/public/clubs/sample-book-club", { cache: "no-store" }).then((response) => response.json()),
    ]);
    return { readingSai, sampleClub };
  });

  expect(publicClubs.readingSai.clubName).toBe("읽는사이");
  expect(publicClubs.sampleClub.clubName).toBe("샘플 북클럽");
  expect(publicClubs.sampleClub.recentSessions).toEqual([]);
});

test("bare app entry replaces to the shared session's current club", async ({ page }) => {
  await loginWithGoogleFixture(page, "host@example.com");

  await page.goto("/app");
  await expect(page).toHaveURL(/\/clubs\/sample-book-club\/app$/);

  const authState = await page.evaluate(async () => {
    const response = await fetch("/api/bff/api/auth/me?clubSlug=sample-book-club", { cache: "no-store" });
    return response.json();
  });

  expect(authState.currentMembership.clubSlug).toBe("sample-book-club");
  expect(authState.currentMembership.role).toBe("MEMBER");
});

test("club switcher changes club context while preserving independent roles", async ({ page }) => {
  await loginWithGoogleFixture(page, "host@example.com");

  await page.goto("/clubs/reading-sai/app/host/sessions?cursor=source-cursor#source-modal");
  await expect(page).toHaveURL(/\/clubs\/reading-sai\/app\/host\/sessions(?:\?.*)?$/);

  const readingSaiAuth = await page.evaluate(async () => {
    const response = await fetch("/api/bff/api/auth/me?clubSlug=reading-sai", { cache: "no-store" });
    return response.json();
  });

  expect(readingSaiAuth.currentMembership.clubSlug).toBe("reading-sai");
  expect(readingSaiAuth.currentMembership.role).toBe("HOST");

  await page.getByLabel("클럽 전환").selectOption("sample-book-club");

  await expect(page).toHaveURL(/\/clubs\/sample-book-club\/app\/archive$/);
  expect(new URL(page.url()).search).toBe("");
  expect(new URL(page.url()).hash).toBe("");
  const sampleClubAuth = await page.evaluate(async () => {
    const response = await fetch("/api/bff/api/auth/me?clubSlug=sample-book-club", { cache: "no-store" });
    return response.json();
  });

  expect(sampleClubAuth.currentMembership.clubSlug).toBe("sample-book-club");
  expect(sampleClubAuth.currentMembership.role).toBe("MEMBER");
});

test("canonical workspace URLs survive direct entry, reload, resize, and role-switch history", async ({ page }) => {
  await loginWithGoogleFixture(page, "host@example.com");

  await page.goto("/clubs/reading-sai/app/host");
  await expect(page).toHaveURL(/\/clubs\/reading-sai\/app\/host(?:\/sessions\/[^/]+)?$/);
  await page.reload();
  await expect(page).toHaveURL(/\/clubs\/reading-sai\/app\/host(?:\/sessions\/[^/]+)?$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page).toHaveURL(/\/clubs\/reading-sai\/app\/host(?:\/sessions\/[^/]+)?$/);
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.locator(".desktop-only .rm-workspace-switch").click();
  await expect(page).toHaveURL(/\/clubs\/reading-sai\/app$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/clubs\/reading-sai\/app\/host(?:\/sessions\/[^/]+)?$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/clubs\/reading-sai\/app$/);
});

test("same-meeting role switching keeps an authorized canonical meeting object", async ({ page }) => {
  await loginWithGoogleFixture(page, "host@example.com");
  const sessionId = runMysql(`
select sessions.id
from sessions
join clubs on clubs.id = sessions.club_id
where clubs.slug = 'reading-sai'
order by sessions.created_at desc
limit 1;
`).trim().split("\n").at(-1)!;

  await page.goto(`/clubs/reading-sai/app/sessions/${sessionId}`);
  await expect(page.locator(".desktop-only .rm-workspace-switch")).toHaveAttribute(
    "href",
    `/clubs/reading-sai/app/host/sessions/${sessionId}`,
  );
  await page.locator(".desktop-only .rm-workspace-switch").click();
  await expect(page).toHaveURL(`/clubs/reading-sai/app/host/sessions/${sessionId}`);
});

test("same-meeting role switching replaces an unavailable member counterpart with a safe archive target", async ({ page }) => {
  await loginWithGoogleFixture(page, "host@example.com");
  const sessionId = runMysql(`
select sessions.id
from sessions
join clubs on clubs.id = sessions.club_id
where clubs.slug = 'reading-sai' and sessions.state = 'PUBLISHED'
order by sessions.created_at desc
limit 1;
`).trim().split("\n").at(-1)!;

  runMysql(`update sessions set state = 'OPEN', updated_at = utc_timestamp(6) where id = '${sessionId}';`);
  try {
    await page.goto(`/clubs/reading-sai/app/host/sessions/${sessionId}`);
    await expect(page.locator(".desktop-only .rm-workspace-switch")).toHaveAttribute(
      "href",
      `/clubs/reading-sai/app/sessions/${sessionId}`,
    );
    await page.locator(".desktop-only .rm-workspace-switch").click();
    await expect(page).toHaveURL("/clubs/reading-sai/app/archive");
  } finally {
    runMysql(`update sessions set state = 'PUBLISHED', updated_at = utc_timestamp(6) where id = '${sessionId}';`);
  }
});

test("revoked host authority replaces the host route with the member-safe route", async ({ page }) => {
  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto("/clubs/reading-sai/app");
  await page.locator(".desktop-only .rm-workspace-switch").click();
  await expect(page).toHaveURL(/\/clubs\/reading-sai\/app\/host(?:\/sessions\/[^/]+)?$/);

  runMysql(`
update memberships
join users on users.id = memberships.user_id
join clubs on clubs.id = memberships.club_id
set memberships.role = 'MEMBER', memberships.updated_at = utc_timestamp(6)
where lower(users.email) = 'host@example.com' and clubs.slug = 'reading-sai';
  `);
  await page.reload();
  await expect(page).toHaveURL("/clubs/reading-sai/app");
  await page.goBack();
  await expect(page).toHaveURL("/clubs/reading-sai/app");
  expect(page.url()).not.toContain("/host");
});

test("club-scoped invite acceptance activates only the target club", async ({ page }) => {
  const inviteToken = createSecondClubInviteFixture(secondClubInviteEmail);

  await page.goto(`/clubs/sample-book-club/invite/${inviteToken}`);
  await expect(page.getByText("샘플 초대 멤버").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Google로 초대 수락" })).toHaveAttribute(
    "href",
    `/oauth2/authorization/google?inviteToken=${encodeURIComponent(inviteToken)}&returnTo=${encodeURIComponent(
      `/clubs/sample-book-club/invite/${inviteToken}`,
    )}`,
  );

  await loginWithGoogleFixture(page, secondClubInviteEmail, { inviteToken });

  const authState = await page.evaluate(async () => {
    const [sampleClub, readingSai] = await Promise.all([
      fetch("/api/bff/api/auth/me?clubSlug=sample-book-club", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/bff/api/auth/me?clubSlug=reading-sai", { cache: "no-store" }).then((response) => response.json()),
    ]);
    return { sampleClub, readingSai };
  });

  expect(authState.sampleClub.currentMembership.clubSlug).toBe("sample-book-club");
  expect(authState.sampleClub.currentMembership.membershipStatus).toBe("ACTIVE");
  expect(authState.sampleClub.currentMembership.role).toBe("MEMBER");
  expect(authState.readingSai.currentMembership).toBeNull();
  expect(authState.readingSai.joinedClubs.map((club: { clubSlug: string }) => club.clubSlug)).toEqual([
    "sample-book-club",
  ]);
});
