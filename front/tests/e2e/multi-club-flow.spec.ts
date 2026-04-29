import { expect, test } from "@playwright/test";
import {
  cleanupSecondClubFixture,
  cleanupSecondClubInvitedMembers,
  createSecondClubInviteFixture,
  ensureSecondClubFixture,
  loginWithGoogleFixture,
  resetSeedGoogleLogins,
} from "./readmates-e2e-db";

const secondClubInviteEmail = "sample.club.invited@example.com";

test.beforeEach(() => {
  ensureSecondClubFixture();
  resetSeedGoogleLogins(["host@example.com", secondClubInviteEmail]);
});

test.afterEach(() => {
  cleanupSecondClubInvitedMembers([secondClubInviteEmail]);
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

test("user with multiple joined clubs chooses an entry club from the shared session", async ({ page }) => {
  await loginWithGoogleFixture(page, "host@example.com");

  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "클럽을 선택하세요" })).toBeVisible();

  await page.getByRole("link", { name: /샘플 북클럽/ }).click();
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

  await page.goto("/app");
  await page.getByRole("link", { name: /읽는사이/ }).click();
  await expect(page).toHaveURL(/\/clubs\/reading-sai\/app$/);

  const readingSaiAuth = await page.evaluate(async () => {
    const response = await fetch("/api/bff/api/auth/me?clubSlug=reading-sai", { cache: "no-store" });
    return response.json();
  });

  expect(readingSaiAuth.currentMembership.clubSlug).toBe("reading-sai");
  expect(readingSaiAuth.currentMembership.role).toBe("HOST");

  await page.getByLabel("클럽 전환").selectOption("sample-book-club");

  await expect(page).toHaveURL(/\/clubs\/sample-book-club\/app$/);
  const sampleClubAuth = await page.evaluate(async () => {
    const response = await fetch("/api/bff/api/auth/me?clubSlug=sample-book-club", { cache: "no-store" });
    return response.json();
  });

  expect(sampleClubAuth.currentMembership.clubSlug).toBe("sample-book-club");
  expect(sampleClubAuth.currentMembership.role).toBe("MEMBER");
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
