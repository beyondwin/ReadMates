package com.readmates.feedback.api

import com.readmates.support.MySqlTestContainer
import org.hamcrest.Matchers.hasItem
import org.hamcrest.Matchers.not
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.mock.web.MockMultipartFile
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.multipart
import java.nio.charset.StandardCharsets

private const val CLEANUP_SESSION_SIX_TEST_UPLOAD_SQL = """
    delete from notification_outbox
    where club_id = '00000000-0000-0000-0000-000000000001'
      and event_type = 'FEEDBACK_DOCUMENT_PUBLISHED'
      and aggregate_id = '00000000-0000-0000-0000-000000000306';
    delete from session_feedback_documents
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id = '00000000-0000-0000-0000-000000000306'
      and (version > 1 or file_name = 'feedback-6-test.md');
"""

private const val MARK_MEMBER5_SESSION_ONE_REMOVED_SQL = """
    update session_participants
    join memberships on memberships.id = session_participants.membership_id
      and memberships.club_id = session_participants.club_id
    join users on users.id = memberships.user_id
    set session_participants.participation_status = 'REMOVED',
        session_participants.attendance_status = 'ATTENDED'
    where session_participants.club_id = '00000000-0000-0000-0000-000000000001'
      and session_participants.session_id = '00000000-0000-0000-0000-000000000301'
      and users.email = 'member5@example.com';
"""

private const val RESET_MEMBER5_SESSION_ONE_ACTIVE_SQL = """
    update session_participants
    join memberships on memberships.id = session_participants.membership_id
      and memberships.club_id = session_participants.club_id
    join users on users.id = memberships.user_id
    set session_participants.participation_status = 'ACTIVE',
        session_participants.attendance_status = 'ATTENDED'
    where session_participants.club_id = '00000000-0000-0000-0000-000000000001'
      and session_participants.session_id = '00000000-0000-0000-0000-000000000301'
      and users.email = 'member5@example.com';
"""

private const val MARK_MEMBER5_SUSPENDED_SQL = """
    update memberships
    join users on users.id = memberships.user_id
    set memberships.status = 'SUSPENDED'
    where memberships.club_id = '00000000-0000-0000-0000-000000000001'
      and users.email = 'member5@example.com';
"""

private const val RESET_MEMBER5_ACTIVE_SQL = """
    update memberships
    join users on users.id = memberships.user_id
    set memberships.status = 'ACTIVE'
    where memberships.club_id = '00000000-0000-0000-0000-000000000001'
      and users.email = 'member5@example.com';
"""

private const val MARK_SESSION_ONE_OPEN_SQL = """
    update sessions
    set state = 'OPEN'
    where club_id = '00000000-0000-0000-0000-000000000001'
      and id = '00000000-0000-0000-0000-000000000301';
"""

private const val MARK_SESSION_ONE_CLOSED_SQL = """
    update sessions
    set state = 'CLOSED'
    where club_id = '00000000-0000-0000-0000-000000000001'
      and id = '00000000-0000-0000-0000-000000000301';
"""

private const val RESET_SESSION_ONE_PUBLISHED_SQL = """
    update sessions
    set state = 'PUBLISHED'
    where club_id = '00000000-0000-0000-0000-000000000001'
      and id = '00000000-0000-0000-0000-000000000301';
"""

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@AutoConfigureMockMvc
@Sql(
    statements = [
        CLEANUP_SESSION_SIX_TEST_UPLOAD_SQL,
    ],
    executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
)
@Sql(
    statements = [
        CLEANUP_SESSION_SIX_TEST_UPLOAD_SQL,
    ],
    executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
)
class FeedbackDocumentControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) {
    @Test
    fun `attended member can list seeded session feedback document`() {
        mockMvc.get("/api/feedback-documents/me") {
            with(user("member5@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$[?(@.sessionNumber == 1)].sessionNumber") { value(hasItem(1)) }
            jsonPath("$[?(@.sessionNumber == 1)].bookTitle") { value(hasItem("팩트풀니스")) }
            jsonPath("$[?(@.sessionNumber == 1)].fileName") { value(hasItem("251126 1차.md")) }
        }
    }

    @Test
    fun `non attending member does not see session feedback document in list`() {
        mockMvc.get("/api/feedback-documents/me") {
            with(user("member2@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$[*].sessionNumber") { value(not(hasItem(1))) }
        }
    }

    @Test
    @Sql(
        statements = [
            MARK_SESSION_ONE_OPEN_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            RESET_SESSION_ONE_PUBLISHED_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `open session feedback document is not listed or directly readable`() {
        mockMvc.get("/api/feedback-documents/me") {
            with(user("member5@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$[*].sessionNumber") { value(not(hasItem(1))) }
        }

        mockMvc.get("/api/feedback-documents/me") {
            with(user("host@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$[*].sessionNumber") { value(not(hasItem(1))) }
        }

        mockMvc.get("/api/sessions/00000000-0000-0000-0000-000000000301/feedback-document") {
            with(user("member5@example.com"))
        }.andExpect {
            status { isNotFound() }
        }

        mockMvc.get("/api/sessions/00000000-0000-0000-0000-000000000301/feedback-document") {
            with(user("host@example.com"))
        }.andExpect {
            status { isNotFound() }
        }
    }

    @Test
    @Sql(
        statements = [
            MARK_SESSION_ONE_CLOSED_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            RESET_SESSION_ONE_PUBLISHED_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `closed session feedback document remains listed and directly readable`() {
        mockMvc.get("/api/feedback-documents/me") {
            with(user("member5@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$[?(@.sessionNumber == 1)].fileName") { value(hasItem("251126 1차.md")) }
        }

        mockMvc.get("/api/sessions/00000000-0000-0000-0000-000000000301/feedback-document") {
            with(user("member5@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.sessionNumber") { value(1) }
            jsonPath("$.fileName") { value("251126 1차.md") }
        }
    }

    @Test
    @Sql(
        statements = [
            MARK_MEMBER5_SESSION_ONE_REMOVED_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            RESET_MEMBER5_SESSION_ONE_ACTIVE_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `removed attended member cannot list or read feedback document`() {
        mockMvc.get("/api/feedback-documents/me") {
            with(user("member5@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$[*].sessionNumber") { value(not(hasItem(1))) }
        }

        mockMvc.get("/api/sessions/00000000-0000-0000-0000-000000000301/feedback-document") {
            with(user("member5@example.com"))
        }.andExpect {
            status { isForbidden() }
        }
    }

    @Test
    @Sql(
        statements = [
            MARK_MEMBER5_SUSPENDED_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            RESET_MEMBER5_ACTIVE_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `suspended attended member cannot list or read feedback document`() {
        mockMvc.get("/api/feedback-documents/me") {
            with(user("member5@example.com"))
        }.andExpect {
            status { isForbidden() }
        }

        mockMvc.get("/api/sessions/00000000-0000-0000-0000-000000000301/feedback-document") {
            with(user("member5@example.com"))
        }.andExpect {
            status { isForbidden() }
        }
    }

    @Test
    fun `attended member can read parsed session feedback document`() {
        mockMvc.get("/api/sessions/00000000-0000-0000-0000-000000000301/feedback-document") {
            with(user("member5@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.sessionId") { value("00000000-0000-0000-0000-000000000301") }
            jsonPath("$.sessionNumber") { value(1) }
            jsonPath("$.title") { value("독서모임 1차 피드백") }
            jsonPath("$.subtitle") { value("팩트풀니스 · 2025.11.26") }
            jsonPath("$.bookTitle") { value("팩트풀니스") }
            jsonPath("$.date") { value("2025-11-26") }
            jsonPath("$.fileName") { value("251126 1차.md") }
            jsonPath("$.uploadedAt") { exists() }
            jsonPath("$.metadata[0].label") { value("일시") }
            jsonPath("$.metadata[0].value") { value("2025.11.26 (수) · 19:42") }
            jsonPath("$.observerNotes.length()") { value(4) }
            jsonPath("$.participants.length()") { value(3) }
            jsonPath("$.participants[0].number") { value(1) }
            jsonPath("$.participants[0].name") { value("이멤버5") }
            jsonPath("$.participants[0].role") { value("책의 프레임을 숫자, 조직, 기술 사례로 번역하는 해설자") }
            jsonPath("$.participants[0].style[0]") { exists() }
            jsonPath("$.participants[0].contributions[0]") { exists() }
            jsonPath("$.participants[0].problems[0].title") { value("프레임 비판 뒤 대안이 추상적으로 남았다") }
            jsonPath("$.participants[0].problems[0].core") { exists() }
            jsonPath("$.participants[0].problems[0].evidence") { exists() }
            jsonPath("$.participants[0].problems[0].interpretation") { exists() }
            jsonPath("$.participants[0].actionItems[0]") { exists() }
            jsonPath("$.participants[0].revealingQuote.quote") { exists() }
            jsonPath("$.participants[0].revealingQuote.context") { exists() }
            jsonPath("$.participants[0].revealingQuote.note") { exists() }
        }
    }

    @Test
    fun `host can read seeded session feedback document`() {
        mockMvc.get("/api/sessions/00000000-0000-0000-0000-000000000301/feedback-document") {
            with(user("host@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.title") { value("독서모임 1차 피드백") }
            jsonPath("$.fileName") { value("251126 1차.md") }
        }
    }

    @Test
    fun `non attending member cannot read session feedback document`() {
        mockMvc.get("/api/sessions/00000000-0000-0000-0000-000000000301/feedback-document") {
            with(user("member2@example.com"))
        }.andExpect {
            status { isForbidden() }
        }
    }

    @Test
    fun `host status endpoint reports seeded feedback document`() {
        mockMvc.get("/api/host/sessions/00000000-0000-0000-0000-000000000301/feedback-document") {
            with(user("host@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.uploaded") { value(true) }
            jsonPath("$.fileName") { value("251126 1차.md") }
        }
    }

    @Test
    fun `host uploads markdown feedback document without csrf and receives parsed title`() {
        mockMvc.multipart("/api/host/sessions/00000000-0000-0000-0000-000000000306/feedback-document") {
            with(user("host@example.com"))
            file(validMarkdownFile())
        }.andExpect {
            status { isCreated() }
            jsonPath("$.title") { value("독서모임 6차 피드백") }
        }
    }

    @Test
    fun `uploaded feedback document stores title for list projection`() {
        mockMvc.multipart("/api/host/sessions/00000000-0000-0000-0000-000000000306/feedback-document") {
            with(user("host@example.com"))
            file(validMarkdownFile())
        }.andExpect {
            status { isCreated() }
            jsonPath("$.title") { value("독서모임 6차 피드백") }
        }

        mockMvc.get("/api/feedback-documents/me") {
            with(user("host@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$[?(@.sessionNumber == 6)].title") { value(hasItem("독서모임 6차 피드백")) }
        }

        assertThat(
            jdbcTemplate.queryForObject(
                """
                select document_title
                from session_feedback_documents
                where session_id = '00000000-0000-0000-0000-000000000306'
                order by version desc
                limit 1
                """.trimIndent(),
                String::class.java,
            ),
        ).isEqualTo("독서모임 6차 피드백")
    }

    @Test
    fun `host feedback upload enqueues attendee notification`() {
        mockMvc.multipart("/api/host/sessions/00000000-0000-0000-0000-000000000306/feedback-document") {
            with(user("host@example.com"))
            file(validMarkdownFile())
        }.andExpect {
            status { isCreated() }
        }

        val count = jdbcTemplate.queryForObject(
            """
            select count(*)
            from notification_outbox
            where event_type = 'FEEDBACK_DOCUMENT_PUBLISHED'
              and aggregate_id = '00000000-0000-0000-0000-000000000306'
            """.trimIndent(),
            Int::class.java,
        ) ?: 0

        assertThat(count).isGreaterThan(0)
    }

    @Test
    fun `latest uploaded feedback document version wins for read list and status`() {
        mockMvc.multipart("/api/host/sessions/00000000-0000-0000-0000-000000000306/feedback-document") {
            with(user("host@example.com"))
            file(validMarkdownFile())
        }.andExpect {
            status { isCreated() }
            jsonPath("$.fileName") { value("feedback-6-test.md") }
        }

        mockMvc.get("/api/sessions/00000000-0000-0000-0000-000000000306/feedback-document") {
            with(user("host@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.title") { value("독서모임 6차 피드백") }
            jsonPath("$.fileName") { value("feedback-6-test.md") }
        }

        mockMvc.get("/api/feedback-documents/me") {
            with(user("host@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$[?(@.sessionNumber == 6)].fileName") { value(hasItem("feedback-6-test.md")) }
        }

        mockMvc.get("/api/host/sessions/00000000-0000-0000-0000-000000000306/feedback-document") {
            with(user("host@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.uploaded") { value(true) }
            jsonPath("$.fileName") { value("feedback-6-test.md") }
        }
    }

    @Test
    fun `host upload with missing marker returns bad request`() {
        val file = MockMultipartFile(
            "file",
            "feedback-6-missing-marker.md",
            "text/markdown",
            validFeedbackMarkdown()
                .replace("<!-- readmates-feedback:v1 -->\n\n", "")
                .toByteArray(StandardCharsets.UTF_8),
        )

        mockMvc.multipart("/api/host/sessions/00000000-0000-0000-0000-000000000306/feedback-document") {
            with(user("host@example.com"))
            file(file)
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun `host upload rejects unsupported extension`() {
        val file = MockMultipartFile(
            "file",
            "feedback-6.pdf",
            "application/pdf",
            validFeedbackMarkdown().toByteArray(StandardCharsets.UTF_8),
        )

        mockMvc.multipart("/api/host/sessions/00000000-0000-0000-0000-000000000306/feedback-document") {
            with(user("host@example.com"))
            file(file)
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun `host upload rejects empty file`() {
        val file = MockMultipartFile(
            "file",
            "feedback-6.md",
            "text/markdown",
            ByteArray(0),
        )

        mockMvc.multipart("/api/host/sessions/00000000-0000-0000-0000-000000000306/feedback-document") {
            with(user("host@example.com"))
            file(file)
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun `host upload rejects invalid utf8`() {
        val file = MockMultipartFile(
            "file",
            "feedback-6.md",
            "text/markdown",
            byteArrayOf(0xC3.toByte(), 0x28),
        )

        mockMvc.multipart("/api/host/sessions/00000000-0000-0000-0000-000000000306/feedback-document") {
            with(user("host@example.com"))
            file(file)
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun `host upload rejects too large file`() {
        val file = MockMultipartFile(
            "file",
            "feedback-6.md",
            "text/markdown",
            ByteArray((512 * 1024) + 1) { 'a'.code.toByte() },
        )

        mockMvc.multipart("/api/host/sessions/00000000-0000-0000-0000-000000000306/feedback-document") {
            with(user("host@example.com"))
            file(file)
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun `host upload rejects long filename before persistence`() {
        val file = MockMultipartFile(
            "file",
            "${"a".repeat(253)}.md",
            "text/markdown",
            validFeedbackMarkdown().toByteArray(StandardCharsets.UTF_8),
        )

        mockMvc.multipart("/api/host/sessions/00000000-0000-0000-0000-000000000306/feedback-document") {
            with(user("host@example.com"))
            file(file)
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun `host upload rejects slash filename before persistence`() {
        val file = MockMultipartFile(
            "file",
            "../feedback-6.md",
            "text/markdown",
            validFeedbackMarkdown().toByteArray(StandardCharsets.UTF_8),
        )

        mockMvc.multipart("/api/host/sessions/00000000-0000-0000-0000-000000000306/feedback-document") {
            with(user("host@example.com"))
            file(file)
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun `host upload rejects backslash filename before persistence`() {
        val file = MockMultipartFile(
            "file",
            "..\\feedback-6.md",
            "text/markdown",
            validFeedbackMarkdown().toByteArray(StandardCharsets.UTF_8),
        )

        mockMvc.multipart("/api/host/sessions/00000000-0000-0000-0000-000000000306/feedback-document") {
            with(user("host@example.com"))
            file(file)
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun `host upload rejects nul source text before persistence`() {
        val file = MockMultipartFile(
            "file",
            "feedback-6.md",
            "text/markdown",
            (validFeedbackMarkdown() + "\u0000").toByteArray(StandardCharsets.UTF_8),
        )

        mockMvc.multipart("/api/host/sessions/00000000-0000-0000-0000-000000000306/feedback-document") {
            with(user("host@example.com"))
            file(file)
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun `member cannot upload markdown feedback document`() {
        mockMvc.multipart("/api/host/sessions/00000000-0000-0000-0000-000000000306/feedback-document") {
            with(user("member5@example.com"))
            file(validMarkdownFile())
        }.andExpect {
            status { isForbidden() }
        }
    }

    @Test
    fun `member upload rejects before reading malformed file`() {
        val file = MockMultipartFile(
            "file",
            "feedback-6.md",
            "text/markdown",
            byteArrayOf(0xC3.toByte(), 0x28),
        )

        mockMvc.multipart("/api/host/sessions/00000000-0000-0000-0000-000000000306/feedback-document") {
            with(user("member5@example.com"))
            file(file)
        }.andExpect {
            status { isForbidden() }
        }
    }

    @Test
    fun `host sees fallback list title for invalid stored latest document`() {
        insertInvalidLatestDocument()

        mockMvc.get("/api/feedback-documents/me") {
            with(user("host@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$[?(@.sessionNumber == 6)].title") { value(hasItem("문서 형식 확인 필요")) }
        }
    }

    @Test
    fun `member list skips invalid stored latest document`() {
        insertInvalidLatestDocument()

        mockMvc.get("/api/feedback-documents/me") {
            with(user("member5@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$[*].sessionNumber") { value(not(hasItem(6))) }
        }
    }

    @Test
    fun `stored invalid document returns host repair status instead of parser bad request`() {
        insertInvalidLatestDocument()

        mockMvc.get("/api/sessions/00000000-0000-0000-0000-000000000306/feedback-document") {
            with(user("host@example.com"))
        }.andExpect {
            status { isUnprocessableContent() }
        }
    }

    @Test
    fun `stored invalid document returns generic member unavailable status`() {
        insertInvalidLatestDocument()

        mockMvc.get("/api/sessions/00000000-0000-0000-0000-000000000306/feedback-document") {
            with(user("member5@example.com"))
        }.andExpect {
            status { isUnprocessableContent() }
        }
    }

    private fun insertInvalidLatestDocument() {
        jdbcTemplate.update(
            """
            insert into session_feedback_documents (
              id,
              club_id,
              session_id,
              version,
              source_text,
              file_name,
              content_type,
              file_size
            )
            values (
              '00000000-0000-0000-0000-000000000996',
              '00000000-0000-0000-0000-000000000001',
              '00000000-0000-0000-0000-000000000306',
              99,
              'invalid stored feedback document',
              'invalid-6.md',
              'text/markdown',
              octet_length('invalid stored feedback document')
            )
            """.trimIndent(),
        )
    }

    private fun validMarkdownFile(): MockMultipartFile =
        MockMultipartFile(
            "file",
            "feedback-6-test.md",
            "text/markdown",
            validFeedbackMarkdown().toByteArray(StandardCharsets.UTF_8),
        )

    private fun validFeedbackMarkdown(): String =
        """
        <!-- readmates-feedback:v1 -->

        # 독서모임 6차 피드백

        투자의 원칙 · 2026.04.15

        ## 메타

        - 일시: 2026.04.15 (수) · 19:40
        - 소요시간: 2시간 1분
        - 책: 투자의 원칙 · 테스트 저자
        - 참여자: 이멤버5, 김호스트, 최멤버2

        ## 관찰자 노트

        이번 회차는 판단 기준을 명확히 세우는 연습에 집중했다.

        ## 참여자별 피드백

        ### 01. 이멤버5

        역할: 구체적인 사례를 통해 판단 기준을 확인하는 참여자

        #### 참여 스타일

        이멤버5은 질문의 전제를 먼저 확인하고 자기 경험으로 이어 갔다.

        #### 실질 기여

        - 실패를 피하는 방식으로 의사결정 기준을 설명했다. [10:00]

        #### 문제점과 자기모순

        ##### 1. 기준은 제시했지만 적용 범위가 좁았다

        - 핵심: 판단 기준은 분명했지만 다른 상황으로 확장하지 않았다.
        - 근거: "그 상황에서는 피하는 게 맞다고 봤어요." [12:00]
        - 해석: 기준을 설명한 뒤 적용 가능한 조건을 함께 말하면 논지가 더 선명해진다.

        #### 실천 과제

        1. 다음 모임에서 판단 기준을 말할 때 적용 조건을 함께 말한다.

        #### 드러난 한 문장

        > "그 상황에서는 피하는 게 맞다고 봤어요."

        맥락: 실패를 피하는 의사결정을 설명하던 장면 · [12:00]

        주석: 이 문장은 판단 기준이 행동으로 이어지는 순간을 보여준다.
        """.trimIndent()

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
