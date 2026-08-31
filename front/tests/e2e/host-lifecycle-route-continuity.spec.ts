import { expect, test, type Page } from "@playwright/test";
import {
  loginWithGoogleFixture,
  resetSeedGoogleLogins,
  runMysql,
} from "./readmates-e2e-db";
import {
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
