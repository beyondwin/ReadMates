# Session Import JSON Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a host-only JSON import flow that replaces a session's publication summary, highlights, one-line reviews, and feedback document from one generated import file.

**Architecture:** Add a focused `sessionimport` server feature with preview and commit endpoints under the existing host session route namespace. The generated file contains content only; the frontend wraps it with the host editor's currently selected record visibility before calling the API. The server owns validation, exact attendee-name matching, transactional replacement, visibility persistence, and cache invalidation.

**Tech Stack:** Kotlin/Spring Boot, JdbcTemplate/MySQL, MockMvc integration tests, React/Vite, TypeScript, Vitest/Testing Library, existing ReadMates BFF client.

---

## Scope Check

The approved spec is one vertical feature: local transcript-to-JSON guidance, one host editor import UI, one server preview/commit API pair, and one transactional persistence operation. Implement server first so the frontend depends on stable contracts.

The import file remains a single JSON document with format `readmates-session-import:v1`. The API request adds `recordVisibility` from the editor state, because the generated file must not decide visibility.

## File Structure

Server files:

- Create: `server/src/main/kotlin/com/readmates/sessionimport/adapter/in/web/SessionImportController.kt`
- Create: `server/src/main/kotlin/com/readmates/sessionimport/adapter/in/web/SessionImportWebDtos.kt`
- Create: `server/src/main/kotlin/com/readmates/sessionimport/adapter/in/web/SessionImportErrorHandler.kt`
- Create: `server/src/main/kotlin/com/readmates/sessionimport/application/model/SessionImportModels.kt`
- Create: `server/src/main/kotlin/com/readmates/sessionimport/application/port/in/SessionImportUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/sessionimport/application/port/out/SessionImportWritePort.kt`
- Create: `server/src/main/kotlin/com/readmates/sessionimport/application/service/SessionImportService.kt`
- Create: `server/src/main/kotlin/com/readmates/sessionimport/adapter/out/persistence/JdbcSessionImportWriteAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`
- Test: `server/src/test/kotlin/com/readmates/sessionimport/api/HostSessionImportControllerDbTest.kt`

Frontend files:

- Modify: `front/features/host/api/host-contracts.ts`
- Modify: `front/features/host/api/host-api.ts`
- Modify: `front/features/host/route/host-session-editor-actions.ts`
- Modify: `front/features/host/route/host-session-editor-data.ts`
- Modify: `front/features/host/ui/session-editor/session-editor-actions.ts`
- Modify: `front/features/host/ui/session-editor/mobile-editor-tabs.tsx`
- Create: `front/features/host/model/session-import-model.ts`
- Test: `front/features/host/model/session-import-model.test.ts`
- Create: `front/features/host/ui/session-editor/session-import-panel.tsx`
- Modify: `front/features/host/ui/host-session-editor.tsx`
- Test: `front/tests/unit/host-session-editor.test.tsx`

Docs files:

- Create: `docs/development/session-import-generator.md`
- Create: `docs/development/fixtures/session-import-example.json`
- Modify: `docs/development/README.md` if it already has a suitable guide index.

## Task 1: Server Preview API And Validation

**Files:**

- Create: `server/src/test/kotlin/com/readmates/sessionimport/api/HostSessionImportControllerDbTest.kt`
- Create: `server/src/main/kotlin/com/readmates/sessionimport/application/model/SessionImportModels.kt`
- Create: `server/src/main/kotlin/com/readmates/sessionimport/application/port/in/SessionImportUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/sessionimport/application/port/out/SessionImportWritePort.kt`
- Create: `server/src/main/kotlin/com/readmates/sessionimport/application/service/SessionImportService.kt`
- Create: `server/src/main/kotlin/com/readmates/sessionimport/adapter/in/web/SessionImportWebDtos.kt`
- Create: `server/src/main/kotlin/com/readmates/sessionimport/adapter/in/web/SessionImportController.kt`
- Create: `server/src/main/kotlin/com/readmates/sessionimport/adapter/in/web/SessionImportErrorHandler.kt`
- Create: `server/src/main/kotlin/com/readmates/sessionimport/adapter/out/persistence/JdbcSessionImportWriteAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`

- [ ] **Step 1: Write the failing preview integration tests**

Create `server/src/test/kotlin/com/readmates/sessionimport/api/HostSessionImportControllerDbTest.kt`. Use an isolated fixture so replacement tests never delete shared dev seed records.

```kotlin
package com.readmates.sessionimport.api

import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post

private const val CLUB_ID = "00000000-0000-0000-0000-000000000001"
private const val SESSION_ID = "00000000-0000-0000-0000-000000079501"
private const val HOST_USER_ID = "00000000-0000-0000-0000-000000079511"
private const val MEMBER_USER_ID = "00000000-0000-0000-0000-000000079512"
private const val HOST_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000079521"
private const val MEMBER_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000079522"

private const val CLEANUP_SQL = """
delete from session_feedback_documents where session_id = '$SESSION_ID';
delete from public_session_publications where session_id = '$SESSION_ID';
delete from highlights where session_id = '$SESSION_ID';
delete from one_line_reviews where session_id = '$SESSION_ID';
delete from session_participants where session_id = '$SESSION_ID';
delete from sessions where id = '$SESSION_ID';
delete from memberships where id in ('$HOST_MEMBERSHIP_ID', '$MEMBER_MEMBERSHIP_ID');
delete from users where id in ('$HOST_USER_ID', '$MEMBER_USER_ID');
"""

private const val INSERT_FIXTURE_SQL = """
insert into users (id, email, name, short_name, auth_provider)
values
  ('$HOST_USER_ID', 'session-import-host@example.test', 'Import Host', 'Host', 'PASSWORD'),
  ('$MEMBER_USER_ID', 'session-import-member@example.test', 'Import Member', 'Member', 'PASSWORD');
insert into memberships (id, club_id, user_id, role, status, joined_at)
values
  ('$HOST_MEMBERSHIP_ID', '$CLUB_ID', '$HOST_USER_ID', 'HOST', 'ACTIVE', '2026-05-01 00:00:00.000000'),
  ('$MEMBER_MEMBERSHIP_ID', '$CLUB_ID', '$MEMBER_USER_ID', 'MEMBER', 'ACTIVE', '2026-05-01 00:00:00.000000');
insert into sessions (
  id, club_id, number, title, book_title, book_author, book_translator, book_link, book_image_url,
  session_date, start_time, end_time, location_label, meeting_url, meeting_passcode,
  question_deadline_at, state, visibility
)
values (
  '$SESSION_ID', '$CLUB_ID', 7951, '7951회차 · Import Test Book', 'Import Test Book', 'Import Author',
  null, null, null, '2026-05-14', '20:00:00', '22:00:00', '온라인', null, null,
  '2026-05-13 14:59:00.000000', 'CLOSED', 'MEMBER'
);
insert into session_participants (id, club_id, session_id, membership_id, rsvp_status, attendance_status, participation_status)
values
  ('00000000-0000-0000-0000-000000079531', '$CLUB_ID', '$SESSION_ID', '$HOST_MEMBERSHIP_ID', 'GOING', 'ATTENDED', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000079532', '$CLUB_ID', '$SESSION_ID', '$MEMBER_MEMBERSHIP_ID', 'GOING', 'ATTENDED', 'ACTIVE');
insert into public_session_publications (id, club_id, session_id, public_summary, is_public, visibility, published_at)
values ('00000000-0000-0000-0000-000000079541', '$CLUB_ID', '$SESSION_ID', 'Existing summary.', false, 'MEMBER', null);
insert into highlights (id, club_id, session_id, membership_id, text, sort_order)
values
  ('00000000-0000-0000-0000-000000079551', '$CLUB_ID', '$SESSION_ID', '$HOST_MEMBERSHIP_ID', 'Existing highlight 1.', 0),
  ('00000000-0000-0000-0000-000000079552', '$CLUB_ID', '$SESSION_ID', '$MEMBER_MEMBERSHIP_ID', 'Existing highlight 2.', 1),
  ('00000000-0000-0000-0000-000000079553', '$CLUB_ID', '$SESSION_ID', '$HOST_MEMBERSHIP_ID', 'Existing highlight 3.', 2);
insert into one_line_reviews (id, club_id, session_id, membership_id, text, visibility)
values
  ('00000000-0000-0000-0000-000000079561', '$CLUB_ID', '$SESSION_ID', '$HOST_MEMBERSHIP_ID', 'Existing one line 1.', 'SESSION'),
  ('00000000-0000-0000-0000-000000079562', '$CLUB_ID', '$SESSION_ID', '$MEMBER_MEMBERSHIP_ID', 'Existing one line 2.', 'SESSION');
insert into session_feedback_documents (id, club_id, session_id, version, source_text, document_title, file_name, content_type, file_size)
values (
  '00000000-0000-0000-0000-000000079571', '$CLUB_ID', '$SESSION_ID', 1,
  '<!-- readmates-feedback:v1 -->\n\n# Existing Feedback\n\nImport Test Book · 2026.05.14\n\n## 메타\n\n- 일시: 2026.05.14 (목) · 20:00\n- 책: Import Test Book\n\n## 관찰자 노트\n\nExisting notes.\n\n## 참여자별 피드백\n\n### 01. Import Host\n\n역할: 진행자\n\n#### 참여 스타일\n\nExisting style.\n\n#### 실질 기여\n\n- Existing contribution.\n\n#### 문제점과 자기모순\n\n##### 1. Existing point\n\n- 핵심: Existing core.\n- 근거: Existing evidence.\n- 해석: Existing interpretation.\n\n#### 실천 과제\n\n1. Existing action.\n\n#### 드러난 한 문장\n\n> Existing quote.\n\n맥락: Existing context.\n\n주석: Existing note.\n',
  'Existing Feedback', 'existing-feedback.md', 'text/markdown', 775
);
"""

@SpringBootTest(
    properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"],
)
@AutoConfigureMockMvc
@Sql(statements = [CLEANUP_SQL, INSERT_FIXTURE_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class HostSessionImportControllerDbTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `host previews valid session import json`() {
        mockMvc
            .post("/api/host/sessions/$SESSION_ID/session-import/preview") {
                with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user("session-import-host@example.test"))
                contentType = MediaType.APPLICATION_JSON
                content = validImportJson(recordVisibility = "MEMBER")
            }.andExpect {
                status { isOk() }
                jsonPath("$.valid") { value(true) }
                jsonPath("$.session.sessionNumber") { value(7951) }
                jsonPath("$.publication.summary") { value("Import summary.") }
                jsonPath("$.highlights.length()") { value(2) }
                jsonPath("$.oneLineReviews.length()") { value(2) }
                jsonPath("$.feedbackDocument.title") { value("Import Feedback") }
                jsonPath("$.issues.length()") { value(0) }
            }
    }

    @Test
    fun `preview reports session mismatch without writing`() {
        mockMvc
            .post("/api/host/sessions/$SESSION_ID/session-import/preview") {
                with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user("session-import-host@example.test"))
                contentType = MediaType.APPLICATION_JSON
                content = validImportJson(sessionNumber = 7952, recordVisibility = "MEMBER")
            }.andExpect {
                status { isOk() }
                jsonPath("$.valid") { value(false) }
                jsonPath("$.issues[0].code") { value("SESSION_NUMBER_MISMATCH") }
            }
    }

    @Test
    fun `preview rejects non host member`() {
        mockMvc
            .post("/api/host/sessions/$SESSION_ID/session-import/preview") {
                with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user("session-import-member@example.test"))
                contentType = MediaType.APPLICATION_JSON
                content = validImportJson(recordVisibility = "MEMBER")
            }.andExpect {
                status { isForbidden() }
            }
    }

    private fun countRows(tableName: String): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from $tableName where club_id = '$CLUB_ID' and session_id = '$SESSION_ID'",
            Int::class.java,
        ) ?: 0
}

private fun validImportJson(
    sessionNumber: Int = 7951,
    recordVisibility: String = "MEMBER",
): String {
    val markdown = importFeedbackMarkdown().replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n")
    return """
{
  "recordVisibility": "$recordVisibility",
  "format": "readmates-session-import:v1",
  "session": {
    "number": $sessionNumber,
    "bookTitle": "Import Test Book",
    "meetingDate": "2026-05-14"
  },
  "publication": {
    "summary": "Import summary."
  },
  "highlights": [
    { "authorName": "Import Host", "text": "Import highlight from host." },
    { "authorName": "Import Member", "text": "Import highlight from member." }
  ],
  "oneLineReviews": [
    { "authorName": "Import Host", "text": "Import one line from host." },
    { "authorName": "Import Member", "text": "Import one line from member." }
  ],
  "feedbackDocument": {
    "fileName": "session-7951-import.md",
    "markdown": "$markdown"
  }
}
""".trimIndent()
}

private fun importFeedbackMarkdown() = """
<!-- readmates-feedback:v1 -->

# Import Feedback

Import Test Book · 2026.05.14

## 메타

- 일시: 2026.05.14 (목) · 20:00
- 소요시간: 2시간
- 책: Import Test Book · Import Author
- 참여자: Import Host, Import Member

## 관찰자 노트

Import notes.

## 참여자별 피드백

### 01. Import Host

역할: 진행자

#### 참여 스타일

Discussion was steady.

#### 실질 기여

- Framed the central question.

#### 문제점과 자기모순

##### 1. Scope was broad

- 핵심: The question covered many examples.
- 근거: Multiple contexts were connected.
- 해석: Narrowing the frame would improve the next session.

#### 실천 과제

1. State the question boundary first.

#### 드러난 한 문장

> A question needs a boundary.

맥락: Closing the session

주석: This captures the host role.

### 02. Import Member

역할: 해석자

#### 참여 스타일

Interpretation connected concepts to examples.

#### 실질 기여

- Added a second perspective.

#### 문제점과 자기모순

##### 1. Explanation was long

- 핵심: The conclusion came late.
- 근거: Several examples were chained together.
- 해석: Leading with the conclusion would help.

#### 실천 과제

1. Say the conclusion first.

#### 드러난 한 문장

> Responsibility belongs with interpretation.

맥락: Discussing how ideas travel

주석: This captures the interpretive stance.
""".trimIndent()
```

- [ ] **Step 2: Run the preview tests to verify they fail**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.sessionimport.api.HostSessionImportControllerDbTest
```

Expected: FAIL because the controller and CSRF ignore rule do not exist.

- [ ] **Step 3: Add application models and use case ports**

Create `server/src/main/kotlin/com/readmates/sessionimport/application/model/SessionImportModels.kt`:

```kotlin
package com.readmates.sessionimport.application.model

import com.readmates.session.application.SessionRecordVisibility
import com.readmates.shared.security.CurrentMember
import java.time.LocalDate
import java.util.UUID

data class SessionImportCommand(
    val host: CurrentMember,
    val sessionId: UUID,
    val recordVisibility: SessionRecordVisibility,
    val format: String,
    val session: SessionImportSessionCommand,
    val publication: SessionImportPublicationCommand,
    val highlights: List<SessionImportRecordCommand>,
    val oneLineReviews: List<SessionImportRecordCommand>,
    val feedbackDocument: SessionImportFeedbackDocumentCommand,
)

data class SessionImportSessionCommand(val number: Int, val bookTitle: String, val meetingDate: LocalDate)
data class SessionImportPublicationCommand(val summary: String)
data class SessionImportRecordCommand(val authorName: String, val text: String)
data class SessionImportFeedbackDocumentCommand(val fileName: String, val markdown: String)
data class SessionImportTarget(
    val sessionId: UUID,
    val clubId: UUID,
    val sessionNumber: Int,
    val bookTitle: String,
    val meetingDate: LocalDate,
    val attendees: List<SessionImportAttendee>,
)
data class SessionImportAttendee(val membershipId: UUID, val displayName: String, val active: Boolean)
data class SessionImportIssue(val code: String, val message: String)
data class SessionImportPreviewResult(
    val valid: Boolean,
    val session: SessionImportSessionPreview,
    val publication: SessionImportPublicationPreview,
    val highlights: List<SessionImportRecordPreview>,
    val oneLineReviews: List<SessionImportRecordPreview>,
    val feedbackDocument: SessionImportFeedbackDocumentPreview,
    val issues: List<SessionImportIssue>,
)
data class SessionImportSessionPreview(val sessionNumber: Int?, val bookTitle: String?, val meetingDate: String?)
data class SessionImportPublicationPreview(val summary: String)
data class SessionImportRecordPreview(
    val authorName: String,
    val text: String,
    val authorMatched: Boolean,
    val membershipId: String?,
)
data class SessionImportFeedbackDocumentPreview(val fileName: String, val title: String?, val valid: Boolean)
data class SessionImportCommitResult(
    val sessionId: String,
    val publication: SessionImportPublicationPreview,
    val highlights: List<SessionImportRecordPreview>,
    val oneLineReviews: List<SessionImportRecordPreview>,
    val feedbackDocument: SessionImportCommittedFeedbackDocument,
)
data class SessionImportCommittedFeedbackDocument(
    val uploaded: Boolean,
    val fileName: String,
    val title: String,
    val uploadedAt: String?,
)
```

Create `server/src/main/kotlin/com/readmates/sessionimport/application/port/in/SessionImportUseCases.kt`:

```kotlin
package com.readmates.sessionimport.application.port.`in`

import com.readmates.sessionimport.application.model.SessionImportCommand
import com.readmates.sessionimport.application.model.SessionImportCommitResult
import com.readmates.sessionimport.application.model.SessionImportPreviewResult

interface PreviewSessionImportUseCase {
    fun preview(command: SessionImportCommand): SessionImportPreviewResult
}

interface CommitSessionImportUseCase {
    fun commit(command: SessionImportCommand): SessionImportCommitResult
}
```

Create `server/src/main/kotlin/com/readmates/sessionimport/application/port/out/SessionImportWritePort.kt`:

```kotlin
package com.readmates.sessionimport.application.port.out

import com.readmates.session.application.SessionRecordVisibility
import com.readmates.sessionimport.application.model.SessionImportFeedbackDocumentCommand
import com.readmates.sessionimport.application.model.SessionImportRecordPreview
import com.readmates.sessionimport.application.model.SessionImportTarget
import com.readmates.shared.security.CurrentMember
import java.util.UUID

interface SessionImportWritePort {
    fun loadTarget(host: CurrentMember, sessionId: UUID): SessionImportTarget?

    fun replaceRecords(
        host: CurrentMember,
        sessionId: UUID,
        visibility: SessionRecordVisibility,
        publicationSummary: String,
        highlights: List<SessionImportRecordPreview>,
        oneLineReviews: List<SessionImportRecordPreview>,
        feedbackDocument: SessionImportFeedbackDocumentCommand,
        feedbackTitle: String,
    ): SessionImportStoredFeedbackDocument
}

data class SessionImportStoredFeedbackDocument(
    val fileName: String,
    val title: String,
    val uploadedAt: String?,
)
```

- [ ] **Step 4: Add preview service validation**

Create `server/src/main/kotlin/com/readmates/sessionimport/application/service/SessionImportService.kt`:

```kotlin
package com.readmates.sessionimport.application.service

import com.readmates.feedback.application.FeedbackDocumentParser
import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.session.application.requireHost
import com.readmates.sessionimport.application.model.SessionImportCommand
import com.readmates.sessionimport.application.model.SessionImportFeedbackDocumentPreview
import com.readmates.sessionimport.application.model.SessionImportIssue
import com.readmates.sessionimport.application.model.SessionImportPreviewResult
import com.readmates.sessionimport.application.model.SessionImportPublicationPreview
import com.readmates.sessionimport.application.model.SessionImportRecordPreview
import com.readmates.sessionimport.application.model.SessionImportSessionPreview
import com.readmates.sessionimport.application.model.SessionImportTarget
import com.readmates.sessionimport.application.port.`in`.CommitSessionImportUseCase
import com.readmates.sessionimport.application.port.`in`.PreviewSessionImportUseCase
import com.readmates.sessionimport.application.port.out.SessionImportWritePort
import com.readmates.shared.cache.ReadCacheInvalidationPort
import org.springframework.stereotype.Service

class InvalidSessionImportException(val issues: List<SessionImportIssue>) : RuntimeException("Invalid session import")

@Service
class SessionImportService(
    private val writePort: SessionImportWritePort,
    private val cacheInvalidation: ReadCacheInvalidationPort = ReadCacheInvalidationPort.Noop(),
) : PreviewSessionImportUseCase, CommitSessionImportUseCase {
    private val parser = FeedbackDocumentParser()

    override fun preview(command: SessionImportCommand): SessionImportPreviewResult {
        requireHost(command.host)
        val target = writePort.loadTarget(command.host, command.sessionId) ?: throw HostSessionNotFoundException()
        return validate(command, target)
    }

    override fun commit(command: SessionImportCommand) =
        throw UnsupportedOperationException("Commit is implemented in Task 2")

    private fun validate(command: SessionImportCommand, target: SessionImportTarget): SessionImportPreviewResult {
        val issues = mutableListOf<SessionImportIssue>()
        if (command.format != FORMAT) {
            issues += SessionImportIssue("INVALID_FORMAT", "이 파일은 readmates-session-import:v1 형식이 아닙니다.")
        }
        if (command.recordVisibility == SessionRecordVisibility.HOST_ONLY) {
            issues += SessionImportIssue("HOST_ONLY_VISIBILITY", "호스트 전용 공개 범위에서는 세션 기록 import를 저장할 수 없습니다.")
        }
        if (command.session.number != target.sessionNumber) {
            issues += SessionImportIssue("SESSION_NUMBER_MISMATCH", "${command.session.number}회차 파일인데 현재 화면은 ${target.sessionNumber}회차입니다.")
        }
        if (command.session.bookTitle.trim() != target.bookTitle) {
            issues += SessionImportIssue("BOOK_TITLE_MISMATCH", "책 제목이 현재 세션과 일치하지 않습니다.")
        }
        if (command.session.meetingDate != target.meetingDate) {
            issues += SessionImportIssue("MEETING_DATE_MISMATCH", "모임 날짜가 현재 세션과 일치하지 않습니다.")
        }
        if (command.publication.summary.isBlank()) {
            issues += SessionImportIssue("SUMMARY_REQUIRED", "공개 요약을 입력해 주세요.")
        }
        if (command.highlights.isEmpty() || command.highlights.size > 6) {
            issues += SessionImportIssue("HIGHLIGHT_COUNT_INVALID", "하이라이트는 1개 이상 6개 이하로 입력해 주세요.")
        }
        if (command.oneLineReviews.isEmpty()) {
            issues += SessionImportIssue("ONE_LINE_REVIEW_REQUIRED", "한줄평을 1개 이상 입력해 주세요.")
        }

        val highlights = command.highlights.map { matchRecord(it.authorName, it.text, target, issues, "HIGHLIGHT_AUTHOR_NOT_FOUND") }
        val oneLineReviews = command.oneLineReviews.map { matchRecord(it.authorName, it.text, target, issues, "ONE_LINE_AUTHOR_NOT_FOUND") }
        command.oneLineReviews.groupBy { it.authorName.trim() }.filterValues { it.size > 1 }.keys.forEach { authorName ->
            issues += SessionImportIssue("DUPLICATE_ONE_LINE_AUTHOR", "한줄평 작성자 '$authorName'가 중복되었습니다.")
        }
        val parsedFeedback =
            runCatching { parser.parse(command.feedbackDocument.markdown) }
                .getOrElse {
                    issues += SessionImportIssue("INVALID_FEEDBACK_DOCUMENT", "피드백 문서가 ReadMates 피드백 템플릿 형식이 아닙니다.")
                    null
                }

        return SessionImportPreviewResult(
            valid = issues.isEmpty(),
            session = SessionImportSessionPreview(command.session.number, command.session.bookTitle, command.session.meetingDate.toString()),
            publication = SessionImportPublicationPreview(command.publication.summary.trim()),
            highlights = highlights,
            oneLineReviews = oneLineReviews,
            feedbackDocument = SessionImportFeedbackDocumentPreview(command.feedbackDocument.fileName, parsedFeedback?.title, parsedFeedback != null),
            issues = issues,
        )
    }

    private fun matchRecord(
        authorName: String,
        text: String,
        target: SessionImportTarget,
        issues: MutableList<SessionImportIssue>,
        issueCode: String,
    ): SessionImportRecordPreview {
        val trimmedAuthorName = authorName.trim()
        val trimmedText = text.trim()
        val attendee = target.attendees.firstOrNull { it.active && it.displayName == trimmedAuthorName }
        if (trimmedText.isBlank()) {
            issues += SessionImportIssue("RECORD_TEXT_REQUIRED", "기록 문구가 비어 있습니다.")
        }
        if (attendee == null) {
            issues += SessionImportIssue(issueCode, "작성자 '$trimmedAuthorName'를 이 회차 참석자에서 찾을 수 없습니다.")
        }
        return SessionImportRecordPreview(trimmedAuthorName, trimmedText, attendee != null, attendee?.membershipId?.toString())
    }

    private companion object {
        private const val FORMAT = "readmates-session-import:v1"
    }
}
```

- [ ] **Step 5: Add web DTOs, controller, error handler, target adapter, and CSRF rule**

Create `server/src/main/kotlin/com/readmates/sessionimport/adapter/in/web/SessionImportWebDtos.kt`:

```kotlin
package com.readmates.sessionimport.adapter.`in`.web

import com.readmates.session.application.SessionRecordVisibility
import com.readmates.sessionimport.application.model.SessionImportCommand
import com.readmates.sessionimport.application.model.SessionImportFeedbackDocumentCommand
import com.readmates.sessionimport.application.model.SessionImportPublicationCommand
import com.readmates.sessionimport.application.model.SessionImportRecordCommand
import com.readmates.sessionimport.application.model.SessionImportSessionCommand
import com.readmates.shared.security.CurrentMember
import java.time.LocalDate
import java.util.UUID

data class SessionImportRequest(
    val recordVisibility: SessionRecordVisibility,
    val format: String,
    val session: SessionImportSessionRequest,
    val publication: SessionImportPublicationRequest,
    val highlights: List<SessionImportRecordRequest> = emptyList(),
    val oneLineReviews: List<SessionImportRecordRequest> = emptyList(),
    val feedbackDocument: SessionImportFeedbackDocumentRequest,
) {
    fun toCommand(host: CurrentMember, sessionId: UUID) =
        SessionImportCommand(
            host = host,
            sessionId = sessionId,
            recordVisibility = recordVisibility,
            format = format,
            session = SessionImportSessionCommand(session.number, session.bookTitle, LocalDate.parse(session.meetingDate)),
            publication = SessionImportPublicationCommand(publication.summary),
            highlights = highlights.map { SessionImportRecordCommand(it.authorName, it.text) },
            oneLineReviews = oneLineReviews.map { SessionImportRecordCommand(it.authorName, it.text) },
            feedbackDocument = SessionImportFeedbackDocumentCommand(feedbackDocument.fileName, feedbackDocument.markdown),
        )
}

data class SessionImportSessionRequest(val number: Int, val bookTitle: String, val meetingDate: String)
data class SessionImportPublicationRequest(val summary: String)
data class SessionImportRecordRequest(val authorName: String, val text: String)
data class SessionImportFeedbackDocumentRequest(val fileName: String, val markdown: String)
```

Create `server/src/main/kotlin/com/readmates/sessionimport/adapter/in/web/SessionImportController.kt`:

```kotlin
package com.readmates.sessionimport.adapter.`in`.web

import com.readmates.sessionimport.application.port.`in`.CommitSessionImportUseCase
import com.readmates.sessionimport.application.port.`in`.PreviewSessionImportUseCase
import com.readmates.shared.security.CurrentMember
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

@RestController
@RequestMapping("/api/host/sessions/{sessionId}/session-import")
class SessionImportController(
    private val previewSessionImportUseCase: PreviewSessionImportUseCase,
    private val commitSessionImportUseCase: CommitSessionImportUseCase,
) {
    @PostMapping("/preview")
    fun preview(@PathVariable sessionId: String, @RequestBody request: SessionImportRequest, member: CurrentMember) =
        previewSessionImportUseCase.preview(request.toCommand(member, parseSessionId(sessionId)))

    @PostMapping("/commit")
    fun commit(@PathVariable sessionId: String, @RequestBody request: SessionImportRequest, member: CurrentMember) =
        commitSessionImportUseCase.commit(request.toCommand(member, parseSessionId(sessionId)))

    private fun parseSessionId(value: String): UUID =
        runCatching { UUID.fromString(value) }
            .getOrElse { throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid session id") }
}
```

Create `server/src/main/kotlin/com/readmates/sessionimport/adapter/in/web/SessionImportErrorHandler.kt`:

```kotlin
package com.readmates.sessionimport.adapter.`in`.web

import com.readmates.sessionimport.application.service.InvalidSessionImportException
import com.readmates.shared.adapter.`in`.web.ApiErrorResponse
import com.readmates.shared.adapter.`in`.web.apiErrorResponse
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice(assignableTypes = [SessionImportController::class])
class SessionImportErrorHandler {
    @ExceptionHandler(InvalidSessionImportException::class)
    fun handleInvalidImport(exception: InvalidSessionImportException): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.BAD_REQUEST,
            code = "INVALID_SESSION_IMPORT",
            message = exception.issues.firstOrNull()?.message ?: "세션 import 파일을 확인해 주세요.",
        )
}
```

Create `server/src/main/kotlin/com/readmates/sessionimport/adapter/out/persistence/JdbcSessionImportWriteAdapter.kt` with `loadTarget` implemented and `replaceRecords` left for Task 2:

```kotlin
package com.readmates.sessionimport.adapter.out.persistence

import com.readmates.session.application.SessionRecordVisibility
import com.readmates.sessionimport.application.model.SessionImportAttendee
import com.readmates.sessionimport.application.model.SessionImportFeedbackDocumentCommand
import com.readmates.sessionimport.application.model.SessionImportRecordPreview
import com.readmates.sessionimport.application.model.SessionImportTarget
import com.readmates.sessionimport.application.port.out.SessionImportStoredFeedbackDocument
import com.readmates.sessionimport.application.port.out.SessionImportWritePort
import com.readmates.shared.db.dbString
import com.readmates.shared.db.uuid
import com.readmates.shared.security.CurrentMember
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class JdbcSessionImportWriteAdapter(private val jdbcTemplate: JdbcTemplate) : SessionImportWritePort {
    override fun loadTarget(host: CurrentMember, sessionId: UUID): SessionImportTarget? {
        val session =
            jdbcTemplate.query(
                """
                select sessions.id, sessions.club_id, sessions.number, sessions.book_title, sessions.session_date
                from sessions
                join memberships on memberships.club_id = sessions.club_id
                where sessions.id = ?
                  and sessions.club_id = ?
                  and memberships.user_id = ?
                  and memberships.role = 'HOST'
                  and memberships.status = 'ACTIVE'
                """.trimIndent(),
                { rs, _ ->
                    SessionImportTarget(
                        sessionId = rs.uuid("id"),
                        clubId = rs.uuid("club_id"),
                        sessionNumber = rs.getInt("number"),
                        bookTitle = rs.getString("book_title"),
                        meetingDate = rs.getObject("session_date", java.time.LocalDate::class.java),
                        attendees = emptyList(),
                    )
                },
                sessionId.dbString(),
                host.clubId.dbString(),
                host.userId.dbString(),
            ).firstOrNull() ?: return null

        val attendees =
            jdbcTemplate.query(
                """
                select memberships.id, users.name, session_participants.participation_status
                from session_participants
                join memberships on memberships.id = session_participants.membership_id
                  and memberships.club_id = session_participants.club_id
                join users on users.id = memberships.user_id
                where session_participants.club_id = ?
                  and session_participants.session_id = ?
                """.trimIndent(),
                { rs, _ -> SessionImportAttendee(rs.uuid("id"), rs.getString("name"), rs.getString("participation_status") == "ACTIVE") },
                host.clubId.dbString(),
                sessionId.dbString(),
            )
        return session.copy(attendees = attendees)
    }

    override fun replaceRecords(
        host: CurrentMember,
        sessionId: UUID,
        visibility: SessionRecordVisibility,
        publicationSummary: String,
        highlights: List<SessionImportRecordPreview>,
        oneLineReviews: List<SessionImportRecordPreview>,
        feedbackDocument: SessionImportFeedbackDocumentCommand,
        feedbackTitle: String,
    ): SessionImportStoredFeedbackDocument =
        throw UnsupportedOperationException("Replacement write is implemented in Task 2")
}
```

In `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`, add this matcher beside the existing host session write matchers:

```kotlin
methodAndPath("POST", Regex("^/api/host/sessions/[^/]+/session-import/(preview|commit)$")),
```

- [ ] **Step 6: Run the preview tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.sessionimport.api.HostSessionImportControllerDbTest
```

Expected: PASS for preview tests. Commit behavior is still intentionally unimplemented.

- [ ] **Step 7: Commit Task 1**

```bash
git add server/src/main/kotlin/com/readmates/sessionimport server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt server/src/test/kotlin/com/readmates/sessionimport/api/HostSessionImportControllerDbTest.kt
git commit -m "feat: add session import preview validation"
```

## Task 2: Server Commit Persistence And Transactional Replacement

**Files:**

- Modify: `server/src/test/kotlin/com/readmates/sessionimport/api/HostSessionImportControllerDbTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/sessionimport/application/service/SessionImportService.kt`
- Modify: `server/src/main/kotlin/com/readmates/sessionimport/adapter/out/persistence/JdbcSessionImportWriteAdapter.kt`

- [ ] **Step 1: Add failing commit tests**

Append tests to `HostSessionImportControllerDbTest`:

```kotlin
@Test
fun `host commits valid import and replaces session records using selected visibility`() {
    mockMvc
        .post("/api/host/sessions/$SESSION_ID/session-import/commit") {
            with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user("session-import-host@example.test"))
            contentType = MediaType.APPLICATION_JSON
            content = validImportJson(recordVisibility = "PUBLIC")
        }.andExpect {
            status { isOk() }
            jsonPath("$.sessionId") { value(SESSION_ID) }
            jsonPath("$.publication.summary") { value("Import summary.") }
            jsonPath("$.highlights.length()") { value(2) }
            jsonPath("$.oneLineReviews.length()") { value(2) }
            jsonPath("$.feedbackDocument.uploaded") { value(true) }
            jsonPath("$.feedbackDocument.fileName") { value("session-7951-import.md") }
        }

    org.assertj.core.api.Assertions.assertThat(countRows("highlights")).isEqualTo(2)
    org.assertj.core.api.Assertions.assertThat(countRows("one_line_reviews")).isEqualTo(2)
    org.assertj.core.api.Assertions.assertThat(countRows("session_feedback_documents")).isEqualTo(2)
    org.assertj.core.api.Assertions.assertThat(singleValue("select visibility from sessions where id = '$SESSION_ID'")).isEqualTo("PUBLIC")
    org.assertj.core.api.Assertions.assertThat(singleValue("select visibility from public_session_publications where session_id = '$SESSION_ID'")).isEqualTo("PUBLIC")
    org.assertj.core.api.Assertions.assertThat(singleValue("select min(visibility) from one_line_reviews where session_id = '$SESSION_ID'")).isEqualTo("PUBLIC")
}

@Test
fun `commit rejects host only visibility without partial writes`() {
    mockMvc
        .post("/api/host/sessions/$SESSION_ID/session-import/commit") {
            with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user("session-import-host@example.test"))
            contentType = MediaType.APPLICATION_JSON
            content = validImportJson(recordVisibility = "HOST_ONLY")
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.code") { value("INVALID_SESSION_IMPORT") }
        }

    org.assertj.core.api.Assertions.assertThat(countRows("highlights")).isEqualTo(3)
    org.assertj.core.api.Assertions.assertThat(countRows("one_line_reviews")).isEqualTo(2)
    org.assertj.core.api.Assertions.assertThat(countRows("session_feedback_documents")).isEqualTo(1)
    org.assertj.core.api.Assertions.assertThat(singleValue("select visibility from sessions where id = '$SESSION_ID'")).isEqualTo("MEMBER")
}

private fun singleValue(sql: String): String =
    jdbcTemplate.queryForObject(sql, String::class.java) ?: error("No scalar value for SQL")
```

- [ ] **Step 2: Run commit tests to verify they fail**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.sessionimport.api.HostSessionImportControllerDbTest
```

Expected: FAIL because commit still throws `UnsupportedOperationException`.

- [ ] **Step 3: Implement transactional service commit**

Replace `commit` in `SessionImportService`:

```kotlin
@Transactional
override fun commit(command: SessionImportCommand): SessionImportCommitResult {
    requireHost(command.host)
    val target = writePort.loadTarget(command.host, command.sessionId) ?: throw HostSessionNotFoundException()
    val preview = validate(command, target)
    if (!preview.valid) {
        throw InvalidSessionImportException(preview.issues)
    }

    val parsedFeedback = parser.parse(command.feedbackDocument.markdown)
    val storedFeedback =
        writePort.replaceRecords(
            host = command.host,
            sessionId = command.sessionId,
            visibility = command.recordVisibility,
            publicationSummary = preview.publication.summary,
            highlights = preview.highlights,
            oneLineReviews = preview.oneLineReviews,
            feedbackDocument = command.feedbackDocument,
            feedbackTitle = parsedFeedback.title,
        )
    cacheInvalidation.evictClubContentAfterCommit(command.host.clubId)

    return SessionImportCommitResult(
        sessionId = command.sessionId.toString(),
        publication = preview.publication,
        highlights = preview.highlights,
        oneLineReviews = preview.oneLineReviews,
        feedbackDocument = SessionImportCommittedFeedbackDocument(true, storedFeedback.fileName, storedFeedback.title, storedFeedback.uploadedAt),
    )
}
```

Add imports:

```kotlin
import com.readmates.sessionimport.application.model.SessionImportCommitResult
import com.readmates.sessionimport.application.model.SessionImportCommittedFeedbackDocument
import org.springframework.transaction.annotation.Transactional
```

- [ ] **Step 4: Implement JDBC replacement**

Replace `replaceRecords` in `JdbcSessionImportWriteAdapter`:

```kotlin
override fun replaceRecords(
    host: CurrentMember,
    sessionId: UUID,
    visibility: SessionRecordVisibility,
    publicationSummary: String,
    highlights: List<SessionImportRecordPreview>,
    oneLineReviews: List<SessionImportRecordPreview>,
    feedbackDocument: SessionImportFeedbackDocumentCommand,
    feedbackTitle: String,
): SessionImportStoredFeedbackDocument {
    val publicationIsPublic = visibility == SessionRecordVisibility.PUBLIC
    val oneLineVisibility = if (publicationIsPublic) "PUBLIC" else "SESSION"

    jdbcTemplate.update(
        "update sessions set visibility = ? where id = ? and club_id = ?",
        visibility.name,
        sessionId.dbString(),
        host.clubId.dbString(),
    )
    jdbcTemplate.update(
        """
        insert into public_session_publications (id, club_id, session_id, public_summary, is_public, visibility, published_at)
        values (?, ?, ?, ?, ?, ?, case when ? then utc_timestamp(6) else null end)
        on duplicate key update
          public_summary = values(public_summary),
          is_public = values(is_public),
          visibility = values(visibility),
          published_at = values(published_at),
          updated_at = utc_timestamp(6)
        """.trimIndent(),
        UUID.randomUUID().dbString(),
        host.clubId.dbString(),
        sessionId.dbString(),
        publicationSummary,
        publicationIsPublic,
        visibility.name,
        publicationIsPublic,
    )
    jdbcTemplate.update("delete from highlights where club_id = ? and session_id = ?", host.clubId.dbString(), sessionId.dbString())
    highlights.forEachIndexed { index, highlight ->
        jdbcTemplate.update(
            "insert into highlights (id, club_id, session_id, membership_id, text, sort_order) values (?, ?, ?, ?, ?, ?)",
            UUID.randomUUID().dbString(),
            host.clubId.dbString(),
            sessionId.dbString(),
            highlight.membershipId,
            highlight.text,
            index,
        )
    }
    jdbcTemplate.update("delete from one_line_reviews where club_id = ? and session_id = ?", host.clubId.dbString(), sessionId.dbString())
    oneLineReviews.forEach { oneLine ->
        jdbcTemplate.update(
            "insert into one_line_reviews (id, club_id, session_id, membership_id, text, visibility) values (?, ?, ?, ?, ?, ?)",
            UUID.randomUUID().dbString(),
            host.clubId.dbString(),
            sessionId.dbString(),
            oneLine.membershipId,
            oneLine.text,
            oneLineVisibility,
        )
    }

    val version =
        jdbcTemplate.queryForObject(
            "select coalesce(max(version), 0) + 1 from session_feedback_documents where club_id = ? and session_id = ?",
            Int::class.java,
            host.clubId.dbString(),
            sessionId.dbString(),
        ) ?: 1
    val documentId = UUID.randomUUID()
    jdbcTemplate.update(
        """
        insert into session_feedback_documents (id, club_id, session_id, version, source_text, document_title, file_name, content_type, file_size)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """.trimIndent(),
        documentId.dbString(),
        host.clubId.dbString(),
        sessionId.dbString(),
        version,
        feedbackDocument.markdown,
        feedbackTitle,
        feedbackDocument.fileName,
        contentTypeFor(feedbackDocument.fileName),
        feedbackDocument.markdown.toByteArray(Charsets.UTF_8).size.toLong(),
    )
    return jdbcTemplate.queryForObject(
        "select file_name, document_title, created_at from session_feedback_documents where id = ?",
        { rs, _ -> SessionImportStoredFeedbackDocument(rs.getString("file_name"), rs.getString("document_title"), rs.getTimestamp("created_at").toInstant().toString()) },
        documentId.dbString(),
    ) ?: error("Stored session feedback document not found after import")
}

private fun contentTypeFor(fileName: String): String =
    if (fileName.lowercase().endsWith(".md")) "text/markdown" else "text/plain"
```

- [ ] **Step 5: Run server import tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.sessionimport.api.HostSessionImportControllerDbTest
```

Expected: PASS.

- [ ] **Step 6: Run related server regression tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.feedback.api.FeedbackDocumentControllerTest --tests com.readmates.publication.api.PublicControllerDbTest --tests com.readmates.archive.api.ArchiveControllerDbTest
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add server/src/main/kotlin/com/readmates/sessionimport server/src/test/kotlin/com/readmates/sessionimport/api/HostSessionImportControllerDbTest.kt
git commit -m "feat: commit session import records"
```

## Task 3: Frontend API Contracts And Pure Import Model

**Files:**

- Modify: `front/features/host/api/host-contracts.ts`
- Modify: `front/features/host/api/host-api.ts`
- Modify: `front/features/host/route/host-session-editor-actions.ts`
- Modify: `front/features/host/route/host-session-editor-data.ts`
- Modify: `front/features/host/ui/session-editor/session-editor-actions.ts`
- Create: `front/features/host/model/session-import-model.ts`
- Test: `front/features/host/model/session-import-model.test.ts`

- [ ] **Step 1: Write failing pure model tests**

Create `front/features/host/model/session-import-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildSessionImportRequest,
  getSessionImportBlockingIssues,
  parseSessionImportFileText,
  sessionImportFeedbackFromCommit,
  sessionImportPublicationFromCommit,
} from "./session-import-model";
import type { SessionImportCommitResponse, SessionImportPreviewResponse } from "@/features/host/api/host-contracts";

describe("session-import-model", () => {
  it("parses valid import json text without visibility", () => {
    expect(parseSessionImportFileText('{"format":"readmates-session-import:v1"}')).toEqual({
      format: "readmates-session-import:v1",
    });
  });

  it("builds an API request with editor-selected visibility", () => {
    const parsed = { format: "readmates-session-import:v1" };
    expect(buildSessionImportRequest(parsed, "PUBLIC")).toEqual({
      recordVisibility: "PUBLIC",
      format: "readmates-session-import:v1",
    });
  });

  it("reports invalid json as a readable issue", () => {
    expect(parseSessionImportFileText("{")).toEqual({ error: "JSON 파일을 읽을 수 없습니다." });
  });

  it("returns blocking issue labels from preview", () => {
    const preview: SessionImportPreviewResponse = {
      valid: false,
      session: { sessionNumber: 1, bookTitle: "Example Book", meetingDate: "2026-05-14" },
      publication: { summary: "요약" },
      highlights: [],
      oneLineReviews: [],
      feedbackDocument: { fileName: "feedback.md", title: null, valid: false },
      issues: [{ code: "INVALID_FEEDBACK_DOCUMENT", message: "피드백 문서 형식이 아닙니다." }],
    };
    expect(getSessionImportBlockingIssues(preview)).toEqual(["피드백 문서 형식이 아닙니다."]);
  });

  it("maps commit response into existing editor status shapes", () => {
    const commit: SessionImportCommitResponse = {
      sessionId: "session-1",
      publication: { summary: "저장된 요약" },
      highlights: [],
      oneLineReviews: [],
      feedbackDocument: {
        uploaded: true,
        fileName: "feedback.md",
        title: "Feedback",
        uploadedAt: "2026-05-15T00:00:00Z",
      },
    };
    expect(sessionImportPublicationFromCommit(commit, "PUBLIC")).toEqual({
      publicSummary: "저장된 요약",
      visibility: "PUBLIC",
    });
    expect(sessionImportFeedbackFromCommit(commit)).toEqual({
      uploaded: true,
      fileName: "feedback.md",
      uploadedAt: "2026-05-15T00:00:00Z",
    });
  });
});
```

- [ ] **Step 2: Run model tests to verify they fail**

Run:

```bash
pnpm --dir front test front/features/host/model/session-import-model.test.ts
```

Expected: FAIL because the model file does not exist.

- [ ] **Step 3: Add frontend contract types and parser**

In `front/features/host/api/host-contracts.ts`, add these types after `HostSessionPublicationRequest`:

```ts
export type SessionImportFileRequest = {
  format: string;
  session: { number: number; bookTitle: string; meetingDate: string };
  publication: { summary: string };
  highlights: Array<{ authorName: string; text: string }>;
  oneLineReviews: Array<{ authorName: string; text: string }>;
  feedbackDocument: { fileName: string; markdown: string };
};

export type SessionImportRequest = SessionImportFileRequest & {
  recordVisibility: SessionRecordVisibility;
};

export type SessionImportIssue = { code: string; message: string };

export type SessionImportPreviewResponse = {
  valid: boolean;
  session: { sessionNumber: number | null; bookTitle: string | null; meetingDate: string | null };
  publication: { summary: string };
  highlights: Array<{ authorName: string; text: string; authorMatched: boolean; membershipId: string | null }>;
  oneLineReviews: Array<{ authorName: string; text: string; authorMatched: boolean; membershipId: string | null }>;
  feedbackDocument: { fileName: string; title: string | null; valid: boolean };
  issues: SessionImportIssue[];
};

export type SessionImportCommitResponse = {
  sessionId: string;
  publication: { summary: string };
  highlights: SessionImportPreviewResponse["highlights"];
  oneLineReviews: SessionImportPreviewResponse["oneLineReviews"];
  feedbackDocument: { uploaded: boolean; fileName: string; title: string; uploadedAt: string | null };
};
```

Add a DEV schema and parser near the existing host schemas:

```ts
const SessionImportIssueSchema = z.object({ code: z.string(), message: z.string() });
const SessionImportRecordPreviewSchema = z.object({
  authorName: z.string(),
  text: z.string(),
  authorMatched: z.boolean(),
  membershipId: z.string().nullable(),
});

export const SessionImportPreviewResponseSchema = import.meta.env.DEV
  ? z.object({
      valid: z.boolean(),
      session: z.object({
        sessionNumber: z.number().nullable(),
        bookTitle: z.string().nullable(),
        meetingDate: z.string().nullable(),
      }),
      publication: z.object({ summary: z.string() }),
      highlights: z.array(SessionImportRecordPreviewSchema),
      oneLineReviews: z.array(SessionImportRecordPreviewSchema),
      feedbackDocument: z.object({
        fileName: z.string(),
        title: z.string().nullable(),
        valid: z.boolean(),
      }),
      issues: z.array(SessionImportIssueSchema),
    })
  : (null as never);

export function parseSessionImportPreviewResponse(value: unknown): SessionImportPreviewResponse {
  if (import.meta.env.DEV) {
    return SessionImportPreviewResponseSchema.parse(value) as SessionImportPreviewResponse;
  }
  return value as SessionImportPreviewResponse;
}
```

- [ ] **Step 4: Add frontend API calls and action contracts**

In `front/features/host/api/host-api.ts`, import `SessionImportRequest`, `SessionImportPreviewResponse`, `SessionImportCommitResponse`, and `parseSessionImportPreviewResponse`. Add:

```ts
export function previewHostSessionImport(sessionId: string, request: SessionImportRequest) {
  return readmatesFetch<SessionImportPreviewResponse>(
    `/api/host/sessions/${encodeURIComponent(sessionId)}/session-import/preview`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
  ).then(parseSessionImportPreviewResponse);
}

export function commitHostSessionImport(sessionId: string, request: SessionImportRequest) {
  return readmatesFetchResponse(
    `/api/host/sessions/${encodeURIComponent(sessionId)}/session-import/commit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      cache: "no-store",
    },
  ) as Promise<Response & { json(): Promise<SessionImportCommitResponse> }>;
}
```

Update both `HostSessionEditorActions` types:

```ts
previewSessionImport: (sessionId: string, request: SessionImportRequest) => Promise<SessionImportPreviewResponse>;
commitSessionImport: (sessionId: string, request: SessionImportRequest) => Promise<JsonResponse<SessionImportCommitResponse>>;
```

In `front/features/host/route/host-session-editor-data.ts`, import and wire:

```ts
previewHostSessionImport,
commitHostSessionImport,
```

```ts
previewSessionImport: previewHostSessionImport,
commitSessionImport: commitHostSessionImport,
```

- [ ] **Step 5: Implement pure model helpers**

Create `front/features/host/model/session-import-model.ts`:

```ts
import type {
  FeedbackDocumentStatus,
  HostSessionPublication,
  SessionImportCommitResponse,
  SessionImportFileRequest,
  SessionImportPreviewResponse,
  SessionImportRequest,
  SessionRecordVisibility,
} from "@/features/host/api/host-contracts";

export type SessionImportParseResult = Partial<SessionImportFileRequest> | { error: string };

export function parseSessionImportFileText(text: string): SessionImportParseResult {
  try {
    return JSON.parse(text) as Partial<SessionImportFileRequest>;
  } catch {
    return { error: "JSON 파일을 읽을 수 없습니다." };
  }
}

export function buildSessionImportRequest(
  file: Partial<SessionImportFileRequest>,
  recordVisibility: SessionRecordVisibility,
): SessionImportRequest {
  return { ...(file as SessionImportFileRequest), recordVisibility };
}

export function getSessionImportBlockingIssues(preview: SessionImportPreviewResponse | null): string[] {
  return preview ? preview.issues.map((issue) => issue.message) : [];
}

export function canCommitSessionImport(
  preview: SessionImportPreviewResponse | null,
  recordVisibility: SessionRecordVisibility,
) {
  return Boolean(preview?.valid && recordVisibility !== "HOST_ONLY");
}

export function sessionImportPublicationFromCommit(
  commit: SessionImportCommitResponse,
  visibility: SessionRecordVisibility,
): HostSessionPublication {
  return { publicSummary: commit.publication.summary, visibility };
}

export function sessionImportFeedbackFromCommit(commit: SessionImportCommitResponse): FeedbackDocumentStatus {
  return {
    uploaded: commit.feedbackDocument.uploaded,
    fileName: commit.feedbackDocument.fileName,
    uploadedAt: commit.feedbackDocument.uploadedAt,
  };
}
```

- [ ] **Step 6: Run model tests**

Run:

```bash
pnpm --dir front test front/features/host/model/session-import-model.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add front/features/host/api/host-api.ts front/features/host/api/host-contracts.ts front/features/host/route/host-session-editor-actions.ts front/features/host/route/host-session-editor-data.ts front/features/host/ui/session-editor/session-editor-actions.ts front/features/host/model/session-import-model.ts front/features/host/model/session-import-model.test.ts
git commit -m "feat: add host session import client contract"
```

## Task 4: Host Editor Import Preview UI

**Files:**

- Create: `front/features/host/ui/session-editor/session-import-panel.tsx`
- Modify: `front/features/host/ui/session-editor/mobile-editor-tabs.tsx`
- Modify: `front/features/host/ui/host-session-editor.tsx`
- Modify: `front/tests/unit/host-session-editor.test.tsx`

- [ ] **Step 1: Add failing UI tests**

In `front/tests/unit/host-session-editor.test.tsx`, extend `hostSessionEditorTestActions`:

```ts
previewSessionImport: (sessionId, request) =>
  fetch(`/api/bff/api/host/sessions/${encodeURIComponent(sessionId)}/session-import/preview`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(request),
    cache: "no-store",
  }).then((response) => response.json()),
commitSessionImport: (sessionId, request) =>
  fetch(`/api/bff/api/host/sessions/${encodeURIComponent(sessionId)}/session-import/commit`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(request),
    cache: "no-store",
  }) as Promise<JsonResponse<SessionImportCommitResponse>>,
```

Add imports:

```ts
import type { SessionImportCommitResponse, SessionImportPreviewResponse } from "@/features/host/api/host-contracts";
```

Append tests:

```ts
it("previews a session import json file with selected visibility", async () => {
  const user = userEvent.setup();
  const preview: SessionImportPreviewResponse = {
    valid: true,
    session: { sessionNumber: 1, bookTitle: "Example Book", meetingDate: "2026-05-14" },
    publication: { summary: "가져온 요약입니다." },
    highlights: [{ authorName: "Host", text: "가져온 하이라이트", authorMatched: true, membershipId: "membership-host" }],
    oneLineReviews: [{ authorName: "Host", text: "가져온 한줄평", authorMatched: true, membershipId: "membership-host" }],
    feedbackDocument: { fileName: "feedback.md", title: "Feedback", valid: true },
    issues: [],
  };
  const previewSessionImport = vi.fn(async () => preview);

  render(<HostSessionEditorForTest session={session} actions={{ ...hostSessionEditorTestActions, previewSessionImport }} />);

  await user.upload(
    screen.getByLabelText("AI 결과 JSON 파일"),
    new File([JSON.stringify({ format: "readmates-session-import:v1" })], "import.json", { type: "application/json" }),
  );

  expect(previewSessionImport).toHaveBeenCalledWith(session.sessionId, {
    recordVisibility: session.visibility,
    format: "readmates-session-import:v1",
  });
  expect(await screen.findByText("가져온 요약입니다.")).toBeVisible();
  expect(screen.getByText("가져온 하이라이트")).toBeVisible();
  expect(screen.getByRole("button", { name: "전체 교체 저장" })).toBeEnabled();
});

it("commits a valid session import and refreshes status rows", async () => {
  const user = userEvent.setup();
  const preview: SessionImportPreviewResponse = {
    valid: true,
    session: { sessionNumber: 1, bookTitle: "Example Book", meetingDate: "2026-05-14" },
    publication: { summary: "가져온 요약입니다." },
    highlights: [],
    oneLineReviews: [],
    feedbackDocument: { fileName: "feedback.md", title: "Feedback", valid: true },
    issues: [],
  };
  const commit: SessionImportCommitResponse = {
    sessionId: session.sessionId,
    publication: { summary: "가져온 요약입니다." },
    highlights: [],
    oneLineReviews: [],
    feedbackDocument: { uploaded: true, fileName: "feedback.md", title: "Feedback", uploadedAt: "2026-05-15T00:00:00Z" },
  };
  const previewSessionImport = vi.fn(async () => preview);
  const commitSessionImport = vi.fn(
    async () => new Response(JSON.stringify(commit), { status: 200 }) as JsonResponse<SessionImportCommitResponse>,
  );

  render(
    <HostSessionEditorForTest
      session={session}
      actions={{ ...hostSessionEditorTestActions, previewSessionImport, commitSessionImport }}
    />,
  );

  await user.upload(
    screen.getByLabelText("AI 결과 JSON 파일"),
    new File([JSON.stringify({ format: "readmates-session-import:v1" })], "import.json", { type: "application/json" }),
  );
  await user.click(await screen.findByRole("button", { name: "전체 교체 저장" }));

  expect(commitSessionImport).toHaveBeenCalledWith(session.sessionId, {
    recordVisibility: session.visibility,
    format: "readmates-session-import:v1",
  });
  expect(await screen.findByRole("status")).toHaveTextContent("AI 결과 JSON을 세션 기록으로 저장했습니다.");
  expect(screen.getByText("문서 등록")).toBeVisible();
  expect(screen.getByText("feedback.md")).toBeVisible();
});
```

- [ ] **Step 2: Run UI tests to verify they fail**

Run:

```bash
pnpm --dir front test front/tests/unit/host-session-editor.test.tsx
```

Expected: FAIL because the import panel is not rendered.

- [ ] **Step 3: Create import panel component**

Create `front/features/host/ui/session-editor/session-import-panel.tsx`:

```tsx
import type { ChangeEvent, CSSProperties } from "react";
import type { SessionImportPreviewResponse, SessionRecordVisibility } from "@/features/host/api/host-contracts";
import { canCommitSessionImport, getSessionImportBlockingIssues } from "@/features/host/model/session-import-model";
import type { MobileEditorSection } from "./mobile-editor-tabs";
import { Panel } from "./session-editor-panel";

type SessionImportPanelProps = {
  activeMobileSection: MobileEditorSection;
  recordVisibility: SessionRecordVisibility;
  preview: SessionImportPreviewResponse | null;
  inFlight: boolean;
  commitInFlight: boolean;
  error: string | null;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onCommit: () => void;
};

export function SessionImportPanel({
  activeMobileSection,
  recordVisibility,
  preview,
  inFlight,
  commitInFlight,
  error,
  onFileChange,
  onCommit,
}: SessionImportPanelProps) {
  const issues = recordVisibility === "HOST_ONLY"
    ? ["멤버 공개 또는 외부 공개를 선택한 뒤 저장할 수 있습니다."]
    : getSessionImportBlockingIssues(preview);
  const canCommit = canCommitSessionImport(preview, recordVisibility) && !commitInFlight;

  return (
    <Panel
      eyebrow="AI 결과 가져오기"
      title="세션 기록 JSON import"
      mobileSection="report"
      panelId="host-editor-panel-session-import"
      activeMobileSection={activeMobileSection}
    >
      <div className="stack" style={{ "--stack": "14px" } as CSSProperties}>
        <label className="btn btn-secondary btn-sm" htmlFor="session-import-json-file">
          AI 결과 JSON 가져오기
        </label>
        <input
          id="session-import-json-file"
          className="rm-sr-only"
          type="file"
          accept=".json,application/json"
          aria-label="AI 결과 JSON 파일"
          onChange={onFileChange}
        />
        {inFlight ? <p className="small">파일을 확인하는 중입니다.</p> : null}
        {error ? <p className="marginalia" role="alert">{error}</p> : null}
        {preview ? (
          <div className="surface-quiet" style={{ padding: 16 }}>
            <div className="eyebrow">미리보기</div>
            <p className="body editorial" style={{ margin: "8px 0 0" }}>
              {preview.publication.summary}
            </p>
            <div className="tiny" style={{ marginTop: 10, color: "var(--text-3)" }}>
              하이라이트 {preview.highlights.length}개 · 한줄평 {preview.oneLineReviews.length}개 · 피드백 문서{" "}
              {preview.feedbackDocument.valid ? "통과" : "확인 필요"}
            </div>
            {issues.length > 0 ? (
              <ul className="small" style={{ margin: "12px 0 0", color: "var(--danger)" }}>
                {issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : (
              <p className="small" style={{ margin: "12px 0 0", color: "var(--accent)" }}>
                기존 요약, 하이라이트, 한줄평, 피드백 문서를 전체 교체합니다.
              </p>
            )}
            <button type="button" className="btn btn-primary btn-sm" disabled={!canCommit} onClick={onCommit} style={{ marginTop: 14 }}>
              {commitInFlight ? "저장하는 중" : "전체 교체 저장"}
            </button>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
```

- [ ] **Step 4: Include the import panel in the mobile report tab**

In `front/features/host/ui/session-editor/mobile-editor-tabs.tsx`, change the report section:

```ts
{
  key: "report",
  label: "문서",
  tabId: "host-editor-tab-report",
  panelIds: ["host-editor-panel-session-import", "host-editor-panel-report"],
},
```

- [ ] **Step 5: Wire state and callbacks in the host session editor**

In `front/features/host/ui/host-session-editor.tsx`, add imports:

```ts
import { SessionImportPanel } from "./session-editor/session-import-panel";
import {
  buildSessionImportRequest,
  parseSessionImportFileText,
  sessionImportFeedbackFromCommit,
  sessionImportPublicationFromCommit,
} from "@/features/host/model/session-import-model";
import type { SessionImportFileRequest, SessionImportPreviewResponse } from "@/features/host/api/host-contracts";
```

Add transient state near the existing transient UI state:

```ts
const [sessionImportFile, setSessionImportFile] = useState<Partial<SessionImportFileRequest> | null>(null);
const [sessionImportPreview, setSessionImportPreview] = useState<SessionImportPreviewResponse | null>(null);
const [sessionImportError, setSessionImportError] = useState<string | null>(null);
const [sessionImportInFlight, setSessionImportInFlight] = useState(false);
const [sessionImportCommitInFlight, setSessionImportCommitInFlight] = useState(false);
```

Update `onRecordVisibilityChange` so stale previews are cleared when the selected visibility changes:

```ts
const onRecordVisibilityChange = useCallback((visibility: typeof recordVisibility) => {
  dispatch({ type: "SET_RECORD_VISIBILITY", visibility });
  setSessionImportFile(null);
  setSessionImportPreview(null);
  setSessionImportError(null);
}, []);
```

Add handlers after `flash` is defined:

```ts
const handleSessionImportFileChange = useCallback(
  async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file || !session) {
      return;
    }

    setSessionImportError(null);
    setSessionImportPreview(null);
    setSessionImportFile(null);
    const parsed = parseSessionImportFileText(await file.text());
    if ("error" in parsed) {
      setSessionImportError(parsed.error);
      return;
    }

    const request = buildSessionImportRequest(parsed, recordVisibility);
    setSessionImportInFlight(true);
    try {
      const preview = await actions.previewSessionImport(session.sessionId, request);
      setSessionImportFile(parsed);
      setSessionImportPreview(preview);
    } catch {
      setSessionImportError("AI 결과 JSON을 확인하지 못했습니다.");
    } finally {
      setSessionImportInFlight(false);
    }
  },
  [actions, recordVisibility, session],
);

const handleCommitSessionImport = useCallback(async () => {
  if (!session || !sessionImportFile) {
    return;
  }
  const request = buildSessionImportRequest(sessionImportFile, recordVisibility);
  setSessionImportCommitInFlight(true);
  try {
    const response = await actions.commitSessionImport(session.sessionId, request);
    if (!response.ok) {
      setSessionImportError("AI 결과 JSON 저장에 실패했습니다.");
      return;
    }
    const committed = await response.json();
    dispatch({
      type: "PUBLICATION_SAVED",
      publicSummary: sessionImportPublicationFromCommit(committed, recordVisibility).publicSummary,
      visibility: recordVisibility,
    });
    dispatch({
      type: "FEEDBACK_DOCUMENT_UPDATED",
      feedbackDocument: sessionImportFeedbackFromCommit(committed),
    });
    flash("AI 결과 JSON을 세션 기록으로 저장했습니다.");
  } catch {
    setSessionImportError("AI 결과 JSON 저장에 실패했습니다.");
  } finally {
    setSessionImportCommitInFlight(false);
  }
}, [actions, flash, recordVisibility, session, sessionImportFile]);
```

Render the panel before the existing feedback document panel:

```tsx
<SessionImportPanel
  activeMobileSection={activeMobileSection}
  recordVisibility={recordVisibility}
  preview={sessionImportPreview}
  inFlight={sessionImportInFlight}
  commitInFlight={sessionImportCommitInFlight}
  error={sessionImportError}
  onFileChange={handleSessionImportFileChange}
  onCommit={handleCommitSessionImport}
/>
```

- [ ] **Step 6: Run UI tests**

Run:

```bash
pnpm --dir front test front/tests/unit/host-session-editor.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Run focused frontend tests**

Run:

```bash
pnpm --dir front test front/tests/unit/host-session-editor.test.tsx front/features/host/model/session-import-model.test.ts front/tests/unit/host-contract-zod.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add front/features/host/ui/session-editor/session-import-panel.tsx front/features/host/ui/session-editor/mobile-editor-tabs.tsx front/features/host/ui/host-session-editor.tsx front/tests/unit/host-session-editor.test.tsx
git commit -m "feat: add host session import preview UI"
```

## Task 5: Local Generator Guide And Sanitized Fixture

**Files:**

- Create: `docs/development/session-import-generator.md`
- Create: `docs/development/fixtures/session-import-example.json`
- Modify: `docs/development/README.md`

- [ ] **Step 1: Write the generator guide**

Create `docs/development/session-import-generator.md`:

````markdown
# Session Import JSON Generator

This guide describes the local workflow for turning a voice transcript into a `readmates-session-import:v1` JSON file.

The production app does not call an LLM for this workflow. Generate the JSON locally, inspect it, then import it from the host session editor.

## Inputs

- Transcript text file
- Session number
- Book title and author
- Meeting date
- Attendee display names exactly as they appear in ReadMates
- Name mode: real names for private operations, aliases for demo or public fixtures

## Output

One UTF-8 JSON file. The file does not include `recordVisibility`; the host editor supplies that value from the current selection.

```json
{
  "format": "readmates-session-import:v1",
  "session": {
    "number": 1,
    "bookTitle": "Example Book",
    "meetingDate": "2026-05-14"
  },
  "publication": {
    "summary": "Example Book 모임에서는 문장이 삶에서 자기 언어가 되는 과정을 이야기했습니다."
  },
  "highlights": [
    {
      "authorName": "Host",
      "text": "권위 있는 이름이 문장의 무게를 바꾸는 이유를 함께 살폈다."
    }
  ],
  "oneLineReviews": [
    {
      "authorName": "Host",
      "text": "어떤 말이 내 삶에서 진짜가 되는지 묻게 됐다."
    }
  ],
  "feedbackDocument": {
    "fileName": "session-1-feedback.md",
    "markdown": "<!-- readmates-feedback:v1 -->\n\n# 독서모임 1차 피드백\n\nExample Book · 2026.05.14\n\n## 메타\n\n- 일시: 2026.05.14 (목) · 20:00\n- 소요시간: 2시간\n- 책: Example Book · Example Author\n- 참여자: Host\n\n## 관찰자 노트\n\n참여자는 책의 핵심 질문을 자신의 경험과 연결했다.\n\n## 참여자별 피드백\n\n### 01. Host\n\n역할: 진행자\n\n#### 참여 스타일\n\n질문을 정리하고 대화를 안정적으로 이끌었다.\n\n#### 실질 기여\n\n- 핵심 논점을 공적 기록의 언어로 정리했다.\n\n#### 문제점과 자기모순\n\n##### 1. 질문 범위가 넓었다\n\n- 핵심: 여러 주제를 빠르게 연결했다.\n- 근거: 한 질문에서 많은 사례를 함께 다뤘다.\n- 해석: 다음에는 질문의 범위를 먼저 좁히면 좋다.\n\n#### 실천 과제\n\n1. 질문을 시작하기 전에 논점의 범위를 정한다.\n\n#### 드러난 한 문장\n\n> 어떤 말은 삶을 통과해야 내 것이 된다.\n\n맥락: 회차를 정리하던 장면\n\n주석: 이번 회차의 중심 문제를 압축한다.\n"
  }
}
```

## Prompt Template

Use this prompt with the transcript content attached or pasted below it.

```text
You are generating a ReadMates session import JSON file.

Return only valid JSON. Do not wrap it in Markdown.

Format:
- format must be "readmates-session-import:v1"
- session.number must be the provided session number
- session.bookTitle must be the provided book title
- session.meetingDate must be YYYY-MM-DD
- publication.summary must be public-safe and 1-3 Korean sentences
- highlights must contain 3-5 public-safe items
- oneLineReviews must contain one item per listed attendee
- feedbackDocument.markdown must follow the readmates-feedback:v1 Markdown template
- do not include recordVisibility in the generated file

Safety:
- Do not invent facts not supported by the transcript.
- Do not include local file paths, emails, tokens, secrets, private domains, or operational details.
- Keep publication.summary and highlights suitable for public/member record views.
- Keep feedbackDocument more detailed, but still avoid sensitive private claims.
- Use attendee names exactly as provided.

Session:
- Number: 1
- Book title: Example Book
- Book author: Example Author
- Meeting date: 2026-05-14
- Attendees: Host, Member
- Name mode: aliases

Transcript:
Paste the transcript text below this line before generating.
```

## Validation Checklist

- The JSON parses.
- `format` is `readmates-session-import:v1`.
- Every `authorName` matches a session attendee in ReadMates.
- `feedbackDocument.markdown` starts with `<!-- readmates-feedback:v1 -->`.
- The feedback Markdown has `## 메타`, `## 관찰자 노트`, and `## 참여자별 피드백`.
- Public sections contain no local paths, emails, secrets, private domains, or real private deployment details.
````

- [ ] **Step 2: Add a sanitized fixture**

Run:

```bash
mkdir -p docs/development/fixtures
```

Expected: directory exists at `docs/development/fixtures`.

Create `docs/development/fixtures/session-import-example.json`:

```json
{
  "format": "readmates-session-import:v1",
  "session": {
    "number": 1,
    "bookTitle": "Example Book",
    "meetingDate": "2026-05-14"
  },
  "publication": {
    "summary": "Example Book 모임에서는 문장이 삶에서 자기 언어가 되는 과정을 이야기했습니다."
  },
  "highlights": [
    {
      "authorName": "Host",
      "text": "권위 있는 이름이 문장의 무게를 바꾸는 이유를 함께 살폈다."
    }
  ],
  "oneLineReviews": [
    {
      "authorName": "Host",
      "text": "어떤 말이 내 삶에서 진짜가 되는지 묻게 됐다."
    }
  ],
  "feedbackDocument": {
    "fileName": "session-1-feedback.md",
    "markdown": "<!-- readmates-feedback:v1 -->\n\n# 독서모임 1차 피드백\n\nExample Book · 2026.05.14\n\n## 메타\n\n- 일시: 2026.05.14 (목) · 20:00\n- 소요시간: 2시간\n- 책: Example Book · Example Author\n- 참여자: Host\n\n## 관찰자 노트\n\n참여자는 책의 핵심 질문을 자신의 경험과 연결했다.\n\n## 참여자별 피드백\n\n### 01. Host\n\n역할: 진행자\n\n#### 참여 스타일\n\n질문을 정리하고 대화를 안정적으로 이끌었다.\n\n#### 실질 기여\n\n- 핵심 논점을 공적 기록의 언어로 정리했다.\n\n#### 문제점과 자기모순\n\n##### 1. 질문 범위가 넓었다\n\n- 핵심: 여러 주제를 빠르게 연결했다.\n- 근거: 한 질문에서 많은 사례를 함께 다뤘다.\n- 해석: 다음에는 질문의 범위를 먼저 좁히면 좋다.\n\n#### 실천 과제\n\n1. 질문을 시작하기 전에 논점의 범위를 정한다.\n\n#### 드러난 한 문장\n\n> 어떤 말은 삶을 통과해야 내 것이 된다.\n\n맥락: 회차를 정리하던 장면\n\n주석: 이번 회차의 중심 문제를 압축한다.\n"
  }
}
```

- [ ] **Step 3: Link the guide from the development docs index**

Open `docs/development/README.md`. If it has a list of development guides, add:

```markdown
- [Session Import JSON Generator](session-import-generator.md): local transcript-to-import JSON workflow for host session records.
```

If the README has no suitable list, add:

```markdown
## Utilities

- [Session Import JSON Generator](session-import-generator.md): local transcript-to-import JSON workflow for host session records.
```

- [ ] **Step 4: Run docs checks**

Run:

```bash
git diff --check -- docs/development/session-import-generator.md docs/development/fixtures/session-import-example.json docs/development/README.md
SAFETY_PATTERN='TB''D|TO''DO|/U''sers/|140[.]245|oci''d|(^|[^A-Za-z0-9])s''k-[A-Za-z0-9]|AI''za|github''_pat|SPRING''_DATASOURCE_PASSWORD|READMATES''_BFF_SECRET'
rg -n "$SAFETY_PATTERN" docs/development/session-import-generator.md docs/development/fixtures/session-import-example.json docs/development/README.md
```

Expected:

- `git diff --check` exits 0.
- `rg` exits 1 because it finds no forbidden patterns.

- [ ] **Step 5: Commit Task 5**

```bash
git add docs/development/session-import-generator.md docs/development/fixtures/session-import-example.json docs/development/README.md
git commit -m "docs: add session import generator guide"
```

## Task 6: Full Verification And Release Readiness

**Files:**

- Verify all touched files from Tasks 1-5.

- [ ] **Step 1: Run focused backend import suite**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.sessionimport.api.HostSessionImportControllerDbTest
```

Expected: PASS.

- [ ] **Step 2: Run full backend test suite**

Run:

```bash
./server/gradlew -p server clean test
```

Expected: PASS.

- [ ] **Step 3: Run focused frontend tests**

Run:

```bash
pnpm --dir front test front/features/host/model/session-import-model.test.ts front/tests/unit/host-session-editor.test.tsx front/tests/unit/host-contract-zod.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run frontend quality checks**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected: all commands PASS.

- [ ] **Step 5: Run changed-doc checks**

Run:

```bash
git diff --check -- docs/development/session-import-generator.md docs/development/fixtures/session-import-example.json docs/development/README.md docs/superpowers/plans/2026-05-15-readmates-session-import-json.md
```

Expected: PASS.

- [ ] **Step 6: Review public safety and final diff**

Run:

```bash
SAFETY_PATTERN='TB''D|TO''DO|/U''sers/|140[.]245|oci''d|(^|[^A-Za-z0-9])s''k-[A-Za-z0-9]|AI''za|github''_pat|SPRING''_DATASOURCE_PASSWORD|READMATES''_BFF_SECRET'
rg -n "$SAFETY_PATTERN" server/src/main/kotlin/com/readmates/sessionimport server/src/test/kotlin/com/readmates/sessionimport front/features/host docs/development docs/superpowers/plans/2026-05-15-readmates-session-import-json.md
git diff --stat HEAD
```

Expected:

- `rg` exits 1 because it finds no forbidden patterns.
- `git diff --stat HEAD` shows only the intended server, frontend, docs, and test files.

- [ ] **Step 7: Commit small verification fixes when needed**

If verification creates small code or docs fixes, commit them with the relevant task scope. If verification creates no changes, do not create an empty commit.

## Self-Review

Spec coverage:

- Single generated JSON file: Task 5.
- Host editor import UI: Task 4.
- Preview before commit: Tasks 1 and 4.
- Full replacement commit: Task 2.
- Current editor selected visibility: Tasks 1, 2, 3, and 4.
- Exact `authorName` matching: Task 1.
- Local transcript-to-JSON generation method: Task 5.
- Feedback document parsing and storage: Tasks 1 and 2.
- Public safety: Tasks 5 and 6.

Placeholder scan:

- The plan uses concrete file paths, endpoint paths, commands, and expected outputs.
- The generator example contains a complete minimal feedback Markdown string, not an abbreviated placeholder.
- Safety scan patterns are split inside shell strings so the plan does not match its own forbidden-pattern checks.

Type consistency:

- Server API names use `SessionImportRequest`, `SessionImportPreviewResult`, and `SessionImportCommitResult`.
- Frontend API names use `SessionImportFileRequest`, `SessionImportRequest`, `SessionImportPreviewResponse`, and `SessionImportCommitResponse`.
- Endpoint paths match the spec: `/api/host/sessions/{sessionId}/session-import/preview` and `/api/host/sessions/{sessionId}/session-import/commit`.
