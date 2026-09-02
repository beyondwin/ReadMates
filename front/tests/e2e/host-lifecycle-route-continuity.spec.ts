import { expect, test, type Page } from "@playwright/test";
import { isSemanticDocumentOrder } from "./support/approved-mockup-contract";
import {
  loginWithGoogleFixture,
  resetSeedGoogleLogins,
  runMysql,
} from "./readmates-e2e-db";
import {
  VISUAL_AUTHORITY_VIEWPORTS,
  expectMinimumTargetSize,
  expectNoHorizontalOverflow,
  expectNoSeriousAccessibilityFindings,
} from "./support/visual-authority-contract";

test.describe.configure({ mode: "serial" });

const CLUB_SLUG = "reading-sai";
const MEMBER_APP_PATH = `/clubs/${CLUB_SLUG}/app`;
const HOST_PATH = `${MEMBER_APP_PATH}/host`;

function browserLocation(page: Page) {
  const url = new URL(page.url());
  return `${url.pathname}${url.search}${url.hash}`;
}

async function expectLocation(page: Page, expected: string) {
  await expect.poll(() => browserLocation(page)).toBe(expected);
}

async function expectReplaceRedirect(input: {
  page: Page;
  legacy: string;
  pathname: string;
  search: string;
  hash: string;
}) {
  await input.page.goto(MEMBER_APP_PATH);
  await input.page.goto(input.legacy);
  await expect.poll(() => new URL(input.page.url()).pathname).toBe(input.pathname);
  const destination = new URL(input.page.url());
  expect(destination.search).toBe(input.search);
  expect(destination.hash).toBe(input.hash);
  await expectNoHorizontalOverflow(input.page);

  await input.page.goBack();
  await expectLocation(input.page, MEMBER_APP_PATH);
  await input.page.goForward();
  await expect.poll(() => new URL(input.page.url()).pathname).toBe(input.pathname);
  expect(new URL(input.page.url()).search).toBe(input.search);
  expect(new URL(input.page.url()).hash).toBe(input.hash);
}

test.beforeEach(() => {
  resetSeedGoogleLogins(["host@example.com"]);
});

test.afterEach(() => {
  resetSeedGoogleLogins(["host@example.com"]);
});

test("scoped and unscoped host entries retain canonical records and non-current deep links", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await loginWithGoogleFixture(page, "host@example.com");

  await page.goto(`${HOST_PATH}/records?view=all#records-heading`);
  await expectLocation(page, `${HOST_PATH}/records?view=all#records-heading`);
  await expect(page.getByRole("heading", { level: 1, name: "기록" })).toBeVisible();

  await page.goto("/app/host/records?view=closed#records-heading");
  await expectLocation(page, `${HOST_PATH}/records?view=closed#records-heading`);
  await expect(page.getByRole("heading", { level: 1, name: "기록" })).toBeVisible();

  const nonCurrentSessionId = runMysql(`
select sessions.id
from sessions
join clubs on clubs.id = sessions.club_id
where clubs.slug = 'reading-sai'
  and sessions.state = 'PUBLISHED'
order by sessions.session_date asc, sessions.id asc
limit 1;
`).trim().split("\n").at(-1);
  expect(nonCurrentSessionId).toBeTruthy();

  await page.goto(`/app/host/sessions/${nonCurrentSessionId}?section=history#version-ledger`);
  await expectLocation(
    page,
    `${HOST_PATH}/sessions/${nonCurrentSessionId}?section=history#version-ledger`,
  );
  await expect(page.locator(".rm-host-session-workspace")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect(await expectNoSeriousAccessibilityFindings(page)).toEqual([]);
});

test("all three legacy host routes replace once and keep public-safe query and hash state", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await loginWithGoogleFixture(page, "host@example.com");

  await expectReplaceRedirect({
    page,
    legacy: "/app/host/members?status=active#member-7",
    pathname: `${HOST_PATH}/people`,
    search: "?status=active",
    hash: "#member-7",
  });
  await expectReplaceRedirect({
    page,
    legacy: "/app/host/invitations?status=pending#obsolete-invitations",
    pathname: `${HOST_PATH}/settings`,
    search: "?status=pending",
    hash: "#invitations",
  });
  await expectReplaceRedirect({
    page,
    legacy: "/app/host/operations?panel=ops#current-work",
    pathname: HOST_PATH,
    search: "?panel=ops",
    hash: "#current-work",
  });
});

test("prep live and closing stay on one current meeting with a single mobile primary", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await loginWithGoogleFixture(page, "host@example.com");

  await page.goto(`${HOST_PATH}?phase=prep`);
  const currentMeeting = page.getByRole("group", { name: "현재 모임" });
  const emptyRoom = page.getByRole("region", { name: "현재 운영할 모임이 없습니다" });
  const workbox = page.getByRole("complementary", { name: "클럽 작업함" });
  await expect(workbox).toBeVisible();
  if (await currentMeeting.count()) {
    await expect(currentMeeting).toBeVisible();
    await expect(page.getByRole("navigation", { name: "모임 운영 단계" })).toBeVisible();
    await expect(page.getByRole("region", { name: "다음에 할 일" })).toBeVisible();
    expect(await isSemanticDocumentOrder([
      currentMeeting,
      page.getByRole("navigation", { name: "모임 운영 단계" }),
      page.getByRole("region", { name: "다음에 할 일" }),
      workbox,
    ])).toBe(true);
    await page.getByRole("tab", { name: /현장/ }).click();
    await expect(page).toHaveURL(/phase=live/);
    await expect(currentMeeting).toBeVisible();
    await page.getByRole("tab", { name: /마감실/ }).click();
    await expect(page).toHaveURL(/phase=closing/);
    await expect(currentMeeting).toBeVisible();
    await page.getByRole("tab", { name: /준비실/ }).click();
    await expect(page).toHaveURL(/phase=prep/);
  } else {
    await expect(emptyRoom).toBeVisible();
    await expect(page.getByRole("link", { name: "첫 모임 만들기" })).toHaveCount(1);
  }
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize(VISUAL_AUTHORITY_VIEWPORTS.mobile);
  await page.goto(`${HOST_PATH}?phase=prep`);
  const primary = page.locator(".rm-operating-room-next-action__primary");
  await expect(primary).toHaveCount(1);
  await expectMinimumTargetSize(primary);
  const box = await primary.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y + Math.min(box!.height, 44)).toBeLessThanOrEqual(VISUAL_AUTHORITY_VIEWPORTS.mobile.height);
  await expectNoHorizontalOverflow(page);
  expect(await expectNoSeriousAccessibilityFindings(page)).toEqual([]);
});
