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
let nextBookSessionId = "";

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
  await page.goto(`${HOST_PATH}/sessions/${recordSessionId}/edit`);
  await expect(page.getByRole("heading", { name: /세션 문서 편집/ })).toBeVisible();
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
  await expect(page.getByText("초안 저장됨 · 검토 후 반영").first()).toBeVisible({ timeout: 15_000 });
}

async function reviewAndApply(page: Page, decision: "SEND" | "SKIP") {
  const previewResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes(`/host/sessions/${recordSessionId}/record-apply-preview`) &&
      response.ok(),
  );
  await page.getByRole("button", { name: "변경사항 검토" }).click();
  expect((await previewResponse).ok()).toBe(true);
  await expect(page.getByRole("radio", { name: "알림 보내고 반영" })).not.toBeChecked();
  await expect(page.getByRole("radio", { name: "알림 없이 반영" })).not.toBeChecked();
  await expect(page.getByRole("button", { name: "선택대로 반영" })).toBeDisabled();
  await page.getByRole("radio", {
    name: decision === "SEND" ? "알림 보내고 반영" : "알림 없이 반영",
  }).click();
  const applyResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes(`/host/sessions/${recordSessionId}/record-apply`) &&
      !response.url().endsWith("/record-apply-preview"),
  );
  await page.getByRole("button", { name: "선택대로 반영" }).click();
  const applied = await applyResponse;
  expect(applied.status(), await applied.text()).toBe(200);
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

test("1. host finds and opens a past session from the dedicated record ledger", async ({ page }) => {
  await loginHost(page);
  await page.goto(`${HOST_PATH}/sessions/new`);
  await page.getByLabel("세션 제목").fill("Revision Workflow Session");
  await page.getByLabel("책 제목").fill(RECORD_BOOK);
  await page.getByLabel("저자").fill("Public Fixture Author");
  await page.getByLabel("모임 날짜").fill("2026-05-20");
  await page.getByRole("button", { name: "세션 문서 저장" }).click();
  await expect(page).toHaveURL(/\/app\/host\/sessions\/[^/]+\/edit/);
  recordSessionId = new URL(page.url()).pathname.split("/").at(-2) ?? "";
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
  await expect(page).toHaveURL(new RegExp(`/sessions/${recordSessionId}/edit`));
  await expect(page.getByLabel("책 제목")).toHaveValue(RECORD_BOOK);
});

test("2. basic information and attendance save immediately with metadata-only audit", async ({ page }) => {
  await loginHost(page);
  await openRecordEditor(page);

  await page.getByLabel("세션 제목").fill("Revision Workflow Session Updated");
  const basicSave = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      response.url().includes(`/host/sessions/${recordSessionId}`) &&
      response.ok(),
  );
  await page.getByRole("button", { name: "변경 사항 저장" }).click();
  expect((await basicSave).ok()).toBe(true);

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
  const detail = await fetchHostSession(page, recordSessionId);
  const authors = readSessionImportAuthorNames(recordSessionId);
  expect(authors.length).toBeGreaterThanOrEqual(1);
  const firstAuthor = authors[0];
  const secondAuthor = authors[1] ?? firstAuthor;
  const live = page.getByRole("region", { name: "현재 적용된 공개 기록" });
  await expect(live).not.toContainText(RECORD_SUMMARY);

  const initialDraftSave = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      response.url().includes(`/host/sessions/${recordSessionId}/record-draft`),
  );
  await page.getByRole("radio", { name: "멤버 공개" }).click();
  const initialDraftSaveResponse = await initialDraftSave;
  expect(initialDraftSaveResponse.status(), await initialDraftSaveResponse.text()).toBe(200);
  await waitForDraftSaved(page);
  await page.getByRole("tab", { name: "외부 JSON 가져오기" }).click();
  await page.locator("#session-import-json-file").setInputFiles({
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
  const importPreview = page.getByRole("region", { name: "세션 기록 미리보기" });
  await expect(importPreview).toBeVisible();
  const importButton = page.getByRole("button", { name: "초안으로 가져오기" });
  expect(importButton, await importPreview.innerText()).toBeEnabled();
  const commitResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes(`/host/sessions/${recordSessionId}/session-import/commit`) &&
      response.ok(),
  );
  await importButton.click();
  expect((await commitResponse).ok()).toBe(true);
  await expect(page.getByRole("region", { name: "세션 기록 초안 저장 결과" }))
    .toContainText("멤버와 공개 화면은 바뀌지 않습니다");
  await expect(page.getByLabel("공개 요약")).toHaveValue(RECORD_SUMMARY);
  await expect(live).not.toContainText(RECORD_SUMMARY);

  await loginWithGoogleFixture(page, "member1@example.com");
  await page.goto(`/clubs/${CLUB_SLUG}/app/archive?view=sessions`);
  await expect(page.getByText(RECORD_SUMMARY)).toHaveCount(0);
});

test("4. SKIP applies an immutable revision without creating a notification event", async ({ page }) => {
  await loginHost(page);
  await openRecordEditor(page);
  const before = await readSessionRecordRevisionCount(recordSessionId);
  await waitForDraftSaved(page);
  await reviewAndApply(page, "SKIP");
  await expect.poll(() => readHostActionDecision(recordSessionId)).toBe("SKIP");
  await expect.poll(() => readSessionRecordRevisionCount(recordSessionId)).toBeGreaterThan(before);
  expect(await readNotificationEventCount(recordSessionId, "FEEDBACK_DOCUMENT_PUBLISHED")).toBe(0);
  expect(await readNotificationEventCount(recordSessionId, "SESSION_RECORD_UPDATED")).toBe(0);
  await expect(page.getByRole("region", { name: "현재 적용된 공개 기록" })).toContainText(RECORD_SUMMARY);
});

test("5. SEND applies a later revision and creates exactly one session-record event", async ({ page }) => {
  await loginHost(page);
  await openRecordEditor(page);
  const before = await readSessionRecordRevisionCount(recordSessionId);
  await page.getByLabel("공개 요약").fill(UPDATED_SUMMARY);
  await waitForDraftSaved(page);
  await reviewAndApply(page, "SEND");
  await expect.poll(() => readHostActionDecision(recordSessionId)).toBe("SEND");
  await expect.poll(() => readSessionRecordRevisionCount(recordSessionId)).toBe(before + 1);
  await expect.poll(() => readNotificationEventCount(recordSessionId, "SESSION_RECORD_UPDATED")).toBe(1);
  await expect(page.getByRole("region", { name: "현재 적용된 공개 기록" })).toContainText(UPDATED_SUMMARY);
});

test("6. restoring an immutable revision creates a new draft and a new applied revision", async ({ page }) => {
  await loginHost(page);
  await openRecordEditor(page);
  const before = await readSessionRecordRevisionCount(recordSessionId);
  const restore = page.getByRole("button", { name: /revision \d+ 복원/ }).last();
  await expect(restore).toBeVisible();
  await restore.click();
  await expect(page.getByRole("dialog", { name: /새 초안으로 복원/ })).toBeVisible();
  const restoreResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes(`/host/sessions/${recordSessionId}/revisions/`) &&
      response.url().includes("/restore-to-draft") &&
      response.ok(),
  );
  await page.getByRole("button", { name: "새 초안으로 복원" }).click();
  expect((await restoreResponse).ok()).toBe(true);
  await waitForDraftSaved(page);
  await reviewAndApply(page, "SKIP");
  await expect.poll(() => readSessionRecordRevisionCount(recordSessionId)).toBe(before + 1);
  await expect(page.getByText("과거 revision 복원").first()).toBeVisible();
});

test("7. next-book publication supports cancel, SKIP, and SEND without a default decision", async ({ page }) => {
  await loginHost(page);
  await page.goto(`${HOST_PATH}/sessions/new`);
  await page.getByLabel("세션 제목").fill("Next Book Confirmation Session");
  await page.getByLabel("책 제목").fill("Next Book Confirmation Book");
  await page.getByLabel("저자").fill("Public Fixture Author");
  await page.getByLabel("모임 날짜").fill("2026-08-20");
  await page.getByRole("button", { name: "세션 문서 저장" }).click();
  await expect(page).toHaveURL(/\/app\/host\/sessions\/[^/]+\/edit/);
  await expect(page.getByRole("heading", { name: /세션 문서 편집/ })).toBeVisible();
  nextBookSessionId = new URL(page.url()).pathname.split("/").at(-2) ?? "";
  expect(nextBookSessionId).not.toBe("");

  await page.goto(HOST_PATH);
  const visibilityButton = page.getByRole("button", {
    name: /Next Book Confirmation Book 공개 범위를 멤버 공개로 변경/,
  });
  await visibilityButton.click();
  await expect(page.getByRole("radio", { name: "알림 보내고 반영" })).not.toBeChecked();
  await expect(page.getByRole("radio", { name: "알림 없이 반영" })).not.toBeChecked();
  await page.getByRole("button", { name: "취소" }).click();
  expect(await readHostActionDecision(nextBookSessionId)).toBeNull();

  await visibilityButton.click();
  await page.getByRole("radio", { name: "알림 없이 반영" }).click();
  await page.getByRole("button", { name: "선택대로 반영" }).click();
  await expect.poll(() => readHostActionDecision(nextBookSessionId)).toBe("SKIP");
  expect(await readNotificationEventCount(nextBookSessionId, "NEXT_BOOK_PUBLISHED")).toBe(0);

  const privateButton = page.getByRole("button", {
    name: /Next Book Confirmation Book 공개 범위를 비공개로 변경/,
  });
  await privateButton.click();
  await visibilityButton.click();
  await page.getByRole("radio", { name: "알림 보내고 반영" }).click();
  await page.getByRole("button", { name: "선택대로 반영" }).click();
  await expect.poll(() => readHostActionDecision(nextBookSessionId)).toBe("SEND");
  await expect.poll(() => readNotificationEventCount(nextBookSessionId, "NEXT_BOOK_PUBLISHED")).toBe(1);
});

test("8. 320px host record navigation and confirmation sheet remain accessible", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await loginHost(page);
  await page.goto(`${HOST_PATH}/sessions`);
  await expect(page.getByRole("heading", { name: "세션 기록 장부" })).toBeVisible();
  await page.getByRole("searchbox", { name: "세션 기록 검색" }).fill(RECORD_BOOK);
  await page.getByRole("button", { name: "검색" }).click();
  await page.getByRole("link", { name: new RegExp(`^${recordSessionNumber}회차`) }).first().click();
  await page.getByRole("tab", { name: "공개 기록" }).click();
  await page.getByLabel("공개 요약").fill("모바일 확인용 미적용 초안");
  await waitForDraftSaved(page);
  await page.getByRole("button", { name: "변경사항 검토" }).click();

  const dialog = page.getByRole("dialog", { name: "반영 방법을 선택해 주세요" });
  const sheet = page.getByTestId("host-action-dialog-sheet");
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("radio", { name: "알림 보내고 반영" })).toBeFocused();
  await expect(page.getByRole("radio", { name: "알림 보내고 반영" })).not.toBeChecked();
  await expect(page.getByRole("radio", { name: "알림 없이 반영" })).not.toBeChecked();
  const box = await sheet.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  expect(Math.abs(box!.y + box!.height - 720)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "취소" }).click();
  await expect(dialog).toBeHidden();
});
