import { expect, test } from "@playwright/test";
import {
  cleanupSecondClubFixture,
  ensureSecondClubFixture,
  loginWithGoogleFixture,
  resetSeedGoogleLogins,
} from "./readmates-e2e-db";

test.beforeEach(() => {
  ensureSecondClubFixture();
  resetSeedGoogleLogins(["host@example.com"]);
});

test.afterEach(() => {
  cleanupSecondClubFixture();
  resetSeedGoogleLogins(["host@example.com"]);
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
