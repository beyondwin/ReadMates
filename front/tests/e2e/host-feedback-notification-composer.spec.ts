import { expect, test, type Page, type Route } from "@playwright/test";
import type {
  AiGenerationJobResponse,
  SessionImportV1,
} from "@/features/host/aigen/api/aigen-contracts";
import type { HostSessionDetailResponse } from "@/features/host/model/host-view-types";
import {
  countManualNotificationEventsForSession,
  loginWithGoogleFixture,
  readNotificationEventCount,
  readSessionRecordRevisionCount,
  resetE2eState,
  runMysql,
} from "./readmates-e2e-db";

test.describe.configure({ mode: "serial" });

const CLUB_SLUG = "reading-sai";
const HOST_PATH = `/clubs/${CLUB_SLUG}/app/host`;
const RECORD_BOOK = "Feedback Composer Contract Book";
const IMPORT_SUMMARY = "JSON 가져오기로 저장한 공개 안전 초안";
const UPDATED_SUMMARY = "최종 반영 뒤 알림 작성기를 여는 수정 요약";
const FINAL_SUMMARY = "stale 확인 뒤 새 알림을 작성하는 최종 요약";
const AI_JOB_ID = "22222222-2222-4222-8222-222222222222";

function resetFeedbackComposerState() {
  resetE2eState({
    cleanupGeneratedSessions: true,
    cleanupManualNotifications: true,
    googleLoginEmails: ["host@example.com", "member1@example.com", "member2@example.com"],
  });
}

function sqlValue(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function fetchHostSession(page: Page, sessionId: string): Promise<HostSessionDetailResponse> {
  return page.evaluate(async ({ id, clubSlug }) => {
    const response = await fetch(
      `/api/bff/api/host/sessions/${encodeURIComponent(id)}?clubSlug=${encodeURIComponent(clubSlug)}`,
    );
    if (!response.ok) {
      throw new Error(`session detail failed: ${response.status}`);
    }
    return response.json();
  }, { id: sessionId, clubSlug: CLUB_SLUG });
}

function activeParticipantNames(sessionId: string) {
  return runMysql(`
select users.name
from session_participants
join memberships on memberships.id = session_participants.membership_id
  and memberships.club_id = session_participants.club_id
join users on users.id = memberships.user_id
where session_participants.session_id = ${sqlValue(sessionId)}
  and session_participants.participation_status = 'ACTIVE'
order by session_participants.created_at, session_participants.id;
`)
    .trim()
    .split("\n")
    .slice(1)
    .filter(Boolean);
}

function feedbackMarkdown(sessionNumber: number, authorName: string) {
  return `<!-- readmates-feedback:v1 -->

# 독서모임 ${sessionNumber}차 피드백

${RECORD_BOOK} · 2026.08.20

## 메타

- 일시: 2026.08.20 (목) · 20:00
- 책: ${RECORD_BOOK}
- 참여자: ${authorName}

## 관찰자 노트

공개 안전한 합성 관찰 기록입니다.

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

async function fulfillJson(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function aiSnapshot(sessionNumber: number): SessionImportV1 {
  return {
    format: "readmates.session.v1",
    sessionNumber,
    bookTitle: RECORD_BOOK,
    meetingDate: "2026-08-20",
    summary: "AI가 생성한 공개 안전 초안",
    highlights: [{ authorName: "공개 회원 A", text: "공개 합성 하이라이트" }],
    oneLineReviews: [{ authorName: "공개 회원 B", text: "공개 합성 한줄평" }],
    feedbackDocumentFileName: `session-${sessionNumber}-feedback.md`,
    feedbackDocumentMarkdown: "# 공개 합성 피드백",
  };
}

function succeededAiJob(sessionNumber: number): AiGenerationJobResponse {
  return {
    jobId: AI_JOB_ID,
    status: "SUCCEEDED",
    stage: "READY",
    progressPct: 100,
    model: "claude-sonnet-4-6",
    result: aiSnapshot(sessionNumber),
    error: null,
    tokens: { input: 1000, cachedInput: 0, output: 500 },
    costEstimateUsd: "0.12",
    warnings: [],
  };
}

async function installAiDraftRoutes(page: Page, sessionId: string, sessionNumber: number) {
  await page.route("**/api/bff/api/host/clubs/*/ai-defaults**", async (route) => {
    await fulfillJson(route, 200, { defaultModel: "claude-sonnet-4-6" });
  });
  await page.route(`**/api/bff/api/host/sessions/${sessionId}/ai-generate/models**`, async (route) => {
    await fulfillJson(route, 200, {
      models: [{ id: "claude-sonnet-4-6", provider: "CLAUDE", isDefault: true }],
    });
  });
  await page.route(`**/api/bff/api/host/sessions/${sessionId}/ai-generate/jobs/recent**`, async (route) => {
    await route.fulfill({ status: 204 });
  });
  await page.route(
    `**/api/bff/api/host/sessions/${sessionId}/ai-generate/jobs/${AI_JOB_ID}**`,
    async (route) => {
      if (route.request().method() === "POST" && route.request().url().includes("/commit")) {
        await fulfillJson(route, 200, {
          sessionId,
          status: "COMMITTED",
          recovered: false,
          participantUpdatesCount: 2,
          draftRevision: 2,
          baseLiveRevision: 0,
          liveApplied: false,
        });
        return;
      }
      if (route.request().method() === "GET") {
        await fulfillJson(route, 200, succeededAiJob(sessionNumber));
        return;
      }
      await route.fallback();
    },
  );
  await page.route(
    `**/api/bff/api/host/sessions/${sessionId}/ai-generate/jobs**`,
    async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (
        route.request().method() === "POST"
        && pathname.endsWith(`/host/sessions/${sessionId}/ai-generate/jobs`)
      ) {
        await fulfillJson(route, 202, {
          jobId: AI_JOB_ID,
          status: "PENDING",
          expiresAt: "2099-01-01T00:00:00Z",
        });
        return;
      }
      await route.fallback();
    },
  );
}

async function waitForDraftSaved(page: Page) {
  await expect(page.getByText("초안 저장됨 · 검토 후 반영").first())
    .toBeVisible({ timeout: 15_000 });
}

async function reviewAndApply(page: Page, sessionId: string) {
  const previewResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST"
      && response.url().includes(`/host/sessions/${sessionId}/record-apply-preview`),
  );
  await page.getByRole("button", { name: "변경사항 검토" }).click();
  const preview = await previewResponse;
  expect(preview.status(), await preview.text()).toBe(200);
  const dialog = page.getByRole("dialog", { name: "기록 반영 확인" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("radio", { name: /알림/ })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "기록 반영" })).toBeEnabled();
  return dialog;
}

async function applyConcurrentRecordRevision(page: Page, sessionId: string) {
  return page.evaluate(async ({ id, clubSlug }) => {
    const basePath = `/api/bff/api/host/sessions/${encodeURIComponent(id)}`;
    const scopedPath = (suffix: string) =>
      `${basePath}/${suffix}?clubSlug=${encodeURIComponent(clubSlug)}`;
    const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
      const response = await fetch(path, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...init?.headers,
        },
      });
      if (!response.ok) {
        throw new Error(`${path} failed: ${response.status} ${await response.text()}`);
      }
      return response.json() as Promise<T>;
    };
    const editor = await requestJson<{
      liveRevision: number;
      liveSnapshot: {
        schema: "readmates-session-record:v1";
        visibility: "HOST_ONLY" | "MEMBER" | "PUBLIC";
        publicationSummary: string;
        highlights: unknown[];
        oneLineReviews: unknown[];
        feedbackDocument: {
          fileName: string;
          title: string;
          markdown: string;
        };
      };
      draft: { draftRevision: number } | null;
    }>(scopedPath("record-editor"));
    const draft = await requestJson<{ draftRevision: number }>(
      scopedPath("record-draft"),
      {
        method: "PATCH",
        body: JSON.stringify({
          expectedDraftRevision: editor.draft?.draftRevision ?? null,
          snapshot: {
            ...editor.liveSnapshot,
            publicationSummary: `${editor.liveSnapshot.publicationSummary} · 동시 수정`,
          },
        }),
      },
    );
    const preview = await requestJson<{ expectedDraftHash: string }>(
      scopedPath("record-apply-preview"),
      {
        method: "POST",
        body: JSON.stringify({
          expectedDraftRevision: draft.draftRevision,
          expectedLiveRevision: editor.liveRevision,
        }),
      },
    );
    return requestJson<{
      liveRevision: number;
      composer: { contentRevision: string };
    }>(
      scopedPath("record-apply"),
      {
        method: "POST",
        body: JSON.stringify({
          applyRequestId: crypto.randomUUID(),
          expectedDraftRevision: draft.draftRevision,
          expectedLiveRevision: editor.liveRevision,
          expectedDraftHash: preview.expectedDraftHash,
        }),
      },
    );
  }, { id: sessionId, clubSlug: CLUB_SLUG });
}

test.beforeEach(resetFeedbackComposerState);
test.afterEach(resetFeedbackComposerState);

test("draft commits stay silent and final apply composes without automatic dispatch", async ({ page }) => {
  test.setTimeout(90_000);
  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto(`${HOST_PATH}/sessions/new`);
  await page.getByLabel("세션 제목").fill("Feedback Composer Contract Session");
  await page.getByLabel("책 제목").fill(RECORD_BOOK);
  await page.getByLabel("저자").fill("Public Fixture Author");
  await page.getByLabel("모임 날짜").fill("2026-08-20");
  await page.getByRole("button", { name: "세션 문서 저장" }).click();
  await expect(page).toHaveURL(/\/app\/host\/sessions\/[^/]+\/edit/);
  const sessionId = new URL(page.url()).pathname.split("/").at(-2) ?? "";
  expect(sessionId).not.toBe("");
  const detail = await fetchHostSession(page, sessionId);

  runMysql(`
insert into session_participants (
  id,
  club_id,
  session_id,
  membership_id,
  rsvp_status,
  attendance_status,
  participation_status
)
select
  uuid(),
  memberships.club_id,
  ${sqlValue(sessionId)},
  memberships.id,
  'GOING',
  'ATTENDED',
  'ACTIVE'
from memberships
join users on users.id = memberships.user_id
where memberships.club_id = '00000000-0000-0000-0000-000000000001'
  and memberships.status = 'ACTIVE'
  and lower(users.email) in ('member1@example.com', 'member2@example.com')
on duplicate key update
  rsvp_status = 'GOING',
  attendance_status = 'ATTENDED',
  participation_status = 'ACTIVE';

update sessions
set state = 'CLOSED',
    updated_at = utc_timestamp(6)
where id = ${sqlValue(sessionId)};
`);

  await page.goto(`${HOST_PATH}/sessions/${sessionId}/edit?records=json`);
  const authors = activeParticipantNames(sessionId);
  expect(authors.length).toBeGreaterThanOrEqual(1);
  const firstAuthor = authors[0]!;
  const secondAuthor = authors[1] ?? firstAuthor;

  const initialDraftSave = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH"
      && response.url().includes(`/host/sessions/${sessionId}/record-draft`),
  );
  await page.getByRole("radio", { name: "멤버 공개" }).click();
  const initialDraft = await initialDraftSave;
  expect(initialDraft.status(), await initialDraft.text()).toBe(200);
  await waitForDraftSaved(page);

  await page.locator("#session-import-json-file").setInputFiles({
    name: "session-record-draft.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      format: "readmates-session-import:v1",
      session: {
        number: detail.sessionNumber,
        bookTitle: RECORD_BOOK,
        meetingDate: detail.date,
      },
      publication: { summary: IMPORT_SUMMARY },
      highlights: [{ authorName: firstAuthor, text: "공개 안전한 E2E 하이라이트" }],
      oneLineReviews: [{ authorName: secondAuthor, text: "공개 안전한 E2E 한줄평" }],
      feedbackDocument: {
        fileName: `session-${detail.sessionNumber}-feedback.md`,
        markdown: feedbackMarkdown(detail.sessionNumber, firstAuthor),
      },
    })),
  });
  await expect(page.getByRole("region", { name: "세션 기록 미리보기" })).toBeVisible();
  const importResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST"
      && response.url().includes(`/host/sessions/${sessionId}/session-import/commit`),
  );
  await page.getByRole("button", { name: "초안으로 가져오기" }).click();
  const imported = await importResponse;
  expect(imported.status(), await imported.text()).toBe(200);
  await expect(page.getByRole("region", { name: "세션 기록 초안 저장 결과" }))
    .toContainText("알림은 생성되지 않습니다");
  await expect(page.getByRole("dialog", { name: "알림 보내기" })).toHaveCount(0);
  expect(await readNotificationEventCount(sessionId, "FEEDBACK_DOCUMENT_PUBLISHED")).toBe(0);
  expect(countManualNotificationEventsForSession(sessionId, "FEEDBACK_DOCUMENT_PUBLISHED")).toBe(0);

  await installAiDraftRoutes(page, sessionId, detail.sessionNumber);
  await page.getByRole("tab", { name: "AI로 생성" }).click();
  await page.getByLabel(/대본 파일/).setInputFiles({
    name: "transcript.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("공개 회원 A 00:00\n공개 안전한 합성 대화"),
  });
  await page.getByRole("button", { name: /생성 시작/ }).click();
  await expect(page.getByText(/AI가 생성한 기록 미리보기/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "초안으로 저장" }).click();
  await expect(page.getByText(/AI 기록을 공유 초안으로 저장했습니다/))
    .toContainText("알림은 생성되지 않습니다");
  await expect(page.getByRole("dialog", { name: "알림 보내기" })).toHaveCount(0);
  expect(await readNotificationEventCount(sessionId, "FEEDBACK_DOCUMENT_PUBLISHED")).toBe(0);

  await page.reload();
  await expect(page.getByLabel("공개 요약")).toHaveValue(IMPORT_SUMMARY);
  const revisionsBeforeApply = await readSessionRecordRevisionCount(sessionId);
  const applyRequestIds: string[] = [];
  let loseFirstResponse = true;
  await page.route(`**/api/bff/api/host/sessions/${sessionId}/record-apply**`, async (route) => {
    if (new URL(route.request().url()).pathname.endsWith("/record-apply-preview")) {
      await route.fallback();
      return;
    }
    const body = route.request().postDataJSON() as { applyRequestId: string };
    applyRequestIds.push(body.applyRequestId);
    if (loseFirstResponse) {
      loseFirstResponse = false;
      const response = await route.fetch();
      expect(response.status(), await response.text()).toBe(200);
      await route.abort("failed");
      return;
    }
    await route.continue();
  });

  const applyDialog = await reviewAndApply(page, sessionId);
  await applyDialog.getByRole("button", { name: "기록 반영" }).click();
  await expect(page.getByText(/처리 결과를 확인하지 못했습니다/)).toBeVisible();
  const revisionsAfterLostResponse = await readSessionRecordRevisionCount(sessionId);
  expect(revisionsAfterLostResponse).toBeGreaterThan(revisionsBeforeApply);
  await applyDialog.getByRole("button", { name: "기록 반영" }).click();
  await expect(page.getByRole("dialog", { name: "알림 보내기" })).toBeVisible();
  expect(applyRequestIds).toHaveLength(2);
  expect(new Set(applyRequestIds).size).toBe(1);
  await expect.poll(() => readSessionRecordRevisionCount(sessionId))
    .toBe(revisionsAfterLostResponse);
  expect(await readNotificationEventCount(sessionId, "FEEDBACK_DOCUMENT_PUBLISHED")).toBe(0);

  await page.getByRole("button", { name: "이번에는 보내지 않기" }).click();
  await expect(page.getByRole("dialog", { name: "알림 보내기" })).toBeHidden();
  expect(await readNotificationEventCount(sessionId, "FEEDBACK_DOCUMENT_PUBLISHED")).toBe(0);
  expect(countManualNotificationEventsForSession(sessionId, "FEEDBACK_DOCUMENT_PUBLISHED")).toBe(0);

  await page.getByLabel("공개 요약").fill(UPDATED_SUMMARY);
  await waitForDraftSaved(page);
  const secondApplyDialog = await reviewAndApply(page, sessionId);
  await secondApplyDialog.getByRole("button", { name: "기록 반영" }).click();
  await expect(page.getByRole("dialog", { name: "알림 보내기" })).toBeVisible();
  expect(applyRequestIds.at(-1)).not.toBe(applyRequestIds[0]);
  expect(await readNotificationEventCount(sessionId, "SESSION_RECORD_UPDATED")).toBe(0);

  const stalePreviewResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST"
      && new URL(response.url()).pathname.endsWith("/host/notifications/manual/preview"),
  );
  await page.getByRole("button", { name: "알림 미리보기" }).click();
  const stalePreview = await stalePreviewResponse;
  expect(stalePreview.status(), await stalePreview.text()).toBe(200);
  await expect(page.getByRole("region", { name: "발송 전 확인" })).toBeVisible();
  expect(await readNotificationEventCount(sessionId, "SESSION_RECORD_UPDATED")).toBe(0);

  runMysql(`
update notification_manual_dispatch_previews
set expires_at = date_sub(utc_timestamp(6), interval 1 second)
where id = (
  select preview_id
  from (
    select id as preview_id
    from notification_manual_dispatch_previews
    order by created_at desc
    limit 1
  ) as latest_preview
);
`);
  await page.getByRole("button", { name: "발송 확인" }).click();
  await expect(
    page.getByText("미리보기가 만료되었습니다. 새 미리보기를 만든 뒤 다시 발송해 주세요."),
  ).toBeVisible();
  expect(await readNotificationEventCount(sessionId, "SESSION_RECORD_UPDATED")).toBe(0);
  expect(countManualNotificationEventsForSession(sessionId, "SESSION_RECORD_UPDATED")).toBe(0);

  const revisionPreviewResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST"
      && new URL(response.url()).pathname.endsWith("/host/notifications/manual/preview"),
  );
  await page.getByRole("button", { name: "알림 미리보기" }).click();
  const revisionPreview = await revisionPreviewResponse;
  expect(revisionPreview.status(), await revisionPreview.text()).toBe(200);
  await expect(page.getByRole("region", { name: "발송 전 확인" })).toBeVisible();

  const concurrentApply = await applyConcurrentRecordRevision(page, sessionId);
  expect(concurrentApply.liveRevision).toBeGreaterThan(0);
  expect(concurrentApply.composer.contentRevision).toMatch(/^[0-9a-f]{64}$/);
  await page.getByRole("button", { name: "발송 확인" }).click();
  await expect(
    page.getByText("알림 내용 또는 세션 상태가 변경되었습니다. 최신 저장 결과에서 작성기를 다시 열어 주세요."),
  ).toBeVisible();
  expect(await readNotificationEventCount(sessionId, "SESSION_RECORD_UPDATED")).toBe(0);
  expect(countManualNotificationEventsForSession(sessionId, "SESSION_RECORD_UPDATED")).toBe(0);

  await page.getByRole("button", { name: "이번에는 보내지 않기" }).click();
  await page.reload();
  await page.getByLabel("공개 요약").fill(FINAL_SUMMARY);
  await waitForDraftSaved(page);
  const finalApplyDialog = await reviewAndApply(page, sessionId);
  await finalApplyDialog.getByRole("button", { name: "기록 반영" }).click();
  await expect(page.getByRole("dialog", { name: "알림 보내기" })).toBeVisible();

  const freshPreviewResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST"
      && new URL(response.url()).pathname.endsWith("/host/notifications/manual/preview"),
  );
  await page.getByRole("button", { name: "알림 미리보기" }).click();
  const freshPreview = await freshPreviewResponse;
  expect(freshPreview.status(), await freshPreview.text()).toBe(200);
  await expect(page.getByRole("region", { name: "발송 전 확인" })).toBeVisible();
  await page.getByRole("button", { name: "발송 확인" }).click();
  await expect.poll(
    () => countManualNotificationEventsForSession(sessionId, "SESSION_RECORD_UPDATED"),
  ).toBe(1);
  await expect.poll(
    () => readNotificationEventCount(sessionId, "SESSION_RECORD_UPDATED"),
  ).toBe(1);
});
