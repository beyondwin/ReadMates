import { expect, test, type Page } from "@playwright/test";
import type { HostSessionDetailResponse } from "@/features/host/model/host-view-types";
import {
  loginWithGoogleFixture,
  readHostActionDecision,
  readNotificationEventCount,
  readSessionRecordRevisionCount,
  resetE2eState,
  runMysql,
} from "./readmates-e2e-db";

test.describe.configure({ mode: "serial" });

const CLUB_SLUG = "reading-sai";
const HOST_PATH = `/clubs/${CLUB_SLUG}/app/host`;
const RECORD_BOOK = "Revision Workflow Book";
const RECORD_SUMMARY = "초안에만 저장되는 공개 요약";
const UPDATED_SUMMARY = "알림과 함께 적용하는 수정 요약";

let recordSessionId = "";
let recordSessionNumber = 0;

function resetRevisionWorkflowState() {
  resetE2eState({
    cleanupGeneratedSessions: true,
    googleLoginEmails: ["host@example.com", "member1@example.com"],
  });
}

async function loginHost(page: Page) {
  await loginWithGoogleFixture(page, "host@example.com");
}

async function openRecordEditor(page: Page) {
  await page.goto(`${HOST_PATH}/sessions/${recordSessionId}`);
  await expect(page.getByRole("heading", { name: "세션 문서 편집" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/sessions/${recordSessionId}/?$`));
  expect(new URL(page.url()).pathname).not.toMatch(/\/edit\/?$/);
  await expect(page.getByRole("tab", { name: "개요" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "개요" })).toBeVisible();
}

async function openEditorSection(page: Page, name: "기본 정보" | "출석" | "기록 작업대" | "변경 기록") {
  const section = page.getByRole("tab", { name });
  await section.click();
  await expect(section).toHaveAttribute("aria-selected", "true");
}

async function fetchHostSession(page: Page, sessionId: string): Promise<HostSessionDetailResponse> {
  return page.evaluate(async ({ id, clubSlug }) => {
    const response = await fetch(
      `/api/bff/api/host/sessions/${encodeURIComponent(id)}?clubSlug=${encodeURIComponent(clubSlug)}`,
    );
    if (!response.ok) throw new Error(`session detail failed: ${response.status}`);
    return response.json();
  }, { id: sessionId, clubSlug: CLUB_SLUG });
}

async function waitForDraftSaved(page: Page) {
  const applyDialog = page.getByRole("dialog", { name: "반영 전 확인" });
  await applyDialog.waitFor({ state: "visible", timeout: 2_000 }).catch(() => undefined);
  if (await applyDialog.isVisible()) {
    await applyDialog.getByRole("button", { name: "닫기" }).click();
    await expect(applyDialog).toBeHidden();
  }
  const sourceTabs = page.getByRole("tablist", { name: "초안 만들기" });
  if (await sourceTabs.getByRole("tab", { name: "직접 작성" }).isVisible()) {
    await sourceTabs.getByRole("tab", { name: "직접 작성" }).click();
  }
  const commonEditor = page.getByRole("region", { name: "공통 초안 편집기" });
  await expect(commonEditor.getByRole("status")).toHaveText("저장됨", { timeout: 15_000 });
}

async function reviewAndApply(page: Page) {
  const previewResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes(`/host/sessions/${recordSessionId}/record-apply-preview`) &&
      response.ok(),
  );
  await page.getByRole("button", { name: "반영 전 확인" }).click();
  expect((await previewResponse).ok()).toBe(true);
  const dialog = page.getByRole("dialog", { name: "반영 전 확인" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("radio")).toHaveCount(0);
  const applyResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes(`/host/sessions/${recordSessionId}/record-apply`) &&
      !new URL(response.url()).pathname.endsWith("/record-apply-preview"),
  );
  await dialog.getByRole("button", { name: "멤버에게 반영" }).click();
  const applied = await applyResponse;
  expect(applied.status(), await applied.text()).toBe(200);
  await expect(page.getByRole("dialog", { name: "알림 보내기" })).toBeVisible();
}

function feedbackMarkdown(sessionNumber: number, authorName: string) {
  return `<!-- readmates-feedback:v1 -->

# 독서모임 ${sessionNumber}차 피드백

${RECORD_BOOK} · 2026.05.20

## 메타

- 일시: 2026.05.20 (수) · 20:00
- 책: ${RECORD_BOOK}
- 참여자: ${authorName}

## 관찰자 노트

공개 안전한 E2E 관찰 기록입니다.

## 참여자별 피드백

### 01. ${authorName}

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
`;
}

function readSessionImportAuthorNames(sessionId: string) {
  return runMysql(`
select users.name
from session_participants
join memberships on memberships.id = session_participants.membership_id
  and memberships.club_id = session_participants.club_id
join users on users.id = memberships.user_id
where session_participants.session_id = '${sessionId}'
  and session_participants.participation_status = 'ACTIVE'
order by session_participants.created_at, session_participants.id;
`)
    .trim()
    .split("\n")
    .slice(1)
    .filter(Boolean);
}

test.beforeAll(() => {
  resetRevisionWorkflowState();
});

test.afterAll(() => {
  resetRevisionWorkflowState();
});

test("1. host finds and opens a past session at the default overview", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginHost(page);
  await page.goto(`${HOST_PATH}/sessions/new`);
  await openEditorSection(page, "기본 정보");
  await page.getByLabel("세션 제목").fill("Revision Workflow Session");
  await page.getByLabel("책 제목").fill(RECORD_BOOK);
  await page.getByLabel("저자").fill("Public Fixture Author");
  await page.getByLabel("모임 날짜").fill("2026-05-20");
  await page.getByRole("button", { name: "세션 문서 저장" }).click();
  await expect(page).toHaveURL(/\/app\/host\/sessions\/(?!new(?:\/|$))[^/]+\/?(?:\?|$)/);
  expect(new URL(page.url()).pathname).not.toMatch(/\/edit\/?$/);
  await expect(page.getByRole("heading", { name: "세션 문서 편집" })).toBeVisible();
  recordSessionId = new URL(page.url()).pathname.split("/").at(-1) ?? "";
  expect(recordSessionId).not.toBe("");

  const created = await fetchHostSession(page, recordSessionId);
  recordSessionNumber = created.sessionNumber;
  runMysql(`
insert into session_participants (
  id,
  club_id,
  session_id,
  membership_id,
  rsvp_status,
  attendance_status
)
select
  uuid(),
  memberships.club_id,
  '${recordSessionId}',
  memberships.id,
  'NO_RESPONSE',
  'UNKNOWN'
from memberships
join users on users.id = memberships.user_id
where memberships.club_id = '00000000-0000-0000-0000-000000000001'
  and memberships.status = 'ACTIVE'
  and lower(users.email) in ('member1@example.com', 'member2@example.com');

update sessions
set state = 'CLOSED',
    updated_at = utc_timestamp(6)
where id = '${recordSessionId}';
`);

  await page.goto(`${HOST_PATH}/sessions`);
  await expect(page.getByRole("heading", { name: "세션 기록 장부" })).toBeVisible();
  await page.getByRole("searchbox", { name: "세션 기록 검색" }).fill(RECORD_BOOK);
  await page.getByRole("button", { name: "검색" }).click();
  const rowAction = page.getByRole("link", { name: new RegExp(`^${recordSessionNumber}회차`) }).first();
  await expect(rowAction).toBeVisible();
  await rowAction.click();
  await expect(page).toHaveURL(new RegExp(`/sessions/${recordSessionId}/?$`));
  expect(new URL(page.url()).pathname).not.toMatch(/\/edit\/?$/);
  await expect(page.getByRole("tab", { name: "개요" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "개요" })).toBeVisible();
  const overviewScreenshot = await page.screenshot({
    path: testInfo.outputPath("overview-1280x900.png"),
    fullPage: true,
  });
  expect(overviewScreenshot.byteLength).toBeGreaterThan(10_000);
  await openEditorSection(page, "기본 정보");
  await expect(page.getByLabel("책 제목")).toHaveValue(RECORD_BOOK);
});

test("2. basic information and attendance save immediately with metadata-only audit", async ({ page }) => {
  await loginHost(page);
  await openRecordEditor(page);
  await openEditorSection(page, "기본 정보");

  await page.getByLabel("세션 제목").fill("Revision Workflow Session Updated");
  const basicSave = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      response.url().includes(`/host/sessions/${recordSessionId}`) &&
      response.ok(),
  );
  await page.getByRole("button", { name: "기본 정보 저장" }).click();
  expect((await basicSave).ok()).toBe(true);

  await openEditorSection(page, "출석");
  const attendanceButtons = page.getByRole("button", { name: / (참석|불참)$/ });
  await expect(attendanceButtons.first()).toBeVisible();
  const currentlySelected = await attendanceButtons.first().getAttribute("aria-pressed");
  const attendanceTarget = currentlySelected === "true" ? attendanceButtons.nth(1) : attendanceButtons.first();
  const attendanceSave = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes(`/host/sessions/${recordSessionId}/attendance`) &&
      response.ok(),
  );
  await attendanceTarget.click();
  expect((await attendanceSave).ok()).toBe(true);

  await page.reload();
  await openEditorSection(page, "변경 기록");
  await expect(page.getByText("기본 정보 수정").first()).toBeVisible();
  await expect(page.getByText("출석 수정").first()).toBeVisible();
  const auditOutput = runMysql(`
select count(*) as count
from host_session_change_audit
where session_id = '${recordSessionId}';
`);
  expect(Number(auditOutput.trim().split(/\s+/)[1] ?? 0)).toBeGreaterThanOrEqual(2);
});

test("3. JSON import saves the shared draft while member and public live content stay unchanged", async ({ page }) => {
  await loginHost(page);
  await openRecordEditor(page);
  await openEditorSection(page, "기록 작업대");
  const detail = await fetchHostSession(page, recordSessionId);
  const authors = readSessionImportAuthorNames(recordSessionId);
  expect(authors.length).toBeGreaterThanOrEqual(1);
  const firstAuthor = authors[0];
  const secondAuthor = authors[1] ?? firstAuthor;
  const live = page.getByRole("region", { name: "멤버에게 보이는 기록" });
  await expect(live).not.toContainText(RECORD_SUMMARY);

  const initialDraftSave = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      response.url().includes(`/host/sessions/${recordSessionId}/record-draft`),
  );
  await page.getByRole("tablist", { name: "초안 만들기" }).getByRole("tab", { name: "직접 작성" }).click();
  await page.getByRole("radio", { name: "게스트 공개" }).click();
  const initialDraftSaveResponse = await initialDraftSave;
  expect(initialDraftSaveResponse.status(), await initialDraftSaveResponse.text()).toBe(200);
  await waitForDraftSaved(page);
  await page.getByRole("tab", { name: "정리본 올리기" }).click();
  await page.getByLabel("정리한 파일을 여기에 놓으세요").setInputFiles({
    name: "session-record-draft.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      format: "readmates-session-import:v1",
      session: {
        number: recordSessionNumber,
        bookTitle: RECORD_BOOK,
        meetingDate: detail.date,
      },
      publication: { summary: RECORD_SUMMARY },
      highlights: [{ authorName: firstAuthor, text: "공개 안전한 E2E 하이라이트" }],
      oneLineReviews: [{ authorName: secondAuthor, text: "공개 안전한 E2E 한줄평" }],
      feedbackDocument: {
        fileName: `session-${recordSessionNumber}-feedback.md`,
        markdown: feedbackMarkdown(recordSessionNumber, firstAuthor),
      },
    })),
  });
  const importPreview = page.getByRole("region", { name: "정리본 미리보기" });
  await expect(importPreview).toBeVisible();
  const importButton = page.getByRole("button", { name: "작성 중에 넣기" });
  await expect(importButton, await importPreview.innerText()).toBeEnabled();
  const commitResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes(`/host/sessions/${recordSessionId}/session-import/commit`) &&
      response.ok(),
  );
  await importButton.click();
  expect((await commitResponse).ok()).toBe(true);
  await waitForDraftSaved(page);
  await expect(page.getByRole("region", { name: "작성 중" })).toContainText("정리본");
  await expect(page.getByRole("dialog", { name: "알림 보내기" })).toHaveCount(0);
  await expect(page.getByLabel("공개 요약")).toHaveValue(RECORD_SUMMARY);
  await expect(live).not.toContainText(RECORD_SUMMARY);

  await loginWithGoogleFixture(page, "member1@example.com");
  await page.goto(`/clubs/${CLUB_SLUG}/app/archive?view=sessions`);
  await expect(page.getByText(RECORD_SUMMARY)).toHaveCount(0);
});

test("4. stale draft requires an exact live metadata review before apply", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginHost(page);
  await openRecordEditor(page);
  await openEditorSection(page, "기본 정보");
  await page.getByLabel("저자").fill("Public Fixture Author Updated");
  const basicSave = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      response.url().includes(`/host/sessions/${recordSessionId}`) &&
      response.ok(),
  );
  await page.getByRole("button", { name: "기본 정보 저장" }).click();
  expect((await basicSave).ok()).toBe(true);

  await page.reload();
  await openEditorSection(page, "기록 작업대");
  await expect(page.getByText(/세션 기본 정보 또는 현재 적용본이 변경되어/)).toBeVisible();
  const reviewButton = page.getByRole("button", { name: "반영 전 확인" });
  await expect(reviewButton).toBeDisabled();
  const staleScreenshot = await page.screenshot({
    path: testInfo.outputPath("records-stale-1280x900.png"),
    fullPage: true,
  });
  expect(staleScreenshot.byteLength).toBeGreaterThan(10_000);

  const rebaseResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes(`/host/sessions/${recordSessionId}/record-draft/rebase`),
  );
  await page.getByRole("button", { name: "최신 정보 확인 완료" }).click();
  const rebased = await rebaseResponse;
  expect(rebased.status(), await rebased.text()).toBe(200);
  await expect(reviewButton).toBeEnabled();

  const previewResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST"
      && response.url().includes(`/host/sessions/${recordSessionId}/record-apply-preview`),
  );
  await reviewButton.click();
  const preview = await previewResponse;
  expect(preview.status(), await preview.text()).toBe(200);
  const dialog = page.getByRole("dialog", { name: "반영 전 확인" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "닫기" }).click();
  await expect(dialog).toBeHidden();
});

test("5. apply then composer skip creates a revision without a notification event", async ({ page }) => {
  await loginHost(page);
  await openRecordEditor(page);
  await openEditorSection(page, "기록 작업대");
  const before = await readSessionRecordRevisionCount(recordSessionId);
  await waitForDraftSaved(page);
  await reviewAndApply(page);
  await page.getByRole("button", { name: "이번에는 보내지 않기" }).click();
  await expect(page.getByRole("dialog", { name: "알림 보내기" })).toBeHidden();
  expect(await readHostActionDecision(recordSessionId)).toBeNull();
  await expect.poll(() => readSessionRecordRevisionCount(recordSessionId)).toBeGreaterThan(before);
  expect(await readNotificationEventCount(recordSessionId, "FEEDBACK_DOCUMENT_PUBLISHED")).toBe(0);
  expect(await readNotificationEventCount(recordSessionId, "SESSION_RECORD_UPDATED")).toBe(0);
  await expect(page.getByRole("tab", { name: "개요" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("region", { name: "현재 적용본" })).toContainText(RECORD_SUMMARY);
  await expect(page.getByRole("region", { name: "작업 중인 초안" })).toContainText("준비된 초안이 없습니다");
});

test("6. apply then composer confirm creates exactly one session-record event", async ({ page }) => {
  await loginHost(page);
  await openRecordEditor(page);
  await openEditorSection(page, "기록 작업대");
  const before = await readSessionRecordRevisionCount(recordSessionId);
  await page.getByLabel("공개 요약").fill(UPDATED_SUMMARY);
  await waitForDraftSaved(page);
  await reviewAndApply(page);
  await expect.poll(() => readSessionRecordRevisionCount(recordSessionId)).toBe(before + 1);
  await page.getByRole("button", { name: "알림 미리보기" }).click();
  await expect(page.getByRole("region", { name: "발송 전 확인" })).toBeVisible();
  await page.getByRole("button", { name: "발송 확인" }).click();
  expect(await readHostActionDecision(recordSessionId)).toBeNull();
  await expect.poll(() => readNotificationEventCount(recordSessionId, "SESSION_RECORD_UPDATED")).toBe(1);
  await expect(page.getByRole("tab", { name: "개요" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("region", { name: "현재 적용본" })).toContainText(UPDATED_SUMMARY);
  await expect(page.getByRole("region", { name: "작업 중인 초안" })).toContainText("준비된 초안이 없습니다");
});

test("7. restoring an immutable version creates a draft without changing the applied version", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginHost(page);
  await openRecordEditor(page);
  await openEditorSection(page, "변경 기록");
  const before = await readSessionRecordRevisionCount(recordSessionId);
  const historyScreenshot = await page.screenshot({
    path: testInfo.outputPath("history-1280x900.png"),
    fullPage: true,
  });
  expect(historyScreenshot.byteLength).toBeGreaterThan(10_000);
  const restore = page.getByRole("button", { name: "이 버전으로 초안 만들기" }).last();
  await expect(restore).toBeVisible();
  await restore.click();
  const restoreDialog = page.getByRole("dialog", { name: /버전 \d+로 작업 초안을 만들까요\?/ });
  await expect(restoreDialog).toBeVisible();
  const restoreDialogScreenshot = await page.screenshot({
    path: testInfo.outputPath("restore-dialog-1280x900.png"),
  });
  expect(restoreDialogScreenshot.byteLength).toBeGreaterThan(10_000);
  const restoreResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes(`/host/sessions/${recordSessionId}/revisions/`) &&
      response.url().includes("/restore-to-draft") &&
      response.ok(),
  );
  await restoreDialog.getByRole("button", { name: "작업 초안 만들기" }).click();
  expect((await restoreResponse).ok()).toBe(true);
  await waitForDraftSaved(page);
  expect(await readSessionRecordRevisionCount(recordSessionId)).toBe(before);
  await openEditorSection(page, "개요");
  await expect(page.getByRole("region", { name: "현재 적용본" })).toContainText(UPDATED_SUMMARY);
  await expect(page.getByRole("region", { name: "작업 중인 초안" })).toContainText("작성 방식 · 과거 버전에서 생성");
});

test("8. 320px host record navigation and confirmation sheet remain accessible", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 720 });
  runMysql(`
update sessions
set visibility = 'HOST_ONLY',
    access_scope = 'HOST_ONLY'
where id = '${recordSessionId}';
`);
  await loginHost(page);
  await page.goto(`${HOST_PATH}/sessions`);
  await expect(page.getByRole("heading", { name: "세션 기록 장부" })).toBeVisible();
  await page.getByRole("searchbox", { name: "세션 기록 검색" }).fill(RECORD_BOOK);
  await page.getByRole("button", { name: "검색" }).click();
  await page.getByRole("link", { name: new RegExp(`^${recordSessionNumber}회차`) }).first().click();
  const sectionNav = page.getByRole("tablist", { name: "호스트 편집 섹션" });
  const sectionTabs = sectionNav.getByRole("tab");
  await expect(sectionTabs).toHaveCount(5);
  await expect(sectionTabs.locator("[data-mobile-label]")).toHaveText(["개요", "기본", "출석", "기록", "변경"]);
  const sectionNavMetrics = await sectionNav.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(sectionNavMetrics.scrollWidth).toBeLessThanOrEqual(sectionNavMetrics.clientWidth);
  const tabBoxes = await sectionTabs.evaluateAll((tabs) => tabs.map((tab) => {
    const box = tab.getBoundingClientRect();
    const style = getComputedStyle(tab);
    return { width: box.width, height: box.height, justifyContent: style.justifyContent };
  }));
  expect(Math.max(...tabBoxes.map((box) => box.width)) - Math.min(...tabBoxes.map((box) => box.width)))
    .toBeLessThanOrEqual(1);
  expect(tabBoxes.every((box) => box.height >= 44 && box.justifyContent === "center")).toBe(true);
  const mobileMetadata = page.getByRole("group", { name: "모바일 세션 상태" });
  await expect(mobileMetadata).toBeVisible();
  await expect(mobileMetadata.getByText("호스트 전용")).toHaveCount(1);
  const metadataLines = await mobileMetadata.locator(":scope > *").evaluateAll((items) =>
    new Set(items.map((item) => Math.round(item.getBoundingClientRect().top))).size,
  );
  expect(metadataLines).toBe(1);

  const overviewPanel = page.locator(".rm-host-session-editor__overview");
  await expect(overviewPanel).toHaveCSS("padding-left", "14px");
  await expect(overviewPanel).toHaveCSS("padding-right", "14px");
  await openEditorSection(page, "기록 작업대");
  await expect(page.locator('[role="tabpanel"]:visible')).toHaveCount(1);
  await expect(page.locator(".rm-host-session-editor__aside:visible")).toHaveCount(0);
  const refreshDraft = page.getByRole("button", { name: "최신 정보 확인 완료" });
  await expect(refreshDraft).toBeVisible();
  const refreshResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes(`/host/sessions/${recordSessionId}/record-draft/rebase`),
  );
  await refreshDraft.click();
  const refreshed = await refreshResponse;
  expect(refreshed.status(), await refreshed.text()).toBe(200);
  await expect(refreshDraft).toHaveCount(0);
  await expect(page.getByText(/세션 기본 정보 또는 현재 적용본이 변경되어/)).toHaveCount(0);

  const longMobileSummary =
    "모바일 확인용 미적용 초안 EnglishVeryLongWordWithoutNaturalBreaks "
    + "https://example.test/public-safe/very-long-segment-without-breaks/세션-기록";
  await page.getByLabel("공개 요약").fill(longMobileSummary);
  await waitForDraftSaved(page);
  await expect(page.getByRole("button", { name: "반영 전 확인" })).toBeEnabled();
  const stickyAction = page.getByRole("region", { name: "반영 전 확인" });
  const appNav = page.getByRole("navigation", { name: "앱 탭" });
  const [stickyBox, appNavBox] = await Promise.all([stickyAction.boundingBox(), appNav.boundingBox()]);
  expect(stickyBox).not.toBeNull();
  expect(appNavBox).not.toBeNull();
  expect(stickyBox!.y + stickyBox!.height).toBeLessThanOrEqual(appNavBox!.y);
  await page.getByRole("button", { name: "반영 전 확인" }).click();

  const dialog = page.getByRole("dialog", { name: "반영 전 확인" });
  const sheet = page.getByTestId("host-action-dialog-sheet");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "닫기" })).toBeFocused();
  await expect(dialog.getByRole("radio")).toHaveCount(0);
  await expect(dialog).toContainText("이 단계에서는 알림을 만들거나 보내지 않습니다");
  const box = await sheet.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  expect(Math.abs(box!.y + box!.height - 720)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const applyDialogScreenshot = await page.screenshot({
    path: testInfo.outputPath("apply-dialog-320x720.png"),
  });
  expect(applyDialogScreenshot.byteLength).toBeGreaterThan(10_000);
  await dialog.getByRole("button", { name: "닫기" }).click();
  await expect(dialog).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  await openRecordEditor(page);
  await expect(overviewPanel).toHaveCSS("padding-left", "16px");
  await expect(overviewPanel).toHaveCSS("padding-right", "16px");
  const wideMobileMetadata = page.getByRole("group", { name: "모바일 세션 상태" });
  const wideDesktopMetadata = page.locator('[aria-label="데스크톱 세션 상태"]');
  await expect(wideMobileMetadata).toHaveCSS("display", "flex");
  await expect(wideMobileMetadata).toHaveCSS("gap", "5px");
  await expect(wideDesktopMetadata).toHaveCSS("display", "none");
  const wideMetadataLines = await wideMobileMetadata.locator(":scope > *").evaluateAll((items) =>
    new Set(items.map((item) => Math.round(item.getBoundingClientRect().top))).size,
  );
  expect(wideMetadataLines).toBe(1);
  const wideSectionTabs = page.getByRole("tablist", { name: "호스트 편집 섹션" }).getByRole("tab");
  await expect(wideSectionTabs).toHaveCount(5);
  for (const tab of await wideSectionTabs.all()) {
    await expect(tab).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const overviewScreenshot = await page.screenshot({
    path: testInfo.outputPath("host-editor-overview-390x844.png"),
    fullPage: true,
  });
  expect(overviewScreenshot.byteLength).toBeGreaterThan(10_000);
  await openEditorSection(page, "기록 작업대");
  await page.getByRole("button", { name: "반영 전 확인" }).click();
  await expect(dialog).toBeVisible();
  const wideMobileBox = await sheet.boundingBox();
  expect(wideMobileBox).not.toBeNull();
  expect(wideMobileBox!.x).toBeGreaterThanOrEqual(0);
  expect(wideMobileBox!.x + wideMobileBox!.width).toBeLessThanOrEqual(390);
  expect(Math.abs(wideMobileBox!.y + wideMobileBox!.height - 844)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const wideMobileDialogScreenshot = await page.screenshot({
    path: testInfo.outputPath("apply-dialog-390x844.png"),
  });
  expect(wideMobileDialogScreenshot.byteLength).toBeGreaterThan(10_000);
  await dialog.getByRole("button", { name: "닫기" }).click();
  await expect(dialog).toBeHidden();

  await page.setViewportSize({ width: 1280, height: 900 });
  await openRecordEditor(page);
  const desktopMetadata = page.getByRole("group", { name: "데스크톱 세션 상태" });
  const desktopMobileMetadata = page.locator('[aria-label="모바일 세션 상태"]');
  await expect(desktopMetadata).toHaveCSS("display", "grid");
  await expect(desktopMetadata).toHaveCSS("gap", "10px");
  await expect(desktopMobileMetadata).toHaveCSS("display", "none");
  const desktopScreenshot = await page.screenshot({
    path: testInfo.outputPath("host-editor-overview-1280x900.png"),
    fullPage: true,
  });
  expect(desktopScreenshot.byteLength).toBeGreaterThan(10_000);

  await page.setViewportSize({ width: 240, height: 720 });
  await openRecordEditor(page);
  const narrowSectionNav = page.getByRole("tablist", { name: "호스트 편집 섹션" });
  const narrowTabs = narrowSectionNav.getByRole("tab");
  const narrowMetrics = await narrowSectionNav.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    overflowX: getComputedStyle(element).overflowX,
  }));
  expect(narrowMetrics.overflowX).toBe("auto");
  expect(narrowMetrics.scrollWidth).toBeGreaterThanOrEqual(narrowMetrics.clientWidth);
  const narrowTabGeometry = await narrowTabs.evaluateAll((tabs) => tabs.map((tab) => {
    const tabBox = tab.getBoundingClientRect();
    const label = tab.querySelector<HTMLElement>("[data-mobile-label]");
    if (!label) throw new Error("mobile tab label missing");
    const labelBox = label.getBoundingClientRect();
    return {
      left: tabBox.left,
      right: tabBox.right,
      width: tabBox.width,
      height: tabBox.height,
      labelLeft: labelBox.left,
      labelRight: labelBox.right,
    };
  }));
  expect(narrowTabGeometry.every((tab) => tab.width >= 44 && tab.height >= 44)).toBe(true);
  expect(narrowTabGeometry.every((tab) => (
    tab.labelLeft >= tab.left - 0.5 && tab.labelRight <= tab.right + 0.5
  ))).toBe(true);
  expect(narrowTabGeometry.slice(1).every((tab, index) => (
    tab.left >= narrowTabGeometry[index].right - 0.5
  ))).toBe(true);
  if (narrowMetrics.scrollWidth > narrowMetrics.clientWidth) {
    await narrowSectionNav.evaluate((element) => element.scrollTo({ left: element.scrollWidth }));
    expect(await narrowSectionNav.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  } else {
    expect(await narrowSectionNav.evaluate((element) => element.scrollLeft)).toBe(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const narrowScreenshot = await page.screenshot({
    path: testInfo.outputPath("host-editor-tabs-240x720.png"),
    fullPage: true,
  });
  expect(narrowScreenshot.byteLength).toBeGreaterThan(10_000);
});
