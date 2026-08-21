import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import {
  cleanupGeneratedSessions,
  createHostSessionFixture,
  createOpenSessionFixture,
  expireHostSessionTrash,
  loginWithGoogleFixture,
  resetSeedGoogleLogins,
  runMysql,
} from "./readmates-e2e-db";

test.describe.configure({ mode: "serial" });

const HOST_DASHBOARD_FIXED_TIME = new Date("2026-08-01T12:00:00+09:00");
const CLUB_SLUG = "reading-sai";
const HOST_PATH = `/clubs/${CLUB_SLUG}/app/host`;
const VIEWPORTS = [
  { name: "mobile-320", width: 320, height: 844 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1280", width: 1280, height: 720 },
] as const;

function matchesExactBffUrl(
  url: URL,
  pathname: string,
  allowedSearchParams: ReadonlyArray<Readonly<Record<string, string>>>,
): boolean {
  if (url.pathname !== pathname) {
    return false;
  }

  return allowedSearchParams.some((expected) => {
    const entries = Array.from(url.searchParams.entries());
    return entries.length === Object.keys(expected).length
      && Object.entries(expected).every(([key, value]) => url.searchParams.get(key) === value);
  });
}

async function routeHostClubOperations(page: Page): Promise<void> {
  await page.route((url) => matchesExactBffUrl(
    url,
    "/api/bff/api/host/club-operations",
    [{}, { clubSlug: "reading-sai" }],
  ), async (route) => {
    expect(route.request().method()).toBe("GET");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schema: "host.club_operations_snapshot.v1",
        generatedAt: "2026-05-31T00:00:00Z",
        club: { clubId: "club-1", slug: "club-one", name: "Club One" },
        readiness: { state: "READY", blockingReasons: [], nextAction: null },
        sessionProgress: {
          upcomingCount: 1,
          currentOpenCount: 1,
          closedCount: 4,
          publishedRecordCount: 3,
          incompleteRecordCount: 1,
        },
        aiUsage: {
          activeJobs: 1,
          failedRecentJobs: 3,
          staleCandidates: 0,
          costEstimateUsd: "0.5000",
          state: "DEGRADED",
          priorFailedJobs7d: 1,
        },
      }),
    });
  });
}

async function routeHostDashboardPublicSafe(page: Page): Promise<void> {
  await page.route((url) => matchesExactBffUrl(
    url,
    "/api/bff/api/host/dashboard",
    [{}, { clubSlug: "reading-sai" }],
  ), async (route) => {
    expect(route.request().method()).toBe("GET");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        rsvpPending: 0,
        checkinMissing: 0,
        publishPending: 0,
        feedbackPending: 0,
        currentSessionMissingMemberCount: 0,
        currentSessionMissingMembers: [],
      }),
    });
  });
}

async function routeEmptyCurrentSession(page: Page): Promise<void> {
  await page.route((url) => matchesExactBffUrl(
    url,
    "/api/bff/api/sessions/current",
    [{}, { clubSlug: "reading-sai" }],
  ), async (route) => {
    expect(route.request().method()).toBe("GET");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ currentSession: null }),
    });
  });
}

async function expectNoHostPrivateSentinels(page: Page): Promise<void> {
  await expect(page.getByText("member1@example.com")).toHaveCount(0);
  await expect(page.getByText("ADMIN_ROUTE")).toHaveCount(0);
  await expect(page.getByText("private.example.com")).toHaveCount(0);
  await expect(page.getByText("{\"")).toHaveCount(0);
}

async function expectHostMeetingLedgerPublicSafe(page: Page): Promise<void> {
  const ledgerHeading = page.getByRole("heading", { name: /지금 다루는 모임|아직 열린 모임이 없습니다/ });
  const workspace = page.locator(".rm-host-session-workspace");
  await expect(ledgerHeading.or(workspace)).toBeVisible();
  await expect(page.getByText("member1@example.com")).toHaveCount(0);
  await expectNoHostPrivateSentinels(page);
}

function visibleButton(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true }).filter({ visible: true });
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function expectNoLegacyEditorChrome(page: Page): Promise<void> {
  await expect(page.locator(".rm-host-session-editor__overview")).toHaveCount(0);
  await expect(page.locator(".rm-host-session-editor__aside")).toHaveCount(0);
  await expect(page.getByRole("tablist", { name: "호스트 편집 섹션" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "개요" })).toHaveCount(0);
}

async function expectOneMainAndOrderedHeadings(page: Page): Promise<void> {
  const headingLevels = await page.evaluate(() => {
    const mains = Array.from(document.querySelectorAll("main"));
    const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"))
      .filter((node) => !(node as HTMLElement).closest("[hidden]"))
      .map((node) => Number(node.tagName.slice(1)));
    return { mainCount: mains.length, headingLevels: headings };
  });
  expect(headingLevels.mainCount).toBe(1);
  expect(headingLevels.headingLevels[0]).toBe(1);
  for (let index = 1; index < headingLevels.headingLevels.length; index += 1) {
    expect(headingLevels.headingLevels[index]! - headingLevels.headingLevels[index - 1]!)
      .toBeLessThanOrEqual(1);
  }
}

async function closeWorkspaceSheet(page: Page, name: "모임 정보" | "변경 내역"): Promise<void> {
  const sheet = page.getByRole("dialog", { name });
  const trigger = page.getByRole("button", { name });
  const backdrop = page.locator(".rm-host-session-workspace__sheet-backdrop");
  const expanded = (await trigger.getAttribute("aria-expanded")) === "true";
  if (expanded || await sheet.isVisible()) {
    const collapse = sheet.getByRole("button", { name: "접기" });
    if (await collapse.isVisible().catch(() => false)) {
      await collapse.click();
    } else {
      await page.keyboard.press("Escape");
    }
    await expect(sheet).toBeHidden();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  }
  if (name === "모임 정보") {
    await expect(backdrop).toBeHidden();
  }
}

async function tabUntilFocused(page: Page, locator: Locator, maxTabs = 48): Promise<void> {
  for (let index = 0; index < maxTabs; index += 1) {
    if (await locator.evaluate((element) => element === document.activeElement).catch(() => false)) {
      return;
    }
    await page.keyboard.press("Tab");
  }
  const active = await page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    if (!element) {
      return "null";
    }
    return `${element.tagName.toLowerCase()} ${(element.getAttribute("aria-label") ?? element.textContent ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 48)}`;
  });
  throw new Error(`Tab did not reach the expected control; active=${active}`);
}

async function expectVisibleFocus(page: Page, locator: Locator): Promise<void> {
  await expect(locator).toBeFocused();
  const focusVisible = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return style.outlineWidth !== "0px" || style.boxShadow !== "none";
  });
  expect(focusVisible).toBe(true);
}

async function expectDialogFitsViewport(page: Page, dialog: Locator): Promise<void> {
  await expect(dialog).toBeVisible();
  const metrics = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      right: rect.right,
      bottom: rect.bottom,
      width: window.innerWidth,
      height: window.innerHeight,
    };
  });
  expect(metrics.x).toBeGreaterThanOrEqual(-1);
  expect(metrics.y).toBeGreaterThanOrEqual(-1);
  expect(metrics.right).toBeLessThanOrEqual(metrics.width + 1);
  expect(metrics.bottom).toBeLessThanOrEqual(metrics.height + 1);
}

async function expectFocusedContentNotCoveredByStickyCta(page: Page, control: Locator): Promise<void> {
  const dropzone = page.locator("label.rm-session-import-drop");
  await dropzone.scrollIntoViewIfNeeded();
  await dropzone.click();
  await expect(control).toBeFocused();
  const sticky = page.locator(".rm-host-session-workspace__footer-cta");
  const controlBox = await dropzone.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      y: rect.y,
      bottom: rect.bottom,
      height: window.innerHeight,
    };
  });
  expect(controlBox.y).toBeGreaterThanOrEqual(0);
  expect(controlBox.bottom).toBeLessThanOrEqual(controlBox.height);
  await expect(sticky).toBeHidden();
}

function sessionState(sessionId: string): string {
  return runMysql(`select state from sessions where id = '${sessionId}';`)
    .trim()
    .split("\n")
    .at(-1) ?? "";
}

async function openWorkspace(page: Page, sessionId: string): Promise<void> {
  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto(`${HOST_PATH}/sessions/${sessionId}`);
  await expect(page.locator("main.rm-host-session-editor")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/sessions/${sessionId}/?`));
}

async function openBasicSheet(page: Page): Promise<void> {
  const sheet = page.getByRole("dialog", { name: "모임 정보" });
  if (await sheet.isVisible()) {
    return;
  }
  await page.getByRole("button", { name: "모임 정보" }).click();
  await expect(sheet).toBeVisible();
}

async function confirmLifecycle(
  page: Page,
  dialogName: string,
  confirmLabel: string,
  reasonLabel?: string,
): Promise<void> {
  const dialog = page.getByRole("dialog", { name: dialogName });
  await expect(dialog).toBeVisible();
  if (reasonLabel) {
    await dialog.getByLabel("변경 사유").selectOption({ label: reasonLabel });
  }
  await dialog.getByRole("button", { name: confirmLabel }).click();
  await expect(dialog).toBeHidden();
}

async function captureWorkspaceViewport(
  page: Page,
  testInfo: TestInfo,
  prefix: string,
): Promise<void> {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await expect(page.locator(".rm-host-session-workspace")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    if (viewport.width >= 1280) {
      await expectNoLegacyEditorChrome(page);
    }
    const screenshot = await page.screenshot({
      path: testInfo.outputPath(`${prefix}-${viewport.name}.png`),
      fullPage: true,
    });
    expect(screenshot.byteLength).toBeGreaterThan(10_000);
  }
}

function sessionImportJson(sessionNumber: number, date: string) {
  return {
    format: "readmates-session-import:v1",
    session: {
      number: sessionNumber,
      bookTitle: "포커스 종료 책",
      meetingDate: date,
    },
    publication: { summary: "공개 가능한 포커스 워크스페이스 요약입니다." },
    highlights: [{ authorName: "김호스트", text: "공개 안전한 E2E 하이라이트" }],
    oneLineReviews: [{ authorName: "안멤버1", text: "공개 안전한 E2E 한줄평" }],
    feedbackDocument: {
      fileName: `session-${sessionNumber}-feedback.md`,
      markdown: `<!-- readmates-feedback:v1 -->

# 독서모임 ${sessionNumber}차 피드백

포커스 종료 책 · 2026.07.20

## 메타

- 일시: 2026.07.20 (월) · 20:00
- 책: 포커스 종료 책
- 참여자: 김호스트

## 관찰자 노트

공개 안전한 E2E 관찰 기록입니다.

## 참여자별 피드백

### 01. 김호스트

역할: 독서모임 참여자

#### 참여 스타일

질문의 전제를 확인하고 자신의 생각을 정리했습니다.

#### 실질 기여

- 핵심 논점을 공개 안전한 문장으로 정리했습니다.

#### 문제점과 자기모순

##### 1. 적용 범위를 더 구체화할 수 있습니다

- 핵심: 판단 기준을 제시했습니다.
- 근거: 공개 안전한 합성 근거입니다.
- 해석: 다음 대화에서 적용 조건을 덧붙일 수 있습니다.

#### 실천 과제

1. 다음 모임에서 적용 조건을 함께 말합니다.

#### 드러난 한 문장

> 공개 안전한 합성 문장입니다.

맥락: 논의를 정리하던 장면

주석: 실제 회원이나 대화 정보가 아닌 E2E fixture입니다.
`,
    },
  };
}

test.describe("host club operations hub", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(HOST_DASHBOARD_FIXED_TIME);
    cleanupGeneratedSessions();
    createOpenSessionFixture();
    resetSeedGoogleLogins(["host@example.com"]);
  });

  test.afterEach(() => {
    cleanupGeneratedSessions();
    resetSeedGoogleLogins(["host@example.com"]);
  });

  test("host home renders the meeting ledger without leaking admin-only signals", async ({ page }) => {
    await loginWithGoogleFixture(page, "host@example.com");
    await routeHostDashboardPublicSafe(page);
    await routeHostClubOperations(page);

    await page.goto("/app/host");
    await expect.poll(() => new URL(page.url()).pathname).toMatch(/\/app\/host(\/sessions\/[^/]+)?$/);
    await expectHostMeetingLedgerPublicSafe(page);
  });

  test("host home keeps meeting actions inside the scoped club workspace", async ({ page }) => {
    await loginWithGoogleFixture(page, "host@example.com");
    await routeHostDashboardPublicSafe(page);
    await routeHostClubOperations(page);

    await page.goto("/clubs/reading-sai/app/host");
    await expect.poll(() => new URL(page.url()).pathname).toMatch(/\/clubs\/reading-sai\/app\/host(\/sessions\/[^/]+)?$/);
    await expectHostMeetingLedgerPublicSafe(page);
    await expect(page.getByRole("link", { name: "멤버 화면으로" }).first()).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app",
    );
  });

  test("host meeting ledger captures public-safe visual evidence", async ({ page }, testInfo) => {
    await loginWithGoogleFixture(page, "host@example.com");
    await routeHostDashboardPublicSafe(page);
    await routeHostClubOperations(page);

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/clubs/reading-sai/app/host");
      await expect.poll(() => new URL(page.url()).pathname).toMatch(/\/clubs\/reading-sai\/app\/host(\/sessions\/[^/]+)?$/);
      await expectHostMeetingLedgerPublicSafe(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const screenshot = await page.screenshot({
        path: testInfo.outputPath(`host-dashboard-${viewport.name}.png`),
        fullPage: true,
      });
      expect(screenshot.byteLength).toBeGreaterThan(10_000);
    }
  });

  test("host operations hub stays public-safe without the retired dashboard page", async ({ page }) => {
    await loginWithGoogleFixture(page, "host@example.com");
    await routeHostClubOperations(page);

    await page.goto("/clubs/reading-sai/app/host/operations");
    await expect(page.getByRole("heading", { name: "운영 허브" })).toBeVisible();
    await expect(page.getByText("member1@example.com")).toHaveCount(0);
    await expectNoHostPrivateSentinels(page);
  });

  test("host empty meeting ledger stays public-safe at 320px", async ({ page }, testInfo) => {
    await loginWithGoogleFixture(page, "host@example.com");
    await routeHostDashboardPublicSafe(page);
    await routeHostClubOperations(page);
    await routeEmptyCurrentSession(page);
    await page.route((url) => matchesExactBffUrl(
      url,
      "/api/bff/api/host/sessions",
      [{ limit: "50" }, { limit: "50", clubSlug: "reading-sai" }],
    ), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], nextCursor: null }),
      });
    });
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto("/clubs/reading-sai/app/host");

    await expect(page.getByRole("heading", { name: "아직 열린 모임이 없습니다" })).toBeVisible();
    await expect(page.getByRole("link", { name: "첫 모임 만들기" })).toBeVisible();
    await expectNoHostPrivateSentinels(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const screenshot = await page.screenshot({
      path: testInfo.outputPath("host-dashboard-empty-320x844.png"),
      fullPage: true,
    });
    expect(screenshot.byteLength).toBeGreaterThan(10_000);
  });
});

test.describe("focus workspace recovery journey", () => {
  test.setTimeout(180_000);

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(HOST_DASHBOARD_FIXED_TIME);
    cleanupGeneratedSessions();
    resetSeedGoogleLogins(["host@example.com"]);
  });

  test.afterEach(() => {
    cleanupGeneratedSessions();
    resetSeedGoogleLogins(["host@example.com"]);
  });

  test("DRAFT workspace keeps one primary CTA and preserves a failed basic save", async ({ page }) => {
    const sessionId = createHostSessionFixture({
      number: 80,
      bookTitle: "포커스 작성 책",
      state: "DRAFT",
      date: "2026-08-20",
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    await openWorkspace(page, sessionId);

    await expect(page.getByText("모임 작성 중")).toBeVisible();
    await expect(visibleButton(page, "멤버와 준비 시작")).toHaveCount(1);
    await expectNoLegacyEditorChrome(page);
    await expectOneMainAndOrderedHeadings(page);

    await page.getByRole("button", { name: "모임 정보" }).click();
    const title = page.getByLabel("세션 제목");
    await expect(title).toBeVisible();
    const preservedTitle = "실패한 저장에도 남는 제목";
    await title.fill(preservedTitle);
    await page.route(
      (url) => url.pathname === `/api/bff/api/host/sessions/${sessionId}`
        && !url.pathname.endsWith("/restore"),
      async (route) => {
        if (route.request().method() === "PATCH") {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ code: "INTERNAL_ERROR", status: 500 }),
          });
          return;
        }
        await route.continue();
      },
    );
    await page.getByRole("button", { name: "기본 정보 저장" }).click();
    await expect(page.getByRole("alert")).toContainText("저장에 실패했습니다");
    await expect(title).toHaveValue(preservedTitle);
    await expectNoHostPrivateSentinels(page);
  });

  test("OPEN before the meeting date shows member-response guidance and does not auto-close", async ({ page }) => {
    const sessionId = createHostSessionFixture({
      number: 81,
      bookTitle: "포커스 준비 책",
      state: "OPEN",
      date: "2026-08-20",
      withParticipants: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await openWorkspace(page, sessionId);

    await expect(page.getByText("멤버와 준비 중")).toBeVisible();
    await expect(visibleButton(page, "멤버 응답 확인하기")).toHaveCount(1);
    await visibleButton(page, "멤버 응답 확인하기").click();
    await expect(page.getByRole("heading", { name: "참석 응답" })).toBeVisible();
    await expect(page.getByText("호스트 · RSVP 미응답")).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.getByText("멤버와 준비 중")).toBeVisible();
    await expect(page.getByText("기록 정리 중")).toHaveCount(0);
    const state = runMysql(`select state from sessions where id = '${sessionId}';`)
      .trim()
      .split("\n")
      .at(-1);
    expect(state).toBe("OPEN");
  });

  test("OPEN meeting day rolls back rejected attendance and finishes explicitly", async ({ page }) => {
    const sessionId = createHostSessionFixture({
      number: 82,
      bookTitle: "포커스 출석 책",
      state: "OPEN",
      date: "2026-08-01",
      withParticipants: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await openWorkspace(page, sessionId);

    await expect(visibleButton(page, "출석 확인하기")).toHaveCount(1);
    await visibleButton(page, "출석 확인하기").click();
    const attend = page.getByRole("button", { name: "호스트 참석" });
    await expect(attend).toBeVisible();
    await page.route(`**/api/bff/api/host/sessions/${sessionId}/attendance**`, async (route) => {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ code: "CONFLICT", status: 409 }),
      });
    });
    await attend.click();
    await expect(page.getByText("출석 저장에 실패했습니다. 다시 선택해 주세요")).toBeVisible();
    await expect(attend).toHaveAttribute("aria-pressed", "false");

    await page.unroute(`**/api/bff/api/host/sessions/${sessionId}/attendance**`);
    const attendButtons = page.getByRole("button", { name: /참석$/ });
    const attendCount = await attendButtons.count();
    for (let index = 0; index < attendCount; index += 1) {
      const button = attendButtons.nth(index);
      if ((await button.getAttribute("aria-pressed")) !== "true") {
        await button.click();
      }
    }
    await expect(attend).toHaveAttribute("aria-pressed", "true");
    await expect(visibleButton(page, "모임 마치기")).toHaveCount(1);
    await visibleButton(page, "모임 마치기").click();
    await confirmLifecycle(page, "모임 마치기", "모임 마치기");
    await expect(page.getByText("기록 정리 중")).toBeVisible();
  });

  test("CLOSED JSON upload previews, drafts, applies, and publishes in one workspace", async ({ page }) => {
    const sessionId = createHostSessionFixture({
      number: 83,
      bookTitle: "포커스 종료 책",
      state: "CLOSED",
      date: "2026-07-20",
      accessScope: "GUEST_READABLE",
      withParticipants: true,
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    await openWorkspace(page, sessionId);

    await expect(page.getByText("기록 정리 중")).toBeVisible();
    await visibleButton(page, "정리본 올리기").click();
    await expect(page.getByRole("heading", { name: "정리본" })).toBeVisible();
    await page.getByLabel("정리한 파일을 여기에 놓으세요").setInputFiles({
      name: "session-import.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(sessionImportJson(83, "2026-07-20"))),
    });
    const preview = page.getByRole("region", { name: "정리본 미리보기" });
    await expect(preview).toBeVisible();
    const guestReadable = page.getByRole("button", { name: "게스트와 멤버에게 보이기로 바꾸기" });
    if (await guestReadable.isVisible().catch(() => false)) {
      await guestReadable.click();
    }
    const importButton = page.getByRole("button", { name: "작성 중에 넣기" });
    await expect(importButton, await preview.innerText()).toBeEnabled();
    await importButton.click();
    const applyDialog = page.getByRole("dialog", { name: "반영 전 확인" });
    await expect(applyDialog).toBeVisible({ timeout: 15_000 });
    await expectDialogFitsViewport(page, applyDialog);
    const applyResponse = page.waitForResponse((response) =>
      response.request().method() === "POST"
      && response.url().includes(`/host/sessions/${sessionId}/record-apply`)
      && !new URL(response.url()).pathname.endsWith("/record-apply-preview"),
    );
    await applyDialog.getByRole("button", { name: "멤버에게 반영" }).click();
    const applied = await applyResponse;
    expect(applied.status(), await applied.text()).toBe(200);
    await expect(applyDialog).toBeHidden();
    const editorAfterApply = await page.evaluate(async ({ id, slug }) => {
      const response = await fetch(
        `/api/bff/api/host/sessions/${encodeURIComponent(id)}/record-editor?clubSlug=${encodeURIComponent(slug)}`,
      );
      return { status: response.status, body: await response.json() };
    }, { id: sessionId, slug: CLUB_SLUG });
    expect(editorAfterApply.status, JSON.stringify(editorAfterApply)).toBe(200);
    expect(
      Number(editorAfterApply.body?.liveRevision ?? 0),
      JSON.stringify(editorAfterApply.body),
    ).toBeGreaterThan(0);
    const composer = page.getByRole("dialog", { name: "알림 보내기" });
    if (await composer.isVisible().catch(() => false)) {
      await composer.getByRole("button", { name: "이번에는 보내지 않기" }).click();
      await expect(composer).toBeHidden();
    }
    await expect(page.getByRole("status").filter({ hasText: "변경사항을 반영했습니다." })).toBeVisible();
    await page.reload();
    await expect(page.getByText("기록 정리 중")).toBeVisible();
    const editorAfterReload = await page.evaluate(async ({ id, slug }) => {
      const response = await fetch(
        `/api/bff/api/host/sessions/${encodeURIComponent(id)}/record-editor?clubSlug=${encodeURIComponent(slug)}`,
      );
      return { status: response.status, body: await response.json() };
    }, { id: sessionId, slug: CLUB_SLUG });
    expect(
      Number(editorAfterReload.body?.liveRevision ?? 0),
      JSON.stringify(editorAfterReload.body),
    ).toBeGreaterThan(0);
    await expect(page.getByRole("heading", { name: "기록 공개" })).toBeVisible();
    await expect(visibleButton(page, "기록 공개")).toHaveCount(1);
    await visibleButton(page, "기록 공개").click();
    await confirmLifecycle(page, "기록 공개", "기록 공개");
    await expect(page.getByText("공개 완료")).toBeVisible();
    await expect(page.getByRole("dialog", { name: "공개 취소" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "공개 기록 보기" }).filter({ visible: true })).toHaveCount(1);
    const createRevision = page.getByRole("button", { name: "수정본 만들기" });
    await expect(createRevision).toBeVisible();
    expect(sessionState(sessionId)).toBe("PUBLISHED");
    await createRevision.click();
    await expect(page.getByText("공개 완료")).toBeVisible();
    await expect(page.getByRole("dialog", { name: "공개 취소" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "정리본" })).toBeVisible();
    expect(sessionState(sessionId)).toBe("PUBLISHED");
  });

  test("recovery undoes basic edits, surfaces stale restore, history restore, and lifecycle inverse", async ({ page }) => {
    const sessionId = createHostSessionFixture({
      number: 84,
      bookTitle: "포커스 복원 책",
      state: "DRAFT",
      date: "2026-08-20",
      withParticipants: true,
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    await openWorkspace(page, sessionId);

    await page.getByRole("button", { name: "모임 정보" }).click();
    await page.getByLabel("세션 제목").fill("84회차 모임 · 저장된 복원 제목");
    await page.getByRole("button", { name: "기본 정보 저장" }).click();
    await expect(page.getByRole("status").filter({ hasText: "저장되었습니다." })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "모임 정보를 저장했습니다." })).toBeVisible();
    await page.getByRole("dialog", { name: "모임 정보" }).getByRole("button", { name: "접기" }).click();
    await expect(page.getByRole("dialog", { name: "모임 정보" })).toBeHidden();

    let rejectRestore = true;
    await page.route((url) => url.pathname.includes("/changes/") && url.pathname.endsWith("/restore"), async (route) => {
      if (rejectRestore && route.request().method() === "POST") {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            code: "HOST_SESSION_RESTORE_STALE",
            status: 409,
            message: "그 사이 다른 변경이 있습니다. 변경 내역에서 다시 확인하세요.",
          }),
        });
        return;
      }
      await route.continue();
    });
    await page.getByRole("button", { name: "되돌리기" }).click();
    const undoDialog = page.getByRole("dialog", { name: "이 변경을 되돌릴까요?" });
    await expect(undoDialog).toBeVisible();
    await undoDialog.getByRole("button", { name: "되돌리기" }).click();
    await expect(undoDialog.getByRole("alert")).toContainText("그 사이 다른 변경이 있습니다");
    rejectRestore = false;
    if (await undoDialog.isVisible()) {
      await undoDialog.getByRole("button", { name: "취소" }).click();
    }
    await page.reload();
    await expect(page.getByText("모임 작성 중")).toBeVisible();

    await page.getByRole("button", { name: "변경 내역" }).first().click();
    const historyRestore = page.getByRole("button", { name: "이 변경 되돌리기" }).first();
    await expect(historyRestore).toBeVisible();
    await historyRestore.click();
    const historyDialog = page.getByRole("dialog", { name: "이 변경을 되돌릴까요?" });
    await expect(historyDialog).toBeVisible();
    await closeWorkspaceSheet(page, "변경 내역");
    await historyDialog.getByRole("button", { name: "되돌리기" }).click();
    await expect(historyDialog).toBeHidden({ timeout: 15_000 });
    await page.reload();
    await expect(page.getByText("모임 작성 중")).toBeVisible();
    await closeWorkspaceSheet(page, "변경 내역");
    await page.getByRole("button", { name: "모임 정보" }).click();
    await expect(page.getByLabel("세션 제목")).toHaveValue(/포커스 복원 책/);
    await page.goto(`${HOST_PATH}/sessions/${sessionId}`);
    await expect(page.getByText("모임 작성 중")).toBeVisible();
    await expect(page.locator(".rm-host-session-workspace__sheet-backdrop")).toBeHidden();
    await expect(visibleButton(page, "멤버와 준비 시작")).toHaveCount(1);
    await visibleButton(page, "멤버와 준비 시작").click();
    await confirmLifecycle(page, "멤버에게 열기", "멤버에게 열기");
    await expect(page.getByText("멤버와 준비 중")).toBeVisible();

    await page.goto(`${HOST_PATH}/sessions/${sessionId}?section=attendance`);
    const attend = page.getByRole("button", { name: "호스트 참석" });
    await expect(attend).toBeVisible();
    await attend.click();
    await expect(attend).toHaveAttribute("aria-pressed", "true");
    const attendanceUndo = page.getByRole("status").filter({ hasText: "출석을 바꿨습니다." });
    await expect(attendanceUndo).toBeVisible();
    await attendanceUndo.getByRole("button", { name: "되돌리기" }).click();
    const attendanceDialog = page.getByRole("dialog", { name: "이 변경을 되돌릴까요?" });
    await expect(attendanceDialog).toBeVisible();
    await expect(attendanceDialog).toContainText("출석");
    const restoreAttendance = page.waitForResponse((response) =>
      response.request().method() === "POST"
      && response.url().includes(`/host/sessions/${sessionId}/changes/`)
      && response.url().includes("/restore"),
    );
    await attendanceDialog.getByRole("button", { name: "되돌리기" }).click();
    expect((await restoreAttendance).ok()).toBe(true);
    await expect(attendanceDialog).toBeHidden();
    await page.goto(`${HOST_PATH}/sessions/${sessionId}?section=attendance`);
    await expect(page.getByRole("button", { name: "호스트 참석" })).toHaveAttribute("aria-pressed", "false");

    await page.getByRole("button", { name: "작성 중으로 되돌리기" }).click();
    await confirmLifecycle(page, "작성 중으로 되돌리기", "작성 중으로 되돌리기", "실수로 상태를 바꿈");
    await expect(page.getByText("모임 작성 중")).toBeVisible();
  });

  test("trash tombstone stays on the same URL, restores from the list, and blocks expired restore", async ({ page }) => {
    const sessionId = createHostSessionFixture({
      number: 85,
      bookTitle: "포커스 휴지통 책",
      state: "DRAFT",
      date: "2026-08-20",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await openWorkspace(page, sessionId);
    const workspacePath = new URL(page.url()).pathname;

    await openBasicSheet(page);
    await page.getByRole("button", { name: "휴지통으로 이동" }).click();
    const deleteDialog = page.getByRole("dialog", { name: "이 모임을 휴지통으로 옮길까요?" });
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole("button", { name: "휴지통으로 이동" }).click();
    await expect(page.getByRole("heading", { name: "휴지통에서 복원" })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(workspacePath);

    await page.reload();
    await expect(page.getByRole("heading", { name: "휴지통에서 복원" })).toBeVisible();
    await visibleButton(page, "방금 삭제한 모임 복구").click();
    await expect(page.getByRole("status").filter({ hasText: "모임을 복원했습니다." })).toBeVisible();
    await expect(page.getByText("모임 작성 중")).toBeVisible();
    await page.reload();
    await expect(page.getByText("모임 작성 중")).toBeVisible();

    await openBasicSheet(page);
    await page.getByRole("button", { name: "휴지통으로 이동" }).click();
    await page.getByRole("dialog", { name: "이 모임을 휴지통으로 옮길까요?" })
      .getByRole("button", { name: "휴지통으로 이동" })
      .click();
    await expect(page.getByRole("heading", { name: "휴지통에서 복원" })).toBeVisible();

    await page.goto(`${HOST_PATH}/sessions?view=trash`);
    await expect(page.getByRole("heading", { name: "휴지통", exact: true })).toBeVisible();
    await page.locator(`article[data-session-id="${sessionId}"]`).getByRole("button", { name: "복원" }).click();
    await expect(page.getByText("포커스 휴지통 책")).toBeVisible();

    await page.goto(`${HOST_PATH}/sessions/${sessionId}`);
    await openBasicSheet(page);
    await page.getByRole("button", { name: "휴지통으로 이동" }).click();
    await page.getByRole("dialog", { name: "이 모임을 휴지통으로 옮길까요?" })
      .getByRole("button", { name: "휴지통으로 이동" })
      .click();
    expireHostSessionTrash(sessionId);
    await page.reload();
    await visibleButton(page, "방금 삭제한 모임 복구").click();
    await expect(page.getByRole("alert")).toContainText("복원 기간이 지났습니다");
    await expect(visibleButton(page, "방금 삭제한 모임 복구")).toBeDisabled();
  });

  test("workspace viewports stay inside the screen for DRAFT, CLOSED, and tombstone", async ({ page }, testInfo) => {
    const draftId = createHostSessionFixture({
      number: 86,
      bookTitle: "뷰포트 작성 책",
      state: "DRAFT",
      date: "2026-08-20",
    });
    await openWorkspace(page, draftId);
    await captureWorkspaceViewport(page, testInfo, "focus-draft");

    cleanupGeneratedSessions();
    const closedId = createHostSessionFixture({
      number: 87,
      bookTitle: "뷰포트 종료 책",
      state: "CLOSED",
      date: "2026-07-20",
      withParticipants: true,
    });
    await page.goto(`${HOST_PATH}/sessions/${closedId}`);
    await expect(page.getByText("기록 정리 중")).toBeVisible();
    await captureWorkspaceViewport(page, testInfo, "focus-closed");

    await page.setViewportSize({ width: 390, height: 844 });
    await visibleButton(page, "정리본 올리기").click();
    await expect(page.getByRole("heading", { name: "정리본" })).toBeVisible();
    await expect(page.locator("label.rm-session-import-drop")).toBeVisible();
    await expectFocusedContentNotCoveredByStickyCta(
      page,
      page.getByLabel("정리한 파일을 여기에 놓으세요"),
    );

    cleanupGeneratedSessions();
    const tombstoneId = createHostSessionFixture({
      number: 88,
      bookTitle: "뷰포트 휴지통 책",
      state: "DRAFT",
      date: "2026-08-20",
    });
    await page.goto(`${HOST_PATH}/sessions/${tombstoneId}`);
    await expect(page.getByText("모임 작성 중")).toBeVisible();
    await openBasicSheet(page);
    await page.getByRole("button", { name: "휴지통으로 이동" }).click();
    const dialog = page.getByRole("dialog", { name: "이 모임을 휴지통으로 옮길까요?" });
    await expectDialogFitsViewport(page, dialog);
    await dialog.getByRole("button", { name: "휴지통으로 이동" }).click();
    await expect(page.getByRole("heading", { name: "휴지통에서 복원" })).toBeVisible();
    await captureWorkspaceViewport(page, testInfo, "focus-tombstone");
  });

  test("keyboard and landmarks cover header, panels, undo, and dialogs", async ({ page }) => {
    const sessionId = createHostSessionFixture({
      number: 88,
      bookTitle: "포커스 키보드 책",
      state: "DRAFT",
      date: "2026-08-20",
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    await openWorkspace(page, sessionId);
    await expectOneMainAndOrderedHeadings(page);

    const basicTrigger = page.getByRole("button", { name: "모임 정보" });
    const historyTrigger = page.getByRole("button", { name: "변경 내역" }).first();
    const primaryCta = page.locator("button.rm-host-session-workspace__cta--desktop");
    const attendanceDisclosure = page.getByRole("listitem", { name: /출석/ }).getByRole("button");
    const recordsDisclosure = page.getByRole("listitem", { name: /기록/ }).getByRole("button");

    await page.locator(".rm-host-session-workspace__title").focus();
    await tabUntilFocused(page, basicTrigger);
    await expectVisibleFocus(page, basicTrigger);
    await tabUntilFocused(page, historyTrigger);
    await expect(historyTrigger).toBeFocused();
    await tabUntilFocused(page, primaryCta);
    await expect(primaryCta).toBeFocused();
    await expect(primaryCta).toHaveText("멤버와 준비 시작");
    await tabUntilFocused(page, attendanceDisclosure);
    await expect(attendanceDisclosure).toBeFocused();
    await tabUntilFocused(page, recordsDisclosure);
    await expect(recordsDisclosure).toBeFocused();

    await page.locator(".rm-host-session-workspace__title").focus();
    await tabUntilFocused(page, basicTrigger);
    await page.keyboard.press("Enter");
    const sheet = page.getByRole("dialog", { name: "모임 정보" });
    await expect(sheet).toBeVisible();
    const title = page.getByLabel("세션 제목");
    await tabUntilFocused(page, title);
    await expect(title).toBeFocused();
    await title.fill("88회차 모임 · 키보드 저장");
    const save = sheet.getByRole("button", { name: "기본 정보 저장" });
    await tabUntilFocused(page, save);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "저장되었습니다." })).toBeVisible();
    await sheet.focus();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(basicTrigger).toBeFocused();

    await tabUntilFocused(page, historyTrigger);
    await page.keyboard.press("Enter");
    const historySheet = page.getByRole("dialog", { name: "변경 내역" });
    await expect(historySheet).toBeVisible();
    await expect(historySheet).toContainText("버전과 작업 기록");
    await page.keyboard.press("Escape");
    await expect(historySheet).toBeHidden();
    await expect(historyTrigger).toBeFocused();

    const undo = page.getByRole("status").filter({ hasText: "모임 정보를 저장했습니다." })
      .getByRole("button", { name: "되돌리기" });
    await tabUntilFocused(page, undo);
    await expect(undo).toBeFocused();
    await page.keyboard.press("Enter");
    const undoDialog = page.getByRole("dialog", { name: "이 변경을 되돌릴까요?" });
    await expect(undoDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(undoDialog).toBeHidden();
    await expect(undo).toBeFocused();
    await expectNoHostPrivateSentinels(page);
  });
});
