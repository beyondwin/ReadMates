import { expect, test, type Dialog, type Page } from "@playwright/test";
import { hostMeetingUrlPattern, loginWithGoogleFixture, resetE2eState } from "./readmates-e2e-db";

test.describe.configure({ mode: "serial" });

const invitedEmail = "e2e.invited@example.com";
const appOrigin = `http://localhost:${process.env.PLAYWRIGHT_PORT ?? 3100}`;
const hostMeetingPath = hostMeetingUrlPattern;

function resetSessionFlowState() {
  resetE2eState({
    cleanupGeneratedSessions: true,
    invitedEmails: [invitedEmail],
    googleLoginEmails: ["host@example.com", "member1@example.com", "member5@example.com"],
  });
}

function expectedGoogleInviteHref(inviteUrl: string) {
  const url = new URL(inviteUrl, appOrigin);
  const token = url.pathname.split("/").pop() ?? "";
  return `/oauth2/authorization/google?inviteToken=${encodeURIComponent(token)}&returnTo=${encodeURIComponent(url.pathname)}`;
}

async function loginAsDevAccount(page: Page, accountName: RegExp) {
  await page.goto("/login");
  await page.getByRole("button", { name: accountName }).click();
  await expect(page).toHaveURL(/\/app\/?$/);
}

async function expectCanonicalMeetingUrl(page: Page) {
  await expect(page).toHaveURL(hostMeetingPath);
  expect(new URL(page.url()).pathname).not.toMatch(/\/edit\/?$/);
}

async function fillNewMeetingBasics(
  page: Page,
  input: { title: string; bookTitle: string; author: string; date: string },
) {
  await page.getByRole("tab", { name: "기본 정보" }).click();
  await page.getByLabel("세션 제목").fill(input.title);
  await page.getByLabel("책 제목").fill(input.bookTitle);
  await page.getByLabel("저자").fill(input.author);
  await page.getByLabel("모임 날짜").fill(input.date);
  await page.getByRole("button", { name: "세션 문서 저장" }).click();
  await expectCanonicalMeetingUrl(page);
}

async function dismissNextBookNoticeIfPresent(page: Page) {
  const notify = page.getByRole("dialog", { name: "알림 보내기" });
  if (await notify.isVisible()) {
    await notify.getByRole("button", { name: "이번에는 보내지 않기" }).click();
    await expect(notify).toBeHidden();
  }
}

async function confirmLifecycle(page: Page, name: string, pathIncludes: string) {
  const nativeDialogs: string[] = [];
  const onDialog = (dialog: Dialog) => {
    nativeDialogs.push(dialog.type());
    void dialog.dismiss();
  };
  page.on("dialog", onDialog);
  try {
    await page.getByRole("button", { name }).click();
    const dialog = page.getByRole("dialog", { name });
    await expect(dialog).toBeVisible();
    expect(nativeDialogs).toEqual([]);
    const response = page.waitForResponse(
      (res) =>
        res.url().includes("/api/bff/api/host/sessions/")
        && res.url().includes(pathIncludes)
        && res.status() === 200,
    );
    await dialog.getByRole("button", { name }).click();
    await response;
    await expect(dialog).toBeHidden();
  } finally {
    page.off("dialog", onDialog);
  }
}

async function openMeetingForMembers(page: Page) {
  await confirmLifecycle(page, "멤버에게 열기", "/open");
  await expectCanonicalMeetingUrl(page);
}

async function createOpenMeetingThroughUi(
  page: Page,
  input: { title: string; bookTitle: string; author: string; date: string },
) {
  await page.goto("/app/host/sessions/new");
  await fillNewMeetingBasics(page, input);
  await openMeetingForMembers(page);
}

test.beforeEach(() => {
  resetSessionFlowState();
});

test.afterEach(() => {
  resetSessionFlowState();
});

test("host creates member-visible upcoming session then starts it", async ({ page }) => {
  await loginAsDevAccount(page, /호스트/);
  await page.goto("/app/host");
  await expectCanonicalMeetingUrl(page);

  await page.getByRole("button", { name: "모임 하나 더" }).click();
  await page.getByLabel("책 제목").fill("E2E 예정 책");
  await page.getByLabel("저자").fill("E2E 저자");
  await page.getByLabel("모임 날짜").fill("2026-05-20");
  const visibilitySwitch = page.getByRole("switch", { name: "새 모임 멤버에게 보이기" });
  if (!(await visibilitySwitch.isChecked())) {
    await visibilitySwitch.check();
  }
  const createResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST"
      && response.url().includes("/api/bff/api/host/sessions")
      && !response.url().includes("/sessions/")
      && response.ok(),
  );
  await page.getByRole("button", { name: "목록에 넣기" }).click();
  expect((await createResponse).ok()).toBe(true);
  await expect(page.getByText("E2E 예정 책")).toBeVisible();
  await dismissNextBookNoticeIfPresent(page);

  await loginAsDevAccount(page, /멤버1/);
  await page.goto("/app");
  await expect(page.locator(".rm-member-home-desktop").getByText("E2E 예정 책").first()).toBeVisible();

  await loginAsDevAccount(page, /호스트/);
  await page.goto("/app/host");
  await expectCanonicalMeetingUrl(page);
  await expect(page.getByRole("button", { name: "멤버에게 열기" })).toBeVisible();
  await openMeetingForMembers(page);

  await page.goto("/app/session/current");
  await expect(
    page.locator(".rm-current-session-desktop").getByRole("heading", { level: 1, name: "E2E 예정 책" }),
  ).toBeVisible();

  await loginAsDevAccount(page, /멤버1/);
  await page.goto("/app");
  await expect(page.locator(".rm-member-home-desktop").getByText("RSVP를 먼저 선택해 주세요.")).toBeVisible();
  await page.goto("/app/session/current");
  const currentSessionDesktop = page.locator(".rm-current-session-desktop");
  await expect(currentSessionDesktop.getByText("멤버 준비 필요")).toBeVisible();
  await expect(currentSessionDesktop.getByText("RSVP를 먼저 선택하고, 읽기 진행률과 질문을 이어서 정리합니다.")).toBeVisible();

  await loginAsDevAccount(page, /호스트/);
  await page.goto("/app/host");
  await expectCanonicalMeetingUrl(page);
  await confirmLifecycle(page, "모임 마치기", "/close");
  await expect(page.getByRole("heading", { name: /모임을 마쳤습니다/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "정리본 올리기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "모임 하나 더" })).toBeVisible();
});

test("host creates session seven and member sees current session", async ({ page }) => {
  await loginWithGoogleFixture(page, "host@example.com");

  await createOpenMeetingThroughUi(page, {
    title: "7회차 모임 · 테스트 책",
    bookTitle: "테스트 책",
    author: "테스트 저자",
    date: "2026-05-20",
  });
  await page.goto("/app/session/current");
  await expect(page.getByRole("heading", { level: 1, name: "테스트 책" })).toBeVisible();
  await expect(page.getByRole("link", { name: "호스트 화면" })).toHaveAttribute("href", "/app/host");

  await page.getByRole("link", { name: "호스트 화면" }).click();
  await expectCanonicalMeetingUrl(page);
  await page.getByRole("link", { name: "멤버 화면으로" }).first().click();
  await expect(page).toHaveURL(/\/app$/);

  await loginWithGoogleFixture(page, "member5@example.com");
  await page.goto("/app/session/current");
  await expect(page.getByRole("heading", { level: 1, name: "테스트 책" })).toBeVisible();
  const rsvpResponse = page.waitForResponse(
    (response) => response.url().includes("/api/bff/api/sessions/current/rsvp") && response.status() === 200,
  );
  await page.getByRole("button", { name: "참석" }).click();
  await rsvpResponse;
});

test("host invites a new member and invite page uses Google acceptance", async ({ page }) => {
  await loginWithGoogleFixture(page, "host@example.com");

  await createOpenMeetingThroughUi(page, {
    title: "7회차 모임 · 초대 테스트 책",
    bookTitle: "초대 테스트 책",
    author: "초대 테스트 저자",
    date: "2026-05-20",
  });

  await page.goto("/app/host/invitations");
  await page.getByLabel("이름").fill("초대테스트");
  await page.getByLabel("초대 이메일").fill(invitedEmail);
  await page.getByRole("button", { name: "초대 링크 만들기" }).click();
  const inviteUrl = await page.getByLabel("생성된 초대 링크").inputValue();

  await page.evaluate(async () => {
    const response = await fetch("/api/bff/api/auth/logout", { method: "POST" });
    if (!response.ok) {
      throw new Error(`Logout failed: ${response.status}`);
    }
  });

  await page.goto(inviteUrl);
  await expect(page.getByText("초대테스트")).toBeVisible();
  await expect(page.getByText(invitedEmail, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Google로 초대 수락" })).toHaveAttribute(
    "href",
    expectedGoogleInviteHref(inviteUrl),
  );
  await expect(page.getByLabel("비밀번호", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("비밀번호 확인", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "초대 수락" })).toHaveCount(0);

  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto("/app/host/invitations");
  await expect(page.getByText("초대테스트")).toBeVisible();
  await expect(page.getByText(invitedEmail)).toBeVisible();
  await expect(page.getByText(`${invitedEmail} · 만료`)).toBeVisible();
});
