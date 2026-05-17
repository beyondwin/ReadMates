# ReadMates Session Record Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the standalone feedback document upload path with an AI-first, JSON-fallback session record completion workflow that saves summary, highlights, one-line reviews, and feedback document as one package.

**Architecture:** Frontend host editing keeps one report-area panel that owns AI generation and JSON import modes. Backend removes the direct feedback upload mutation while moving `FEEDBACK_DOCUMENT_PUBLISHED` event creation into the `SessionImportService` package commit path. Existing feedback document read APIs, DB rows, and member/host access rules stay intact.

**Tech Stack:** React/Vite, React Router, TanStack Query, Kotlin/Spring Boot, JDBC, MySQL/Flyway, MockMvc, Vitest, Playwright.

---

## Scope Check

This plan crosses frontend, server, and docs, but it is one coupled workflow: "how hosts complete post-session records." The server and frontend tasks are not independent products because removing the standalone upload API only makes sense after the import/AI commit path preserves feedback document notifications.

## File Structure

Server files:

- Modify: `server/src/main/kotlin/com/readmates/sessionimport/application/model/SessionImportModels.kt`
  - Add feedback document version to the commit result only if a caller needs it. Prefer keeping public response unchanged unless tests need version in web JSON.
- Modify: `server/src/main/kotlin/com/readmates/sessionimport/application/port/out/SessionImportWritePort.kt`
  - Add `version: Int` to `SessionImportStoredFeedbackDocument`.
- Modify: `server/src/main/kotlin/com/readmates/sessionimport/adapter/out/persistence/JdbcSessionImportWriteAdapter.kt`
  - Return the newly stored feedback document version from `storeFeedbackDocument`.
- Modify: `server/src/main/kotlin/com/readmates/sessionimport/application/service/SessionImportService.kt`
  - Inject `RecordNotificationEventUseCase` and record `FEEDBACK_DOCUMENT_PUBLISHED` after successful replacement.
- Modify: `server/src/main/kotlin/com/readmates/feedback/adapter/in/web/FeedbackDocumentController.kt`
  - Remove the multipart upload endpoint.
- Delete: `server/src/main/kotlin/com/readmates/feedback/adapter/in/web/FeedbackDocumentUploadValidator.kt`
- Modify: `server/src/main/kotlin/com/readmates/feedback/application/port/in/FeedbackDocumentUseCases.kt`
  - Remove upload use case interfaces.
- Delete: `server/src/main/kotlin/com/readmates/feedback/application/model/FeedbackDocumentCommands.kt`
- Modify: `server/src/main/kotlin/com/readmates/feedback/application/service/FeedbackDocumentService.kt`
  - Remove upload orchestration and notification dependency.
- Modify: `server/src/main/kotlin/com/readmates/feedback/application/port/out/FeedbackDocumentStorePort.kt`
  - Remove upload-only methods.
- Modify: `server/src/main/kotlin/com/readmates/feedback/adapter/out/persistence/JdbcFeedbackDocumentStoreAdapter.kt`
  - Remove upload-only persistence methods.
- Test: `server/src/test/kotlin/com/readmates/sessionimport/application/service/SessionImportServiceCommitValidatedTest.kt`
- Test: `server/src/test/kotlin/com/readmates/sessionimport/api/HostSessionImportControllerDbTest.kt`
- Test: `server/src/test/kotlin/com/readmates/feedback/api/FeedbackDocumentControllerTest.kt`

Frontend files:

- Create: `front/features/host/ui/session-editor/session-record-completion-panel.tsx`
  - One panel for AI generation and JSON fallback.
- Modify: `front/features/host/ui/host-session-editor.tsx`
  - Remove standalone feedback upload state/action/rendering and mount the new completion panel.
- Delete: `front/features/host/ui/host-session-feedback-upload.tsx`
- Modify: `front/features/host/ui/session-editor/mobile-editor-tabs.tsx`
  - Replace report panel IDs with the single completion panel ID.
- Modify: `front/features/host/route/host-session-editor-actions.ts`
  - Remove `uploadFeedbackDocument`.
- Modify: `front/features/host/route/host-session-editor-data.ts`
  - Remove upload action wiring.
- Modify: `front/features/host/api/host-api.ts`
  - Remove `uploadHostSessionFeedbackDocument`.
- Test: `front/tests/unit/host-session-editor.test.tsx`
- Required E2E update: `front/tests/e2e/aigen-jsonupload-coexistence.spec.ts` — 기본 모드가 `json`에서 `aigen`으로 바뀌고 JSON 진입 param이 `aigen=1` 삭제에서 `records=json` 추가로 바뀌므로 이 테스트는 반드시 갱신해야 한다. 다른 `?aigen=1`을 사용하는 aigen E2E는 새 contract에서도 aigen 모드로 그대로 진입하므로 변경이 필요하지 않다.

Docs files after implementation:

- Modify: `docs/development/architecture.md`
- Modify: `docs/development/session-import-generator.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

---

### Task 1: Move Feedback Document Notifications To Session Import Commit

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/sessionimport/application/port/out/SessionImportWritePort.kt`
- Modify: `server/src/main/kotlin/com/readmates/sessionimport/adapter/out/persistence/JdbcSessionImportWriteAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/sessionimport/application/service/SessionImportService.kt`
- Test: `server/src/test/kotlin/com/readmates/sessionimport/application/service/SessionImportServiceCommitValidatedTest.kt`
- Test: `server/src/test/kotlin/com/readmates/sessionimport/api/HostSessionImportControllerDbTest.kt`

- [ ] **Step 1: Write the failing unit test for notification recording**

In `server/src/test/kotlin/com/readmates/sessionimport/application/service/SessionImportServiceCommitValidatedTest.kt`, add imports:

```kotlin
import com.readmates.notification.application.port.`in`.RecordNotificationEventUseCase
```

Change service construction inside `commitValidated returns same sessionId and triggers cache eviction`:

```kotlin
val writePort = RecordingWritePort(target)
val cache = RecordingCacheInvalidation()
val notificationEvents = RecordingNotificationEvents()
val service =
    SessionImportService(
        writePort = writePort,
        recordNotificationEventUseCase = notificationEvents,
        cacheInvalidation = cache,
    )
```

Add assertions after the cache assertions:

```kotlin
assertEquals(1, notificationEvents.feedbackEvents.size)
val event = notificationEvents.feedbackEvents.single()
assertEquals(clubId, event.clubId)
assertEquals(sessionId, event.sessionId)
assertEquals(7951, event.sessionNumber)
assertEquals("Import Test Book", event.bookTitle)
assertEquals(2, event.documentVersion)
```

Change `RecordingWritePort.replaceRecords` to return a version:

```kotlin
return SessionImportStoredFeedbackDocument(
    fileName = command.feedbackDocument.fileName,
    title = command.feedbackTitle,
    uploadedAt = "2026-05-16T00:00:00Z",
    version = 2,
)
```

Add this fake near the bottom of the test file. The `recordSessionReminderDue` signature uses `java.time.LocalDate`, so ensure the import is present:

```kotlin
import java.time.LocalDate
```

```kotlin
private data class RecordedFeedbackEvent(
    val clubId: UUID,
    val sessionId: UUID,
    val sessionNumber: Int,
    val bookTitle: String,
    val documentVersion: Int,
)

private class RecordingNotificationEvents : RecordNotificationEventUseCase {
    val feedbackEvents = mutableListOf<RecordedFeedbackEvent>()

    override fun recordFeedbackDocumentPublished(
        clubId: UUID,
        sessionId: UUID,
        sessionNumber: Int,
        bookTitle: String,
        documentVersion: Int,
    ) {
        feedbackEvents += RecordedFeedbackEvent(clubId, sessionId, sessionNumber, bookTitle, documentVersion)
    }

    override fun recordNextBookPublished(
        clubId: UUID,
        sessionId: UUID,
        sessionNumber: Int,
        bookTitle: String,
    ) = Unit

    override fun recordReviewPublished(
        clubId: UUID,
        sessionId: UUID,
        sessionNumber: Int,
        bookTitle: String,
        authorMembershipId: UUID,
    ) = Unit

    override fun recordSessionReminderDue(targetDate: LocalDate) = Unit

    override fun recordAiGenerationReady(
        jobId: UUID,
        sessionId: UUID,
        clubId: UUID,
        hostUserId: UUID,
    ) = Unit
}
```

- [ ] **Step 2: Run the focused unit test and verify it fails**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.sessionimport.application.service.SessionImportServiceCommitValidatedTest'
```

Expected: FAIL at compile time because `SessionImportStoredFeedbackDocument` has no `version` property or `SessionImportService` has no `recordNotificationEventUseCase` constructor parameter.

- [ ] **Step 3: Write the failing integration test for the outbox row**

In `server/src/test/kotlin/com/readmates/sessionimport/api/HostSessionImportControllerDbTest.kt`, add this line at the top of `CLEANUP_SQL`:

```sql
delete from notification_event_outbox where aggregate_id = '$SESSION_ID';
```

At the end of `host commits session import and replaces existing records`, after `assertCommittedImportRecords()`, add:

```kotlin
assertFeedbackDocumentNotificationEvent()
```

Add this helper in the test class:

```kotlin
private fun assertFeedbackDocumentNotificationEvent() {
    val documentVersion =
        jdbcTemplate.queryForObject(
            """
            select max(version)
            from session_feedback_documents
            where club_id = '$CLUB_ID'
              and session_id = '$SESSION_ID'
            """.trimIndent(),
            Int::class.java,
        )

    val event =
        jdbcTemplate.queryForMap(
            """
            select
              dedupe_key,
              json_unquote(json_extract(payload_json, '$.sessionId')) as session_id,
              cast(json_unquote(json_extract(payload_json, '$.sessionNumber')) as signed) as session_number,
              json_unquote(json_extract(payload_json, '$.bookTitle')) as book_title,
              cast(json_unquote(json_extract(payload_json, '$.documentVersion')) as signed) as document_version
            from notification_event_outbox
            where event_type = 'FEEDBACK_DOCUMENT_PUBLISHED'
              and aggregate_id = '$SESSION_ID'
            """.trimIndent(),
        )

    assertEquals("feedback-document:$SESSION_ID:$documentVersion", event["dedupe_key"])
    assertEquals(SESSION_ID, event["session_id"])
    assertEquals(7951, (event["session_number"] as Number).toInt())
    assertEquals("Import Test Book", event["book_title"])
    assertEquals(documentVersion, (event["document_version"] as Number).toInt())
}
```

- [ ] **Step 4: Run the focused integration test and verify it fails**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.sessionimport.api.HostSessionImportControllerDbTest.host commits session import and replaces existing records'
```

Expected: FAIL because no `FEEDBACK_DOCUMENT_PUBLISHED` event is written by session import commit.

- [ ] **Step 5: Implement the notification handoff**

In `server/src/main/kotlin/com/readmates/sessionimport/application/port/out/SessionImportWritePort.kt`, change:

```kotlin
data class SessionImportStoredFeedbackDocument(
    val fileName: String,
    val title: String,
    val uploadedAt: String?,
)
```

to:

```kotlin
data class SessionImportStoredFeedbackDocument(
    val fileName: String,
    val title: String,
    val uploadedAt: String?,
    val version: Int,
)
```

In `server/src/main/kotlin/com/readmates/sessionimport/adapter/out/persistence/JdbcSessionImportWriteAdapter.kt`, return `version = nextVersion`:

```kotlin
return SessionImportStoredFeedbackDocument(
    fileName = fileName,
    title = command.feedbackTitle,
    uploadedAt = uploadedAt,
    version = nextVersion,
)
```

In `server/src/main/kotlin/com/readmates/sessionimport/application/service/SessionImportService.kt`, import:

```kotlin
import com.readmates.notification.application.port.`in`.RecordNotificationEventUseCase
```

Change the constructor:

```kotlin
class SessionImportService(
    private val writePort: SessionImportWritePort,
    private val recordNotificationEventUseCase: RecordNotificationEventUseCase,
    private val cacheInvalidation: ReadCacheInvalidationPort = ReadCacheInvalidationPort.Noop(),
)
```

After `val storedFeedback = writePort.replaceRecords(...)`, before cache invalidation, add:

```kotlin
recordNotificationEventUseCase.recordFeedbackDocumentPublished(
    clubId = command.host.clubId,
    sessionId = command.sessionId,
    sessionNumber = command.session.number,
    bookTitle = command.session.bookTitle,
    documentVersion = storedFeedback.version,
)
```

Notification 이중 발화 검증 (no separate work — record only):

- `AiGenerationCommitService`는 `commitDelegate.commitValidated(...)`로 위임할 뿐 자체적으로 `recordFeedbackDocumentPublished`를 호출하지 않는다 (현재 `AiGenerationNotificationDispatcher`는 `recordAiGenerationReady`만 호출). 따라서 알림 호출을 `commitValidated`로 옮겨도 AI commit 경로에서 정확히 1회만 발화한다.
- `FeedbackDocumentService`의 호출처(`uploadHostFeedbackDocument` 안)는 Task 2에서 method 자체가 삭제되므로 중복 source가 남지 않는다.

- [ ] **Step 6: Run the focused tests and verify they pass**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.sessionimport.application.service.SessionImportServiceCommitValidatedTest' --tests 'com.readmates.sessionimport.api.HostSessionImportControllerDbTest.host commits session import and replaces existing records'
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add server/src/main/kotlin/com/readmates/sessionimport/application/port/out/SessionImportWritePort.kt \
  server/src/main/kotlin/com/readmates/sessionimport/adapter/out/persistence/JdbcSessionImportWriteAdapter.kt \
  server/src/main/kotlin/com/readmates/sessionimport/application/service/SessionImportService.kt \
  server/src/test/kotlin/com/readmates/sessionimport/application/service/SessionImportServiceCommitValidatedTest.kt \
  server/src/test/kotlin/com/readmates/sessionimport/api/HostSessionImportControllerDbTest.kt
git commit -m "feat(server): publish feedback events from session imports"
```

---

### Task 2: Remove The Server Standalone Feedback Upload Mutation

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/feedback/adapter/in/web/FeedbackDocumentController.kt`
- Delete: `server/src/main/kotlin/com/readmates/feedback/adapter/in/web/FeedbackDocumentUploadValidator.kt`
- Modify: `server/src/main/kotlin/com/readmates/feedback/application/port/in/FeedbackDocumentUseCases.kt`
- Delete: `server/src/main/kotlin/com/readmates/feedback/application/model/FeedbackDocumentCommands.kt`
- Modify: `server/src/main/kotlin/com/readmates/feedback/application/service/FeedbackDocumentService.kt`
- Modify: `server/src/main/kotlin/com/readmates/feedback/application/port/out/FeedbackDocumentStorePort.kt`
- Modify: `server/src/main/kotlin/com/readmates/feedback/adapter/out/persistence/JdbcFeedbackDocumentStoreAdapter.kt`
- Test: `server/src/test/kotlin/com/readmates/feedback/api/FeedbackDocumentControllerTest.kt`

- [ ] **Step 1: Add the endpoint-gone test**

In `server/src/test/kotlin/com/readmates/feedback/api/FeedbackDocumentControllerTest.kt`, add:

```kotlin
@Test
fun `host feedback document upload endpoint is removed`() {
    val file =
        MockMultipartFile(
            "file",
            "feedback-6.md",
            "text/markdown",
            validFeedbackMarkdown().toByteArray(StandardCharsets.UTF_8),
        )

    mockMvc
        .multipart("/api/host/sessions/00000000-0000-0000-0000-000000000306/feedback-document") {
            with(user("host@example.com"))
            file(file)
        }.andExpect {
            status { isNotFound() }
        }
}
```

- [ ] **Step 2: Run the endpoint-gone test and verify it fails**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.feedback.api.FeedbackDocumentControllerTest.host feedback document upload endpoint is removed'
```

Expected: FAIL because the endpoint still exists and returns `201 Created` for a valid upload.

- [ ] **Step 3: Remove obsolete upload tests**

In `FeedbackDocumentControllerTest.kt`, delete tests whose names start with these exact strings:

```text
host uploads markdown feedback document without csrf and receives parsed title
uploaded feedback document stores title for list projection
host feedback upload enqueues attendee notification
latest uploaded feedback document version wins for read list and status
host upload with missing marker returns bad request
host upload rejects unsupported extension
host upload rejects empty file
host upload rejects invalid utf8
host upload rejects too large file
host upload rejects long filename before persistence
host upload rejects slash filename before persistence
host upload rejects backslash filename before persistence
host upload rejects nul source text before persistence
member cannot upload markdown feedback document
member upload rejects before reading malformed file
```

Keep read/list/status tests and invalid stored document tests.

- [ ] **Step 4: Remove upload code from the controller and service layer**

In `FeedbackDocumentController.kt`, remove constructor parameters and imports for:

```kotlin
AuthorizeHostFeedbackDocumentUploadUseCase
UploadHostFeedbackDocumentUseCase
FeedbackDocumentUploadValidator
FeedbackDocumentUploadCommand
MediaType
PostMapping
ResponseStatus
MultipartFile
```

Delete the `uploadFeedbackDocument(...)` method entirely.

In `FeedbackDocumentUseCases.kt`, remove:

```kotlin
interface AuthorizeHostFeedbackDocumentUploadUseCase {
    fun authorizeHostFeedbackDocumentUpload(currentMember: CurrentMember)
}

interface UploadHostFeedbackDocumentUseCase {
    fun uploadHostFeedbackDocument(
        currentMember: CurrentMember,
        command: FeedbackDocumentUploadCommand,
    ): FeedbackDocumentResult
}
```

Remove the `FeedbackDocumentUploadCommand` import.

In `FeedbackDocumentService.kt`, remove implemented interfaces:

```kotlin
AuthorizeHostFeedbackDocumentUploadUseCase,
UploadHostFeedbackDocumentUseCase
```

Remove constructor dependencies:

```kotlin
private val recordNotificationEventUseCase: RecordNotificationEventUseCase,
private val operationalMetrics: ReadmatesOperationalMetrics,
```

Delete methods:

```kotlin
override fun authorizeHostFeedbackDocumentUpload(currentMember: CurrentMember)

@Transactional
override fun uploadHostFeedbackDocument(
    currentMember: CurrentMember,
    command: FeedbackDocumentUploadCommand,
): FeedbackDocumentResult
```

The `uploadHostFeedbackDocument` body currently contains a `recordNotificationEventUseCase.recordFeedbackDocumentPublished(...)` call (around `FeedbackDocumentService.kt:126`); deleting the method removes that call site so the only remaining source for `FEEDBACK_DOCUMENT_PUBLISHED` is the `SessionImportService.commitValidated(...)` site added in Task 1.

Keep `requireHostFeedbackDocumentUploadAccess` but rename it to `requireHostFeedbackDocumentStatusAccess` because it now guards status reads only. **Rename order:** delete `authorizeHostFeedbackDocumentUpload` and `uploadHostFeedbackDocument` first so that the only remaining caller is `getHostFeedbackDocumentStatus`; then rename. Performing the rename before the deletions leaves stale callers and breaks compilation.

- [ ] **Step 5: Remove upload-only persistence methods**

In `FeedbackDocumentStorePort.kt`, remove methods used only by uploads:

```kotlin
fun findSessionForUpload(
    clubId: UUID,
    sessionId: UUID,
): FeedbackDocumentSessionResult?

fun nextDocumentVersion(
    clubId: UUID,
    sessionId: UUID,
): Int

fun insertDocument(
    currentMember: CurrentMember,
    command: FeedbackDocumentUploadCommand,
    version: Int,
    documentId: UUID,
    title: String,
)
```

Remove corresponding implementations in `JdbcFeedbackDocumentStoreAdapter.kt`. Remove imports that become unused, especially `FeedbackDocumentUploadCommand`.

Delete files:

```bash
rm server/src/main/kotlin/com/readmates/feedback/adapter/in/web/FeedbackDocumentUploadValidator.kt
rm server/src/main/kotlin/com/readmates/feedback/application/model/FeedbackDocumentCommands.kt
```

- [ ] **Step 6: Run focused feedback and session import tests**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.feedback.api.FeedbackDocumentControllerTest' --tests 'com.readmates.sessionimport.api.HostSessionImportControllerDbTest'
```

Expected: PASS. The upload endpoint test returns 404; read/list/status tests still pass; session import writes feedback documents and notifications.

- [ ] **Step 7: Run a source search for removed upload symbols**

Run:

```bash
rg -n "UploadHostFeedbackDocument|AuthorizeHostFeedbackDocumentUpload|FeedbackDocumentUploadCommand|FeedbackDocumentUploadValidator|uploadFeedbackDocument\\(|uploadHostFeedbackDocument" server/src/main/kotlin server/src/test/kotlin
```

Expected: no output.

- [ ] **Step 8: Commit Task 2**

```bash
git add server/src/main/kotlin/com/readmates/feedback \
  server/src/test/kotlin/com/readmates/feedback/api/FeedbackDocumentControllerTest.kt
git commit -m "refactor(server): remove standalone feedback uploads"
```

---

### Task 3: Remove Frontend Upload Wiring And Add The Completion Panel Shell

**Files:**
- Create: `front/features/host/ui/session-editor/session-record-completion-panel.tsx`
- Modify: `front/features/host/ui/host-session-editor.tsx`
- Delete: `front/features/host/ui/host-session-feedback-upload.tsx`
- Modify: `front/features/host/ui/session-editor/mobile-editor-tabs.tsx`
- Modify: `front/features/host/route/host-session-editor-actions.ts`
- Modify: `front/features/host/route/host-session-editor-data.ts`
- Modify: `front/features/host/api/host-api.ts`
- Test: `front/tests/unit/host-session-editor.test.tsx`

- [ ] **Step 1: Update the host editor action type test fixture first**

In `front/tests/unit/host-session-editor.test.tsx`, remove `FeedbackDocumentResponse` from imports:

```ts
import type {
  HostSessionDeletionPreviewResponse,
  HostSessionDetailResponse,
  SessionImportRequest,
} from "@/features/host/api/host-contracts";
```

Delete `uploadFeedbackDocument` from `hostSessionEditorTestActions`.

Add a test near the existing feedback document render test:

```tsx
it("shows feedback document status without standalone upload controls", () => {
  render(<HostSessionEditorForTest session={session} clubSlug="club-a" />);

  expect(screen.getByText("세션 기록 완성")).toBeInTheDocument();
  expect(screen.getByText("업로드 완료")).toBeInTheDocument();
  expect(screen.getByText("251126 1차.md")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "미리보기" })).toHaveAttribute("href", "/app/feedback/session-1");
  expect(screen.queryByLabelText("피드백 문서 파일")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "교체" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "등록" })).not.toBeInTheDocument();
});
```

Delete tests:

```text
uploads the selected feedback document and updates status from the backend response
shows the upload failure toast when the feedback document request rejects
```

- [ ] **Step 2: Run the focused frontend test and verify it fails**

Run:

```bash
pnpm --dir front exec vitest run tests/unit/host-session-editor.test.tsx --runInBand
```

Expected: FAIL because `HostSessionEditorActions` still requires `uploadFeedbackDocument`, and the standalone upload controls still render.

- [ ] **Step 3: Create the completion panel shell**

Create `front/features/host/ui/session-editor/session-record-completion-panel.tsx`:

```tsx
import type { ChangeEvent, ComponentType, CSSProperties, ReactNode } from "react";
import { AiGenerateTab } from "@/features/host/aigen/ui/AiGenerateTab";
import type {
  SessionImportPreviewResponse,
  SessionRecordVisibility,
} from "@/features/host/model/host-view-types";
import type { ReadmatesReturnState } from "@/shared/routing/readmates-route-state";
import { Panel } from "./session-editor-panel";
import { SessionImportPanelBody } from "./session-import-panel";
import type { MobileEditorSection } from "./mobile-editor-tabs";

type FeedbackDocumentStatus = {
  uploaded: boolean;
  fileName: string | null;
};

type FeedbackPreviewLinkProps = {
  to: string;
  state?: ReadmatesReturnState;
  className?: string;
  children: ReactNode;
};

export type SessionRecordCompletionMode = "aigen" | "json";

type SessionRecordCompletionPanelProps = {
  activeMobileSection: MobileEditorSection;
  sessionId: string | undefined;
  clubSlug: string | undefined;
  mode: SessionRecordCompletionMode;
  canUseAigen: boolean;
  feedbackDocument: FeedbackDocumentStatus;
  previewState?: ReadmatesReturnState;
  LinkComponent: ComponentType<FeedbackPreviewLinkProps>;
  recordVisibility: SessionRecordVisibility;
  preview: SessionImportPreviewResponse | null;
  status: "idle" | "previewing" | "ready" | "committing" | "error";
  error: string | null;
  onModeChange: (mode: SessionRecordCompletionMode) => void;
  onAigenCommitted: () => void;
  onFileSelected: (event: ChangeEvent<HTMLInputElement>) => void;
  onCommit: () => void;
};

export function SessionRecordCompletionPanel({
  activeMobileSection,
  sessionId,
  clubSlug,
  mode,
  canUseAigen,
  feedbackDocument,
  previewState,
  LinkComponent,
  recordVisibility,
  preview,
  status,
  error,
  onModeChange,
  onAigenCommitted,
  onFileSelected,
  onCommit,
}: SessionRecordCompletionPanelProps) {
  const effectiveMode = canUseAigen ? mode : "json";

  return (
    <Panel
      eyebrow="세션 기록"
      title="세션 기록 완성"
      mobileSection="report"
      panelId="host-editor-panel-session-record-completion"
      activeMobileSection={activeMobileSection}
    >
      <div className="stack" style={{ "--stack": "14px" } as CSSProperties}>
        <FeedbackDocumentStatusView
          sessionId={sessionId}
          feedbackDocument={feedbackDocument}
          previewState={previewState}
          LinkComponent={LinkComponent}
        />
        {canUseAigen ? (
          <ModeTabs mode={effectiveMode} onModeChange={onModeChange} />
        ) : (
          <p className="small" role="status" style={{ color: "var(--text-2)" }}>
            AI 생성은 세션 저장 후 사용할 수 있습니다. 외부 JSON 가져오기는 계속 사용할 수 있습니다.
          </p>
        )}
        {effectiveMode === "aigen" && sessionId && clubSlug ? (
          <AiGenerateTab sessionId={sessionId} clubSlug={clubSlug} onCommitted={onAigenCommitted} />
        ) : (
          <SessionImportPanelBody
            sessionId={sessionId}
            recordVisibility={recordVisibility}
            preview={preview}
            status={status}
            error={error}
            onFileSelected={onFileSelected}
            onCommit={onCommit}
          />
        )}
      </div>
    </Panel>
  );
}

function FeedbackDocumentStatusView({
  sessionId,
  feedbackDocument,
  previewState,
  LinkComponent,
}: {
  sessionId: string | undefined;
  feedbackDocument: FeedbackDocumentStatus;
  previewState?: ReadmatesReturnState;
  LinkComponent: ComponentType<FeedbackPreviewLinkProps>;
}) {
  if (!sessionId) return null;
  return (
    <div className="surface-quiet" style={{ padding: 14 }}>
      <div className="row-between" style={{ gap: 12 }}>
        <div>
          <span className={feedbackDocument.uploaded ? "badge badge-ok badge-dot" : "badge"}>
            {feedbackDocument.uploaded ? "업로드 완료" : "미등록"}
          </span>
          <p className="small" style={{ margin: "8px 0 0", overflowWrap: "anywhere" }}>
            {feedbackDocument.fileName ?? "저장된 피드백 문서 없음"}
          </p>
        </div>
        {feedbackDocument.uploaded ? (
          <LinkComponent
            className="btn btn-quiet btn-sm"
            to={`/app/feedback/${encodeURIComponent(sessionId)}`}
            state={previewState}
          >
            미리보기
          </LinkComponent>
        ) : null}
      </div>
    </div>
  );
}

function ModeTabs({
  mode,
  onModeChange,
}: {
  mode: SessionRecordCompletionMode;
  onModeChange: (mode: SessionRecordCompletionMode) => void;
}) {
  return (
    <div className="row" role="tablist" aria-label="세션 기록 완성 방식" style={{ gap: 8, flexWrap: "wrap" }}>
      {[
        { mode: "aigen" as const, label: "AI로 생성" },
        { mode: "json" as const, label: "외부 JSON 가져오기" },
      ].map((option) => (
        <button
          key={option.mode}
          type="button"
          role="tab"
          aria-selected={mode === option.mode}
          className={`btn btn-sm${mode === option.mode ? " btn-primary" : " btn-quiet"}`}
          onClick={() => onModeChange(option.mode)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Split `SessionImportPanel` into panel and body**

In `front/features/host/ui/session-editor/session-import-panel.tsx`, keep the exported `SessionImportPanel` for any direct callers and add `SessionImportPanelBody` for the new wrapper:

```tsx
export function SessionImportPanelBody({
  sessionId,
  recordVisibility,
  preview,
  status,
  error,
  onFileSelected,
  onCommit,
}: Omit<Parameters<typeof SessionImportPanel>[0], "activeMobileSection">) {
  const canCommit = Boolean(sessionId) && status !== "committing" && sessionImportCanCommit(preview);

  return (
    <div className="stack" style={{ "--stack": "14px" } as CSSProperties}>
      <div className="small" style={{ color: "var(--text-2)" }}>
        {sessionId ? sessionImportReplacementWarning() : "세션을 만든 뒤 JSON 기록을 가져올 수 있습니다."}
      </div>
      <label className="field-label" htmlFor="session-import-json-file">
        외부 JSON 가져오기
      </label>
      {/* Move the existing input, status, preview, and button markup here unchanged except label text. */}
    </div>
  );
}
```

Then make `SessionImportPanel` render `<SessionImportPanelBody ... />` inside its existing `<Panel>`.

- [ ] **Step 5: Remove frontend upload action wiring**

In `front/features/host/route/host-session-editor-actions.ts`, remove `FeedbackDocumentResponse` import and this property:

```ts
uploadFeedbackDocument: (sessionId: string, formData: FormData) => Promise<JsonResponse<FeedbackDocumentResponse>>;
```

In `front/features/host/route/host-session-editor-data.ts`, remove the import and object property:

```ts
uploadHostSessionFeedbackDocument,
uploadFeedbackDocument: uploadHostSessionFeedbackDocument,
```

In `front/features/host/api/host-api.ts`, delete:

```ts
export function uploadHostSessionFeedbackDocument(sessionId: string, formData: FormData) {
  return readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}/feedback-document`, {
    method: "POST",
    body: formData,
  }) as Promise<Response & { json(): Promise<FeedbackDocumentResponse> }>;
}
```

- [ ] **Step 6: Mount the new completion panel in host editor**

In `front/features/host/ui/host-session-editor.tsx`, remove:

```ts
import { HostSessionFeedbackUpload } from "./host-session-feedback-upload";
```

Add:

```ts
import {
  SessionRecordCompletionPanel,
  type SessionRecordCompletionMode,
} from "./session-editor/session-record-completion-panel";
```

Change `type ImportMode = "json" | "aigen";` to:

```ts
type ImportMode = SessionRecordCompletionMode;
```

Update `readInitialImportMode()`:

```ts
function readInitialImportMode(): ImportMode {
  if (typeof window === "undefined") {
    return "aigen";
  }
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("records") === "json" ? "json" : "aigen";
  } catch {
    return "aigen";
  }
}
```

Update `writeImportModeToUrl()`:

```ts
if (mode === "json") {
  params.set("records", "json");
  params.delete("aigen");
} else {
  params.set("aigen", "1");
  params.delete("records");
}
```

Remove the `uploadFeedbackDocument` callback and `feedbackDocumentInputRef`.

Replace the old import toggle, AI panel, JSON panel, and standalone feedback panel render with:

```tsx
<SessionRecordCompletionPanel
  activeMobileSection={activeMobileSection}
  sessionId={session?.sessionId}
  clubSlug={clubSlug}
  mode={effectiveImportMode}
  canUseAigen={canShowImportModeToggle}
  feedbackDocument={feedbackDocumentForPanel}
  previewState={feedbackPreviewState}
  LinkComponent={LinkComponent}
  recordVisibility={recordVisibility}
  preview={sessionImportPreview}
  status={sessionImportStatus}
  error={sessionImportError}
  onModeChange={handleImportModeChange}
  onAigenCommitted={handleAigenCommitted}
  onFileSelected={previewSessionImport}
  onCommit={commitSessionImport}
/>
```

- [ ] **Step 7: Update mobile report panel IDs**

In `front/features/host/ui/session-editor/mobile-editor-tabs.tsx`, change the report entry. The current `panelIds` for the report section is `["host-editor-panel-session-import", "host-editor-panel-aigen", "host-editor-panel-report"]`; replace with the single new ID:

```ts
panelIds: ["host-editor-panel-session-record-completion"],
```

- [ ] **Step 8: Delete the old upload component**

```bash
rm front/features/host/ui/host-session-feedback-upload.tsx
```

- [ ] **Step 9: Run focused frontend tests**

Run:

```bash
pnpm --dir front exec vitest run tests/unit/host-session-editor.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 10: Search for removed frontend upload symbols**

Run:

```bash
rg -n "HostSessionFeedbackUpload|uploadFeedbackDocument|uploadHostSessionFeedbackDocument|feedback-document-file|피드백 문서 파일|교체|등록" front/features/host front/tests/unit/host-session-editor.test.tsx
```

Expected: no hits for removed upload symbols. Hits for generic "등록" outside the host feedback upload surface are acceptable only if they are unrelated to feedback document upload.

- [ ] **Step 11: Commit Task 3**

```bash
git add front/features/host \
  front/tests/unit/host-session-editor.test.tsx
git add -u front/features/host/ui/host-session-feedback-upload.tsx
git commit -m "feat(front): unify session record completion"
```

---

### Task 4: Polish AI Unavailable And JSON Fallback Behavior

**Files:**
- Modify: `front/features/host/aigen/ui/AiGenerateTab.tsx`
- Modify: `front/features/host/aigen/ui/TranscriptUploadForm.tsx`
- Test: `front/features/host/aigen/ui/AiGenerateTab.test.tsx`
- Test: `front/tests/unit/host-session-editor.test.tsx`
- Test: `front/tests/e2e/aigen-jsonupload-coexistence.spec.ts` — 기본 모드 전환과 새 URL contract(`records=json`)에 맞춰 시나리오를 갱신한다.

- [ ] **Step 1: Add failing AI unavailable test**

In `front/features/host/aigen/ui/AiGenerateTab.test.tsx`, add a test that drives `getClubAiDefault` failure. Use the existing module mocks in that file and add:

```tsx
it("shows an unavailable state when club AI defaults cannot be loaded", async () => {
  vi.mocked(getClubAiDefault).mockRejectedValueOnce(new Error("AI generation is disabled"));

  render(<AiGenerateTab sessionId="s1" clubSlug="club-a" onCommitted={() => {}} />);

  expect(await screen.findByRole("status")).toHaveTextContent("AI 생성을 사용할 수 없습니다");
  expect(screen.queryByRole("button", { name: "생성 시작" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused AI tab test and verify it fails**

Run:

```bash
pnpm --dir front exec vitest run features/host/aigen/ui/AiGenerateTab.test.tsx --runInBand
```

Expected: FAIL because query errors currently leave the form disabled without an explicit unavailable state.

- [ ] **Step 3: Implement explicit unavailable state**

In `AiGenerateTab.tsx`, before rendering `TranscriptUploadForm`, add:

```tsx
if (clubDefaultsQuery.isError) {
  return (
    <div className="stack" style={{ "--stack": "8px" } as CSSProperties}>
      <p className="small" role="status" style={{ color: "var(--text-2)", margin: 0 }}>
        AI 생성을 사용할 수 없습니다. 외부 JSON 가져오기로 세션 기록을 저장할 수 있습니다.
      </p>
      <p className="tiny" style={{ color: "var(--text-3)", margin: 0 }}>
        모델 설정, provider 상태, 비용 한도, 운영 kill switch를 확인하세요.
      </p>
    </div>
  );
}
```

In `TranscriptUploadForm.tsx`, remove the stale cost estimate block if it still says `- USD` and has no real endpoint:

```tsx
{/* Remove the aigen-cost-estimate <dl> block until real cost/cap data exists. */}
```

Do not add a replacement fake estimate.

- [ ] **Step 4: Update the host editor mode tests for AI-first defaults**

In `front/tests/unit/host-session-editor.test.tsx`, update the import mode describe block:

```tsx
it("renders the AI mode by default and keeps JSON fallback available", () => {
  stubLocationSearch("");

  render(<HostSessionEditorForTest session={session} clubSlug="club-a" />);

  const toggle = screen.getByRole("tablist", { name: "세션 기록 완성 방식" });
  expect(within(toggle).getByRole("tab", { name: "AI로 생성" })).toHaveAttribute("aria-selected", "true");
  expect(within(toggle).getByRole("tab", { name: "외부 JSON 가져오기" })).toHaveAttribute("aria-selected", "false");
  expect(screen.getByTestId("aigen-tab")).toBeInTheDocument();
});
```

Update the JSON switch test to click `외부 JSON 가져오기` and expect `records=json` in the URL:

```tsx
expect(urlArg).toMatch(/[?&]records=json\b/);
expect(urlArg).not.toMatch(/[?&]aigen=/);
```

- [ ] **Step 4b: Update the JSON-upload coexistence E2E**

`front/tests/e2e/aigen-jsonupload-coexistence.spec.ts` currently asserts (a) param 없음 = JSON 모드, (b) AI 클릭 시 URL에 `aigen=1` 추가, (c) JSON 클릭 시 `aigen` 제거. 새 contract에 맞춰 다음으로 갱신한다:

- 진입 시 param 없음이면 AI 모드가 활성화되어야 한다 (`대본 파일` 입력이 보임). JSON-upload form은 보이지 않음.
- `외부 JSON 가져오기` 탭을 클릭하면 URL `searchParams.get("records")`가 `"json"`이 된다.
- 다시 `AI로 생성` 탭을 클릭하면 `records` param이 사라지고 (`null`) `aigen` param 역시 없다 (AI가 기본이라 URL에 흔적을 남기지 않음).
- 두 패널이 동시에 mount되지 않는 mutual exclusion은 유지한다.

다른 `?aigen=1`을 사용하는 aigen E2E (`aigen-full-flow`, `aigen-cancel`, `aigen-cost-cap`, `aigen-expired-job`, `aigen-regenerate`)는 새 `readInitialImportMode`에서 `aigen=1`이 무시되어도 기본이 aigen이므로 결과적으로 동일 모드에 도달한다. 변경 불필요.

- [ ] **Step 5: Run focused frontend tests**

Run:

```bash
pnpm --dir front exec vitest run features/host/aigen/ui/AiGenerateTab.test.tsx tests/unit/host-session-editor.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add front/features/host/aigen/ui/AiGenerateTab.tsx \
  front/features/host/aigen/ui/TranscriptUploadForm.tsx \
  front/features/host/aigen/ui/AiGenerateTab.test.tsx \
  front/tests/unit/host-session-editor.test.tsx \
  front/tests/e2e/aigen-jsonupload-coexistence.spec.ts
git commit -m "fix(front): surface ai unavailable fallback"
```

---

### Task 5: Update Documentation For The New Workflow

**Files:**
- Modify: `docs/development/architecture.md`
- Modify: `docs/development/session-import-generator.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update architecture**

In `docs/development/architecture.md` (line ~16), change the 호스트 앱 row to replace "피드백 문서 업로드" with "세션 기록 패키지 저장". The same row also lists "세션 기록 JSON 가져오기" — leave it as is (the JSON fallback is preserved).

In `## 피드백 문서 흐름`, replace the host upload text flow with:

```text
Session record package commit
  |
  | AI generation result or readmates-session-import:v1 JSON
  v
SessionImportService validation and replacement
  |
  | UTF-8, structured feedback template, session metadata, attendee authors
  v
MySQL session_feedback_documents
  |
  | GET /api/sessions/{sessionId}/feedback-document
  v
Readable response for host or attended full member
```

Add this sentence:

```markdown
호스트는 더 이상 피드백 문서만 별도로 업로드하지 않습니다. 새 피드백 문서는 AI 생성 또는 `readmates-session-import:v1` JSON import commit이 세션 기록 패키지를 저장할 때 함께 교체됩니다.
```

- [ ] **Step 2: Update session import docs**

In `docs/development/session-import-generator.md`, update "모드 병존 안내" so AI is the default path and JSON is fallback:

```markdown
호스트 세션 편집기는 `세션 기록 완성` 패널에서 AI 생성을 기본 경로로 보여주고, 외부 JSON 가져오기를 fallback으로 제공합니다. 단독 `.md` 또는 `.txt` 피드백 문서 업로드는 더 이상 제공하지 않습니다.
```

- [ ] **Step 3: Update README**

`README.md` 안 두 곳에 손을 댄다.

1. 호스트 역할 설명 (`README.md` line ~46): "세션 기록 JSON 가져오기, 피드백 문서 업로드" 부분을 "AI 생성 또는 JSON 가져오기를 통한 세션 기록 패키지 저장"으로 바꾼다.
2. 상단 Highlight 문단 (`README.md` line ~8): "세션 기록 JSON 가져오기와 in-app AI 세션 생성" 표현이 새 UX 방향(AI 기본 · JSON fallback)에 맞춰 자연스럽게 읽히는지 확인한다. 기본 메시지가 유지된다면 문구는 그대로 둘 수 있다 (필수 변경 아님). 변경한다면 "AI 생성 기본의 세션 기록 완성과 외부 JSON fallback"으로 정리한다.

또한 `docs/README.md`와 `docs/development/README.md`에 "세션 기록 JSON 가져오기" 문구가 그대로 남아 있더라도 외부 generator 문서를 가리키는 링크 라벨이므로 변경 대상이 아니다. 변경 여부는 grep 결과로 한 번 더 확인한다.

- [ ] **Step 4: Add CHANGELOG entry**

At the top of `CHANGELOG.md` under the current Unreleased section, add:

```markdown
- **호스트 세션 기록 완성 UX 정리**: 호스트 세션 편집기에서 단독 피드백 문서 업로드 경로를 제거하고, AI 생성 기본 경로와 외부 JSON fallback을 하나의 `세션 기록 완성` 패널로 통합했습니다. 새 피드백 문서 저장은 세션 기록 패키지 commit을 통해서만 발생하며, 기존 `FEEDBACK_DOCUMENT_PUBLISHED` 알림 이벤트는 JSON import와 AI commit 경로에서 동일하게 기록됩니다.
```

- [ ] **Step 5: Run docs diff check**

Run:

```bash
git diff --check -- docs/development/architecture.md docs/development/session-import-generator.md README.md CHANGELOG.md
```

Expected: no output.

- [ ] **Step 6: Commit Task 5**

```bash
git add docs/development/architecture.md docs/development/session-import-generator.md README.md CHANGELOG.md
git commit -m "docs: document session record completion workflow"
```

---

### Task 6: Full Verification And Cleanup

**Files:**
- No planned source edits. This task verifies the branch and fixes only regressions caused by previous tasks.

- [ ] **Step 1: Run frontend checks**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected: all pass.

- [ ] **Step 2: Run server checks**

Run:

```bash
./server/gradlew -p server clean test
```

Expected: all pass.

- [ ] **Step 3: Run targeted E2E when local dependencies are available**

Run:

```bash
pnpm --dir front test:e2e -- aigen-jsonupload-coexistence.spec.ts
```

Expected: pass. If the local E2E environment is unavailable, record the skipped command and exact reason in the final implementation report.

- [ ] **Step 4: Run removal searches**

Run:

```bash
rg -n "uploadFeedbackDocument|uploadHostSessionFeedbackDocument|HostSessionFeedbackUpload|FeedbackDocumentUploadValidator|UploadHostFeedbackDocument|AuthorizeHostFeedbackDocumentUpload|FeedbackDocumentUploadCommand" front server
```

Expected: no output.

Run:

```bash
rg -n "피드백 문서 업로드|feedback document upload" README.md docs/development front/features/host server/src/main/kotlin
```

Expected: no hits describing an active host upload path. Historical specs and plans under `docs/superpowers/` may still mention the old workflow.

- [ ] **Step 5: Inspect final diff**

Run:

```bash
git diff --stat origin/main...HEAD
git diff --check
```

Expected: no whitespace errors; diff only covers the approved workflow.

- [ ] **Step 6: Commit verification-only fixes if any were needed**

If verification required fixes, commit only those fixes:

```bash
git add <fixed-files>
git commit -m "fix: close session record completion regressions"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review Checklist

- Spec coverage:
  - Integrated AI-first panel: Task 3 and Task 4.
  - JSON fallback retained: Task 3 and Task 4.
  - Standalone upload UI removed: Task 3.
  - Standalone upload API removed: Task 2.
  - Existing read APIs retained: Task 2 verifies read tests stay.
  - Feedback notification moved to package commit: Task 1.
  - Docs synchronized after implementation: Task 5.
- Type consistency:
  - `SessionImportStoredFeedbackDocument.version` is defined before `SessionImportService` reads it.
  - `SessionRecordCompletionMode` is reused by host editor rather than duplicating mode string unions.
  - `uploadFeedbackDocument` is removed from the action type, route wiring, API wrapper, tests, and component tree in the same task.
  - `RecordingNotificationEvents` fake in `SessionImportServiceCommitValidatedTest` imports `java.time.LocalDate` because `recordSessionReminderDue` requires it.
- Notification source uniqueness:
  - 단독 업로드 호출처(`FeedbackDocumentService.kt:126`)는 Task 2에서 method 삭제와 함께 사라지고, `SessionImportService.commitValidated`가 유일한 source가 된다.
  - `AiGenerationNotificationDispatcher`는 `recordFeedbackDocumentPublished`를 호출하지 않으므로 AI commit에서 이중 발화 없음.
  - dedupe key `feedback-document:{sessionId}:{documentVersion}`이 commit마다 새 version으로 갱신되어 동일 commit 안에서는 충돌하지 않는다.
- URL contract & E2E:
  - `readInitialImportMode`의 기본값이 `json`에서 `aigen`으로 바뀐다. JSON 진입 URL이 `aigen=1` 삭제에서 `records=json` 추가로 바뀌므로 `aigen-jsonupload-coexistence.spec.ts`는 반드시 갱신해야 한다 (Task 4 Step 4b).
  - 기존 `?aigen=1`로 진입하는 aigen E2E들은 기본이 aigen이라 그대로 통과한다.
- Residual risk:
  - Repeated import/AI commits produce a new feedback document version and a new notification, matching the previous "replace upload" meaning.
  - Direct external callers of the removed host upload endpoint receive 404. No compatibility shim is planned.
