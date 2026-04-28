# Session Feedback Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build session-level Markdown feedback documents in ReadMates, seed the real 1st session feedback document, expose it to hosts and attended members, provide a native viewer plus print-to-PDF route, and remove the deprecated member-level HTML report flow.

**Architecture:** PostgreSQL stores one versioned Markdown source document per session. Spring Boot validates/parses the `readmates-feedback:v1` Markdown into typed JSON and enforces host/attendee access. Next.js fetches that JSON through the BFF and renders it with existing ReadMates page/header/surface/divider styles; PDF output is a print-optimized route that uses browser save-as-PDF.

**Tech Stack:** Spring Boot 4, Kotlin, JdbcTemplate, PostgreSQL/Flyway, Spring MVC multipart upload, Next.js App Router, React 19, Vitest, Testing Library, Spring MockMvc.

---

## Scope Rules

- Do not generate feedback with AI inside the app.
- Do not render uploaded Markdown as raw HTML.
- Do not keep the old user-facing HTML report API/UI alive.
- Do not implement server-generated PDF binary output in this pass.
- Do seed the real 1st feedback Markdown from the approved file content.
- Do keep unrelated dirty files intact. Current known unrelated files are:
  - `front/tests/unit/archive-page.test.tsx`
  - `docs/superpowers/plans/2026-04-20-readmates-mobile-archive-me-alignment-implementation-plan.md`

## Data Contracts

### Database Table

Create `session_feedback_documents`.

```sql
create table session_feedback_documents (
  id uuid primary key,
  club_id uuid not null references clubs(id),
  session_id uuid not null,
  version integer not null,
  source_text text not null,
  file_name varchar(255) not null,
  content_type varchar(100) not null,
  file_size bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_feedback_documents_session_club_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint session_feedback_documents_version_check check (version > 0),
  constraint session_feedback_documents_source_text_check check (length(trim(source_text)) > 0),
  constraint session_feedback_documents_file_name_check check (length(trim(file_name)) > 0 and file_name not like '%/%' and position(chr(92) in file_name) = 0),
  constraint session_feedback_documents_content_type_check check (content_type in ('text/markdown', 'text/plain')),
  constraint session_feedback_documents_file_size_check check (file_size > 0),
  unique (session_id, version)
);
```

### List Item DTO

```kotlin
data class FeedbackDocumentListItem(
    val sessionId: String,
    val sessionNumber: Int,
    val title: String,
    val bookTitle: String,
    val date: String,
    val fileName: String,
    val uploadedAt: String,
)
```

### Detail DTO

```kotlin
data class FeedbackDocumentResponse(
    val sessionId: String,
    val sessionNumber: Int,
    val title: String,
    val subtitle: String,
    val bookTitle: String,
    val date: String,
    val fileName: String,
    val uploadedAt: String,
    val metadata: List<FeedbackMetadataItem>,
    val observerNotes: List<String>,
    val participants: List<FeedbackParticipant>,
)

data class FeedbackMetadataItem(val label: String, val value: String)

data class FeedbackParticipant(
    val number: Int,
    val name: String,
    val role: String,
    val style: List<String>,
    val contributions: List<String>,
    val problems: List<FeedbackProblem>,
    val actionItems: List<String>,
    val revealingQuote: FeedbackRevealingQuote,
)

data class FeedbackProblem(
    val title: String,
    val core: String,
    val evidence: String,
    val interpretation: String,
)

data class FeedbackRevealingQuote(
    val quote: String,
    val context: String,
    val note: String,
)
```

### Host Status DTO

```kotlin
data class FeedbackDocumentStatus(
    val uploaded: Boolean,
    val fileName: String?,
    val uploadedAt: String?,
)
```

### Host Session Detail Change

Replace `reports: Array<{ membershipId, displayName, fileName, uploaded }>` with:

```typescript
feedbackDocument: {
  uploaded: boolean;
  fileName: string | null;
  uploadedAt: string | null;
};
```

## API Surface

- `GET /api/feedback-documents/me`
  - Host: all feedback documents in the host club.
  - Member: only sessions where current member has `attendance_status = 'ATTENDED'`.

- `GET /api/sessions/{sessionId}/feedback-document`
  - Host: any session in club.
  - Member: only attended session.
  - 404 if no document exists.
  - 403 if session exists but member did not attend.

- `GET /api/host/sessions/{sessionId}/feedback-document`
  - Host-only upload status for editor.

- `POST /api/host/sessions/{sessionId}/feedback-document`
  - Multipart field: `file`.
  - Accept `.md` and `.txt`.
  - Validate UTF-8, non-empty, `readmates-feedback:v1` marker, required headings, max 512 KB.
  - Save a new version.

## Markdown Parser Rules

Required marker:

```md
<!-- readmates-feedback:v1 -->
```

Required sections:

```md
# 독서모임 N차 피드백
책 제목 · YYYY.MM.DD
## 메타
## 관찰자 노트
## 참여자별 피드백
### 01. 이름
역할: 한 줄 역할 규정
#### 참여 스타일
#### 실질 기여
#### 문제점과 자기모순
##### 1. 문제 제목
- 핵심: 문제의 핵심 문장
- 근거: "원문 직접 인용" [00:00]
- 해석: 문제 해석 문장
#### 실천 과제
1. 검증 가능한 과제
#### 드러난 한 문장
> "원문 직접 인용"
맥락: 발화 맥락 · [00:00]
주석: 이 문장이 드러내는 패턴
```

Invalid template response:

```kotlin
throw ResponseStatusException(HttpStatus.BAD_REQUEST, "ReadMates 피드백 템플릿 형식이 아닙니다.")
```

## Task 0: Planning State Cleanup

**Files:**
- Inspect only: `git status --short`

- [x] Verify no implementation files are partially left from a previous interrupted attempt.
- [x] If these paths exist before implementation starts, remove them in the implementation branch before continuing:
  - `server/src/main/kotlin/com/readmates/feedback/`
  - `server/src/main/resources/db/migration/V5__session_feedback_documents.sql`
- [x] If `server/src/main/resources/db/dev/R__readmates_dev_seed.sql` contains an unreviewed `251126_1차_피드백.md` block before Task 1, replace it with the final Task 1 version.
- [x] Do not modify the known unrelated dirty archive alignment files.

## Task 1: Backend RED Tests For Feedback Documents

**Files:**
- Create: `server/src/test/kotlin/com/readmates/feedback/api/FeedbackDocumentControllerTest.kt`
- Modify only if cleanup SQL needs new table order: session API tests with generated-session cleanup SQL.

- [x] Add a test that seeded session 1 appears for an attended member.

```kotlin
@Test
fun `attended member can list seeded session feedback document`() {
    mockMvc.get("/api/feedback-documents/me") {
        with(user("member5@example.com"))
    }.andExpect {
        status { isOk() }
        jsonPath("$[0].sessionNumber") { value(1) }
        jsonPath("$[0].bookTitle") { value("팩트풀니스") }
        jsonPath("$[0].fileName") { value("251126_1차_피드백.md") }
    }
}
```

- [x] Add a test that an attended member can fetch parsed content.

```kotlin
@Test
fun `attended member can read parsed session feedback document`() {
    mockMvc.get("/api/sessions/00000000-0000-0000-0000-000000000301/feedback-document") {
        with(user("member5@example.com"))
    }.andExpect {
        status { isOk() }
        jsonPath("$.title") { value("독서모임 1차 피드백") }
        jsonPath("$.subtitle") { value("팩트풀니스 · 2025.11.26") }
        jsonPath("$.participants.length()") { value(3) }
        jsonPath("$.participants[0].name") { value("이멤버5") }
        jsonPath("$.participants[0].problems[0].title") { value("출처 없는 수치로 책의 기준을 바로 흔들었다") }
    }
}
```

- [x] Add a test that a non-attending member gets forbidden for session 1.

```kotlin
@Test
fun `non attending member cannot read session feedback document`() {
    mockMvc.get("/api/sessions/00000000-0000-0000-0000-000000000301/feedback-document") {
        with(user("member2@example.com"))
    }.andExpect {
        status { isForbidden() }
    }
}
```

- [x] Add upload tests:
  - Host uploads a valid `.md` file and receives parsed title.
  - Host upload with missing marker returns 400.
  - Member upload returns 403.

- [x] Run RED check:

```bash
./server/gradlew -p server test --tests 'com.readmates.feedback.api.FeedbackDocumentControllerTest'
```

Expected: fails to compile or fails with missing endpoints/classes.

## Task 2: Schema And Real Feedback Seeds

**Files:**
- Create: `server/src/main/resources/db/migration/V5__session_feedback_documents.sql`
- Modify: `server/src/main/resources/db/dev/R__readmates_dev_seed.sql`

- [x] Add the SQL table exactly as listed in "Database Table".
- [x] Insert the full approved Markdown content from every file under `<local-workspace>/ReadMates/recode/feedback` into `R__readmates_dev_seed.sql` so runtime does not depend on ignored files.
- [x] Seed all six feedback files with deterministic id suffixes `701` through `706`, matching session numbers `1` through `6`, version `1`, content type `text/markdown`, and original source basenames as `file_name` values:
  - `251126 1차.md`
  - `251227 2차.md`
  - `260121 3차.md`
  - `260225 4차.md`
  - `260318 5차.md`
  - `260415 6차.md`
- [x] Use dollar-quoted strings whose bodies are the complete file contents, each beginning with `<!-- readmates-feedback:v1 -->`.
- [x] Insert into `session_feedback_documents (id, club_id, session_id, version, source_text, file_name, content_type, file_size)` by joining `clubs.slug = 'reading-sai'` to each matching `sessions.number`.
- [x] Use `octet_length(source_text)` for `file_size`.
- [x] Use `on conflict (session_id, version) do update` to update `source_text`, `file_name`, `content_type`, `file_size`, and `updated_at`.

- [x] Add generated-session cleanup deletes before deleting `sessions` in tests:

```sql
delete from session_feedback_documents
where session_id in (
  select id from sessions
  where club_id = '00000000-0000-0000-0000-000000000001'::uuid
    and number >= 7
);
```

- [x] Run RED test again. Expected: still fails because API/parser do not exist.

## Task 3: Parser Implementation

**Files:**
- Create: `server/src/main/kotlin/com/readmates/feedback/application/FeedbackDocumentParser.kt`
- Create: `server/src/test/kotlin/com/readmates/feedback/application/FeedbackDocumentParserTest.kt`

- [x] Parser must normalize CRLF to LF.
- [x] Parser must reject missing marker.
- [x] Parser must reject missing required headings.
- [x] Parser must parse:
  - title
  - subtitle
  - metadata bullet labels/values
  - observer note paragraphs
  - participant number/name/role
  - style paragraphs
  - contribution bullets
  - problem title/core/evidence/interpretation
  - numbered action items
  - revealing quote/context/note

- [x] Parser must not return HTML.
- [x] Parser failure must throw 400 with `ReadMates 피드백 템플릿 형식이 아닙니다.`
- [x] Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.feedback.application.FeedbackDocumentParserTest'
```

Expected: PASS.

## Task 4: Repository And Controller Implementation

**Files:**
- Create: `server/src/main/kotlin/com/readmates/feedback/application/FeedbackDocumentRepository.kt`
- Create: `server/src/main/kotlin/com/readmates/feedback/api/FeedbackDocumentController.kt`
- Modify: `server/src/test/kotlin/com/readmates/feedback/api/FeedbackDocumentControllerTest.kt`

- [x] Implement `listReadableDocuments(member)`.
- [x] Implement `findReadableDocument(member, sessionId)`.
- [x] Implement `findHostStatus(host, sessionId)`.
- [x] Implement `saveDocument(host, sessionId, fileName, contentType, sourceText, fileSize)`.
- [x] In controller, resolve current member the same way existing controllers do:

```kotlin
private fun currentMember(authentication: Authentication?): CurrentMember {
    val email = authentication.emailOrNull() ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
    return memberAccountRepository.findActiveMemberByEmail(email)
        ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
}
```

- [x] Upload validation:
  - original filename must end with `.md` or `.txt`
  - file must be non-empty
  - file size must be at most 512 KB
  - UTF-8 decoder must reject malformed input
  - content type stored as `text/markdown` for `.md`, `text/plain` for `.txt`
  - parser must run before saving

- [x] Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.feedback.*'
```

Expected: PASS.

## Task 5: Refactor Session Host/Dashboard Backend

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/session/application/SessionRepository.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/api/HostDashboardControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt`

- [x] Replace `HostSessionDetailResponse.reports` with `feedbackDocument`.
- [x] Remove `HostSessionReport`.
- [x] Add `HostSessionFeedbackDocument`.

```kotlin
data class HostSessionFeedbackDocument(
    val uploaded: Boolean,
    val fileName: String?,
    val uploadedAt: String?,
)
```

- [x] Replace `findHostSessionReports` with `findHostSessionFeedbackDocument`.
- [x] Change dashboard pending SQL:
  - count closed/published sessions
  - require at least one attended participant
  - missing latest `session_feedback_documents`
  - count once per session, not once per attendee
- [x] Update expectations:
  - seeded sessions 1-6 have feedback, so pending starts at 0.
  - new session detail returns `feedbackDocument.uploaded = false`.

- [x] Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.session.api.HostDashboardControllerTest' --tests 'com.readmates.session.api.HostSessionControllerDbTest'
```

Expected: PASS.

## Task 6: Remove Old HTML Report Backend

**Files:**
- Delete: `server/src/main/kotlin/com/readmates/report/api/HostReportController.kt`
- Delete: `server/src/main/kotlin/com/readmates/report/api/ReportController.kt`
- Delete: `server/src/main/kotlin/com/readmates/report/application/LocalReportStorage.kt`
- Delete: `server/src/main/kotlin/com/readmates/report/application/ReportRepository.kt`
- Delete: `server/src/test/kotlin/com/readmates/report/api/HostReportControllerTest.kt`
- Delete: `server/src/test/kotlin/com/readmates/report/api/ReportControllerTest.kt`

- [x] Delete the old code and tests.
- [x] Keep the historical `feedback_reports` migration because deleting old migrations would break existing databases.
- [x] Run:

```bash
rg -n "HostReportController|ReportController|ReportRepository|LocalReportStorage|/api/reports|/api/host/reports" server/src/main server/src/test
```

Expected: no current backend source/test matches.

- [x] Run:

```bash
./server/gradlew -p server test
```

Expected: PASS.

## Task 7: Frontend RED Tests

**Files:**
- Modify: `front/tests/unit/my-page.test.tsx`
- Modify: `front/tests/unit/archive-page.test.tsx`
- Modify: `front/tests/unit/host-session-editor.test.tsx`
- Modify: `front/tests/unit/host-dashboard.test.tsx`
- Create: `front/tests/unit/feedback-document-page.test.tsx`
- Modify: `front/tests/unit/bff-route.test.ts`

- [x] Change test fixture type from `ReportListItem` to `FeedbackDocumentListItem`.
- [x] My page must show:
  - `피드백 문서`
  - `팩트풀니스 · 2025.11.26`
  - `읽기` link to `/app/feedback/session-1`
  - `PDF로 저장` link to `/app/feedback/session-1/print`
  - empty state `아직 열람 가능한 피드백 문서가 없습니다.`
- [x] Archive feedback tab must use the same session-centric labels.
- [x] Host editor must show `회차 피드백 문서`, `.md,.txt` file input, status, preview, and no per-member rows.
- [x] Feedback detail page must render observer notes, all participant names, problem title/core/evidence/interpretation, action items, and revealing quote.
- [x] BFF test must prove multipart request bodies are proxied as bytes rather than `request.text()`.
- [x] Run:

```bash
pnpm --dir front exec vitest run front/tests/unit/my-page.test.tsx front/tests/unit/archive-page.test.tsx front/tests/unit/host-session-editor.test.tsx front/tests/unit/host-dashboard.test.tsx front/tests/unit/feedback-document-page.test.tsx front/tests/unit/bff-route.test.ts
```

Expected: RED failures because frontend implementation still uses old report types/routes.

## Task 8: Frontend Types And BFF

**Files:**
- Modify: `front/shared/api/readmates.ts`
- Modify: `front/app/api/bff/[...path]/route.ts`

- [x] Replace `ReportListItem` with `FeedbackDocumentListItem`.
- [x] Add `FeedbackDocumentResponse` matching backend DTO.
- [x] Replace host detail `reports` with `feedbackDocument`.
- [x] In BFF, keep GET/HEAD body empty, but for mutating requests use:

```typescript
const body = ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer();
```

- [x] Preserve `Content-Type`, cookies, `Set-Cookie`, and upstream response headers.
- [x] Run:

```bash
pnpm --dir front exec vitest run front/tests/unit/bff-route.test.ts
```

Expected: PASS.

## Task 9: Member Lists And Detail Viewer

**Files:**
- Modify: `front/app/(app)/app/me/page.tsx`
- Modify: `front/features/archive/components/my-page.tsx`
- Modify: `front/app/(app)/app/archive/page.tsx`
- Modify: `front/features/archive/components/archive-page.tsx`
- Create: `front/features/feedback/components/feedback-document-page.tsx`
- Create: `front/app/(app)/app/feedback/[sessionId]/page.tsx`
- Create: `front/app/(app)/app/feedback/[sessionId]/print/page.tsx`

- [x] Fetch `/api/feedback-documents/me` in My and Archive routes.
- [x] Render list rows as session documents, not raw filenames.
- [x] Native viewer layout:
  - `page-header-compact`
  - eyebrow `Feedback report`
  - H1 from document title
  - subtitle from document subtitle
  - `PDF로 저장` action
  - observer notes near top
  - vertical participant sections
  - problem blocks with title, core, evidence, interpretation
  - quote block with context/note
- [x] Print route:
  - reuse same component with `printMode`
  - hide nav/action chrome with print-specific class/styles
  - call `globalThis.print()` from a client button only on the print page, not during SSR.
- [x] Run:

```bash
pnpm --dir front exec vitest run front/tests/unit/my-page.test.tsx front/tests/unit/archive-page.test.tsx front/tests/unit/feedback-document-page.test.tsx
```

Expected: PASS.

## Task 10: Host Upload UI

**Files:**
- Modify: `front/features/host/components/host-session-editor.tsx`
- Modify: `front/tests/unit/host-session-editor.test.tsx`
- Modify: `front/features/host/components/host-dashboard.tsx`
- Modify: `front/tests/unit/host-dashboard.test.tsx`

- [x] Replace "개인 피드백 HTML 리포트 (HTML)" with "회차 피드백 문서".
- [x] Remove per-member report rows.
- [x] Add file input:

```tsx
<input id="feedback-document-file" type="file" accept=".md,.txt" />
```

- [x] Upload to:

```tsx
await fetch(`/api/bff/api/host/sessions/${session.sessionId}/feedback-document`, {
  method: "POST",
  body: formData,
});
```

- [x] Show:
  - `미등록`
  - `업로드 완료`
  - latest filename
  - `미리보기` link to `/app/feedback/${session.sessionId}`
  - `교체` upload affordance
- [x] Dashboard quick action label becomes `피드백 문서 등록`.
- [x] Run:

```bash
pnpm --dir front exec vitest run front/tests/unit/host-session-editor.test.tsx front/tests/unit/host-dashboard.test.tsx
```

Expected: PASS.

## Task 11: Documentation Cleanup

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-04-20-readmates-session-feedback-document-design.md`

- [x] README should say:
  - feedback documents are session-level Markdown
  - seeded session 1 includes an actual feedback document
  - hosts upload `.md`/`.txt`
  - attended members read native page and use `PDF로 저장`
- [x] Remove README section that presents HTML reports as the current model.
- [x] Keep old HTML report mentions only in historical specs/plans, not current status docs.
- [x] Run:

```bash
rg -n "HTML report|feedback_reports|/api/reports|/api/host/reports|ReportListItem|개인 피드백 HTML" README.md server front docs/superpowers/specs/2026-04-20-readmates-session-feedback-document-design.md
```

Expected: only allowed migration/historical references remain.

## Task 12: Full Verification And Manual QA

**Commands:**

```bash
./server/gradlew -p server test
pnpm --dir front test
```

Expected: both pass.

- [x] `./server/gradlew -p server test` passed: `BUILD SUCCESSFUL`.
- [x] `pnpm --dir front test` passed: 19 test files, 90 tests.

- [ ] Start backend:

```bash
SPRING_PROFILES_ACTIVE=dev READMATES_APP_BASE_URL=http://localhost:3000 ./server/gradlew -p server bootRun
```

  - Skipped exact port startup: `8080` was already occupied by an existing Java process (PID 56112).
  - Verification used a fresh backend on `SERVER_PORT=18080`, which applied V5 and the repeatable dev seed.

- [ ] Start frontend:

```bash
NEXT_PUBLIC_ENABLE_DEV_LOGIN=true READMATES_API_BASE_URL=http://localhost:8080 pnpm --dir front dev
```

  - Skipped exact port startup: `3000` was already occupied by an existing Next process (PID 96473).
  - Verification used a temporary frontend copy on `3100` with `READMATES_API_BASE_URL=http://localhost:18080`.
  - Temporary alternate verification servers/processes on `18080` and `3100` were stopped after QA.

- [x] Manual host checks:
  - Dev-login as 김호스트.
  - Open `/app/host/sessions/00000000-0000-0000-0000-000000000301/edit`.
  - Confirm session 1 shows feedback document uploaded.
  - Confirm host can open `/app/feedback/00000000-0000-0000-0000-000000000301`.

- [x] Manual member checks:
  - Dev-login as 이멤버5.
  - Open `/app/me`.
  - Confirm 1차 피드백 document row appears.
  - Open detail page.
  - Open print route and verify print layout.

- [x] Manual access check:
  - Dev-login as 최멤버2.
  - Open `/app/feedback/00000000-0000-0000-0000-000000000301`.
  - Confirm access is denied because 최멤버2 did not attend session 1.
  - Follow-up verification: using a fresh backend on `18080` and temporary frontend on `3100`, BFF returned `403` for session `00000000-0000-0000-0000-000000000301`; `/app/feedback/00000000-0000-0000-0000-000000000301` and `/app/feedback/00000000-0000-0000-0000-000000000301/print` both returned `200` with `피드백 문서를 열람할 수 없습니다.` and no thrown `ReadMates BFF fetch failed` HTML.
  - Follow-up 404 verification: missing session `00000000-0000-0000-0000-00000000ffff` returned BFF `404`; `/app/feedback/00000000-0000-0000-0000-00000000ffff` returned `200` with `아직 열람 가능한 피드백 문서가 없습니다.`.

## Commit Plan

- Commit 1: schema, seed, backend parser/API.
- Commit 2: backend cleanup of old HTML report flow and dashboard/session status changes.
- Commit 3: frontend list/view/print/host upload UI.
- Commit 4: docs cleanup and final verification updates.

Do not start implementation until this plan is reviewed and approved.
