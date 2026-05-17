package com.readmates.sessionimport.api

import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post

private const val CLUB_ID = "00000000-0000-0000-0000-000000079500"
private const val SESSION_ID = "00000000-0000-0000-0000-000000079501"
private const val HOST_USER_ID = "00000000-0000-0000-0000-000000079511"
private const val MEMBER_USER_ID = "00000000-0000-0000-0000-000000079512"
private const val HOST_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000079521"
private const val MEMBER_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000079522"

private const val CLEANUP_SQL = """
delete from notification_event_outbox where aggregate_id = '$SESSION_ID';
delete from session_feedback_documents where session_id = '$SESSION_ID';
delete from public_session_publications where session_id = '$SESSION_ID';
delete from highlights where session_id = '$SESSION_ID';
delete from one_line_reviews where session_id = '$SESSION_ID';
delete from session_participants where session_id = '$SESSION_ID';
delete from sessions where id = '$SESSION_ID';
delete from memberships where id in ('$HOST_MEMBERSHIP_ID', '$MEMBER_MEMBERSHIP_ID');
delete from users where id in ('$HOST_USER_ID', '$MEMBER_USER_ID');
delete from clubs where id = '$CLUB_ID';
"""

private const val INSERT_FIXTURE_SQL = """
insert into clubs (id, slug, name, tagline, about)
values (
  '$CLUB_ID',
  'session-import-test-club',
  'Session Import Test Club',
  'Import fixture isolation',
  'Synthetic club for session import integration tests.'
);
insert into users (id, email, name, short_name, auth_provider)
values
  ('$HOST_USER_ID', 'session-import-host@example.test', 'Import Host', 'Host', 'PASSWORD'),
  ('$MEMBER_USER_ID', 'session-import-member@example.test', 'Import Member', 'Member', 'PASSWORD');
insert into memberships (id, club_id, user_id, role, status, short_name, joined_at)
values
  ('$HOST_MEMBERSHIP_ID', '$CLUB_ID', '$HOST_USER_ID', 'HOST', 'ACTIVE', 'Host', '2026-05-01 00:00:00.000000'),
  ('$MEMBER_MEMBERSHIP_ID', '$CLUB_ID', '$MEMBER_USER_ID', 'MEMBER', 'ACTIVE', 'Member', '2026-05-01 00:00:00.000000');
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
  ('00000000-0000-0000-0000-000000079552', '$CLUB_ID', '$SESSION_ID', '$MEMBER_MEMBERSHIP_ID', 'Existing highlight 2.', 1);
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
                with(user("session-import-host@example.test"))
                contentType = MediaType.APPLICATION_JSON
                content = validImportJson(recordVisibility = "MEMBER")
            }.andExpect {
                status { isOk() }
                jsonPath("$.valid") { value(true) }
                jsonPath("$.session.sessionNumber") { value(7951) }
                jsonPath("$.publication.summary") { value("Import summary.") }
                jsonPath("$.highlights.length()") { value(2) }
                jsonPath("$.oneLineReviews.length()") { value(2) }
                jsonPath("$.feedbackDocument.title") { value("독서모임 7951차 피드백") }
                jsonPath("$.issues.length()") { value(0) }
            }
    }

    @Test
    fun `preview reports session mismatch without writing`() {
        mockMvc
            .post("/api/host/sessions/$SESSION_ID/session-import/preview") {
                with(user("session-import-host@example.test"))
                contentType = MediaType.APPLICATION_JSON
                content = validImportJson(sessionNumber = 7952, recordVisibility = "MEMBER")
            }.andExpect {
                status { isOk() }
                jsonPath("$.valid") { value(false) }
                jsonPath("$.issues[0].code") { value("SESSION_NUMBER_MISMATCH") }
            }

        val summary =
            jdbcTemplate.queryForObject(
                "select public_summary from public_session_publications where session_id = '$SESSION_ID'",
                String::class.java,
            )
        assertEquals("Existing summary.", summary)
    }

    @Test
    fun `preview rejects non host member`() {
        mockMvc
            .post("/api/host/sessions/$SESSION_ID/session-import/preview") {
                with(user("session-import-member@example.test"))
                contentType = MediaType.APPLICATION_JSON
                content = validImportJson(recordVisibility = "MEMBER")
            }.andExpect {
                status { isForbidden() }
            }
    }

    @Test
    fun `host commits session import and replaces existing records`() {
        mockMvc
            .post("/api/host/sessions/$SESSION_ID/session-import/commit") {
                with(user("session-import-host@example.test"))
                contentType = MediaType.APPLICATION_JSON
                content = validImportJson(recordVisibility = "PUBLIC")
            }.andExpect {
                status { isOk() }
                jsonPath("$.sessionId") { value(SESSION_ID) }
                jsonPath("$.publication.summary") { value("Import summary.") }
                jsonPath("$.highlights.length()") { value(2) }
                jsonPath("$.oneLineReviews.length()") { value(2) }
                jsonPath("$.feedbackDocument.uploaded") { value(true) }
                jsonPath("$.feedbackDocument.title") { value("독서모임 7951차 피드백") }
            }

        assertCommittedImportRecords()
        assertFeedbackDocumentNotificationEvent()
    }

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

    private fun assertCommittedImportRecords() {
        assertEquals(
            "Import summary.",
            scalar("select public_summary from public_session_publications where session_id = '$SESSION_ID'"),
        )
        assertEquals(
            "PUBLIC",
            scalar("select visibility from public_session_publications where session_id = '$SESSION_ID'"),
        )
        assertEquals(2, countRows("highlights"))
        assertEquals(2, countRows("one_line_reviews"))
        assertEquals(
            "PUBLIC",
            scalar(
                """
                select visibility
                from one_line_reviews
                where session_id = '$SESSION_ID'
                  and membership_id = '$HOST_MEMBERSHIP_ID'
                """.trimIndent(),
            ),
        )
        assertEquals(
            "Import highlight from host.",
            scalar(
                """
                select text
                from highlights
                where session_id = '$SESSION_ID'
                order by sort_order
                limit 1
                """.trimIndent(),
            ),
        )
        assertEquals(
            "독서모임 7951차 피드백",
            scalar(
                """
                select document_title
                from session_feedback_documents
                where session_id = '$SESSION_ID'
                order by version desc
                limit 1
                """.trimIndent(),
            ),
        )
    }

    @Test
    fun `commit rejects host only visibility without writing`() {
        mockMvc
            .post("/api/host/sessions/$SESSION_ID/session-import/commit") {
                with(user("session-import-host@example.test"))
                contentType = MediaType.APPLICATION_JSON
                content = validImportJson(recordVisibility = "HOST_ONLY")
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("INVALID_SESSION_IMPORT") }
            }

        assertEquals(
            "Existing summary.",
            scalar("select public_summary from public_session_publications where session_id = '$SESSION_ID'"),
        )
        assertEquals(1, countRows("session_feedback_documents"))
    }

    private fun countRows(tableName: String): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from $tableName where club_id = '$CLUB_ID' and session_id = '$SESSION_ID'",
            Int::class.java,
        ) ?: 0

    private fun scalar(sql: String): String? = jdbcTemplate.queryForObject(sql, String::class.java)
}

private fun validImportJson(
    sessionNumber: Int = 7951,
    recordVisibility: String = "MEMBER",
): String {
    val markdown = importFeedbackMarkdown().jsonString()
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
            "markdown": $markdown
          }
        }
        """.trimIndent()
}

@Suppress("LongMethod")
private fun importFeedbackMarkdown() =
    """
    <!-- readmates-feedback:v1 -->

    # 독서모임 7951차 피드백

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

private fun String.jsonString(): String =
    buildString {
        append('"')
        for (character in this@jsonString) {
            when (character) {
                '\\' -> append("\\\\")
                '"' -> append("\\\"")
                '\n' -> append("\\n")
                '\r' -> append("\\r")
                '\t' -> append("\\t")
                else -> append(character)
            }
        }
        append('"')
    }
