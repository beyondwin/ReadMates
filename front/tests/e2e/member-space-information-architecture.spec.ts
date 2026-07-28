import { expect, test, type Locator } from "@playwright/test";
import { mockMyReadingShelfJourney } from "./my-reading-shelf-fixtures";
import {
  loginWithGoogleFixture,
  resetSeedGoogleLogins,
} from "./readmates-e2e-db";

const memberEmail = "member1@example.com";
const scopedAppPath = "/clubs/reading-sai/app";

async function expectPracticalTapTarget(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);
}

test.beforeEach(() => {
  resetSeedGoogleLogins([memberEmail]);
});

test.afterEach(() => {
  resetSeedGoogleLogins([memberEmail]);
});

test("member shelf previews three books and opens the full personal history", async ({
  page,
}) => {
  await mockMyReadingShelfJourney(page, "fifteen-records");
  await loginWithGoogleFixture(page, memberEmail);
  await page.goto("/app/me");

  await expect(page.getByRole("heading", {
    level: 1,
    name: "나의 서재",
  })).toBeVisible();
  const previewRows = page.locator(".rm-my-shelf").getByRole("article");
  await expect(previewRows).toHaveCount(3);
  await expect(previewRows.filter({
    hasText: /질문 \d+|서평 \d+/,
  })).toHaveCount(0);
  await expect(page.getByRole("button", {
    name: "계정·알림 설정",
  })).toHaveCount(0);

  await page.getByRole("link", {
    name: "내 기록 전체 보기",
  }).click();
  await expect(page).toHaveURL(/\/app\/me\/records$/);
  const fullRows = page.locator(".rm-my-records-journey").getByRole("article");
  await expect(fullRows).toHaveCount(12);
  await page.getByRole("button", {
    name: "기록 더 보기",
  }).click();
  await expect(fullRows).toHaveCount(15);
  await expect(page.getByRole("button", {
    name: "기록 더 보기",
  })).toHaveCount(0);
});

test("personal record rows preserve three-column geometry and practical action targets", async ({
  page,
}) => {
  await mockMyReadingShelfJourney(page, "fifteen-records");
  await loginWithGoogleFixture(page, memberEmail);

  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/app/me");

    const rows = page.locator(".rm-my-shelf .rm-book-record-row");
    await expect(rows).toHaveCount(3);

    for (let index = 0; index < await rows.count(); index += 1) {
      const row = rows.nth(index);
      const geometry = await row.evaluate((element) => {
        const cover = element.querySelector<HTMLElement>(
          ".rm-book-record-row__cover",
        )!.getBoundingClientRect();
        const book = element.querySelector<HTMLElement>(
          ".rm-book-record-row__book",
        )!.getBoundingClientRect();
        const actions = element.querySelector<HTMLElement>(
          ".rm-book-record-row__actions",
        )!.getBoundingClientRect();
        return {
          rowScrollWidth: element.scrollWidth,
          rowClientWidth: element.clientWidth,
          coverRight: cover.right,
          bookLeft: book.left,
          bookRight: book.right,
          actionsLeft: actions.left,
        };
      });

      expect(geometry.rowScrollWidth).toBeLessThanOrEqual(
        geometry.rowClientWidth,
      );
      expect(geometry.coverRight).toBeLessThanOrEqual(geometry.bookLeft);
      expect(geometry.bookRight).toBeLessThanOrEqual(geometry.actionsLeft);

      const actionLinks = row.locator(".rm-book-record-row__actions a");
      await expect(actionLinks).toHaveCount(2);
      await expectPracticalTapTarget(actionLinks.nth(0));
      await expectPracticalTapTarget(actionLinks.nth(1));
    }
  }
});

test("club-scoped account and notification routes preserve navigation current state and history", async ({
  page,
}) => {
  await loginWithGoogleFixture(page, memberEmail);
  await page.goto(`${scopedAppPath}/me`);

  await page.getByRole("button", { name: /계정 메뉴$/ }).click();
  await page.getByRole("link", { name: "계정 관리" }).click();
  await expect(page).toHaveURL(new RegExp(`${scopedAppPath}/me/settings$`));

  const appNavigation = page.getByRole("navigation", {
    name: "앱 내비게이션",
  });
  await expect(appNavigation.getByRole("link", {
    name: "내 공간",
  })).toHaveAttribute("aria-current", "page");

  await appNavigation.getByRole("link", { name: "알림" }).click();
  await expect(page).toHaveURL(new RegExp(`${scopedAppPath}/notifications$`));
  await expect(appNavigation.getByRole("link", {
    name: "알림",
  })).toHaveAttribute("aria-current", "page");

  const notificationTabs = page.getByRole("navigation", {
    name: "알림 보기",
  });
  await expect(notificationTabs.getByRole("link", {
    name: "받은 알림",
  })).toHaveAttribute("aria-current", "page");
  await notificationTabs.getByRole("link", { name: "수신 설정" }).click();
  await expect(page).toHaveURL(
    new RegExp(`${scopedAppPath}/notifications/settings$`),
  );
  await expect(notificationTabs.getByRole("link", {
    name: "수신 설정",
  })).toHaveAttribute("aria-current", "page");
  await expect(appNavigation.getByRole("link", {
    name: "알림",
  })).toHaveAttribute("aria-current", "page");

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${scopedAppPath}/notifications$`));
  await expect(page.getByRole("navigation", {
    name: "알림 보기",
  }).getByRole("link", {
    name: "받은 알림",
  })).toHaveAttribute("aria-current", "page");
});
