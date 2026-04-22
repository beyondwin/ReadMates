package com.readmates.note.adapter.`in`.web

import com.readmates.support.MySqlTestContainer
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@AutoConfigureMockMvc
@Sql(
    statements = [
        """
        insert into sessions (
          id,
          club_id,
          number,
          title,
          book_title,
          book_author,
          book_translator,
          book_link,
          session_date,
          start_time,
          end_time,
          location_label,
          question_deadline_at,
          state
        )
        values (
          '00000000-0000-0000-0000-000000009001',
          '00000000-0000-0000-0000-000000000001',
          99,
          '검증용 열린 모임',
          '검증 책',
          '검증 저자',
          null,
          null,
          '2026-05-20',
          '19:30',
          '21:30',
          '테스트 공간',
          '2026-05-19 14:59:00.000000',
          'OPEN'
        )
        on duplicate key update
          title = values(title),
          book_title = values(book_title),
          book_author = values(book_author),
          session_date = values(session_date),
          start_time = values(start_time),
          end_time = values(end_time),
          location_label = values(location_label),
          question_deadline_at = values(question_deadline_at),
          state = values(state);
        """,
        """
        insert into session_participants (
          id,
          club_id,
          session_id,
          membership_id,
          rsvp_status,
          attendance_status
        )
        values (
          '00000000-0000-0000-0000-000000009002',
          '00000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-000000009001',
          '00000000-0000-0000-0000-000000000206',
          'NO_RESPONSE',
          'UNKNOWN'
        )
        on duplicate key update
          rsvp_status = values(rsvp_status),
          attendance_status = values(attendance_status);
        """,
    ],
    executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
)
@Sql(
    statements = [
        "delete from questions where session_id = '00000000-0000-0000-0000-000000009001';",
        "delete from session_participants where session_id = '00000000-0000-0000-0000-000000009001';",
        "delete from sessions where id = '00000000-0000-0000-0000-000000009001';",
    ],
    executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
)
class QuestionControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) {
    @Test
    fun `accepts a fifth priority question`() {
        mockMvc.post("/api/sessions/current/questions") {
            with(user("member5@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "priority": 5,
                  "text": "다섯 번째 질문까지 준비할 수 있나요?",
                  "draftThought": "실제 모임 질문 수에 맞춘 검증"
                }
                """.trimIndent()
        }.andExpect {
            status { isCreated() }
            jsonPath("$.priority") { value(5) }
        }
    }

    @Test
    fun `rejects a question with an invalid priority`() {
        mockMvc.post("/api/sessions/current/questions") {
            with(user("member5@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "priority": 6,
                  "text": "우선순위가 범위를 벗어난 질문",
                  "draftThought": null
                }
                """.trimIndent()
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun `rejects a question with blank text`() {
        mockMvc.post("/api/sessions/current/questions") {
            with(user("member5@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "priority": 1,
                  "text": " ",
                  "draftThought": null
                }
                """.trimIndent()
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun `replaces current questions as an ordered list`() {
        mockMvc.put("/api/sessions/current/questions") {
            with(user("member5@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "questions": [
                    { "text": " 첫 번째 질문 " },
                    { "text": "두 번째 질문" }
                  ]
                }
                """.trimIndent()
        }.andExpect {
            status { isOk() }
            jsonPath("$.questions[0].priority") { value(1) }
            jsonPath("$.questions[0].text") { value("첫 번째 질문") }
            jsonPath("$.questions[1].priority") { value(2) }
            jsonPath("$.questions[1].text") { value("두 번째 질문") }
        }

        val rows = savedQuestions()
        require(rows.size == 2)
        check(rows[0]["priority"] == 1)
        check(rows[0]["text"] == "첫 번째 질문")
        check(rows[0]["draft_thought"] == null)
        check(rows[1]["priority"] == 2)
        check(rows[1]["text"] == "두 번째 질문")
        check(rows[1]["draft_thought"] == null)
    }

    @Test
    fun `accepts five replacement questions`() {
        mockMvc.put("/api/sessions/current/questions") {
            with(user("member5@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "questions": [
                    { "text": "질문 1" },
                    { "text": "질문 2" },
                    { "text": "질문 3" },
                    { "text": "질문 4" },
                    { "text": "질문 5" }
                  ]
                }
                """.trimIndent()
        }.andExpect {
            status { isOk() }
            jsonPath("$.questions[4].priority") { value(5) }
            jsonPath("$.questions[4].text") { value("질문 5") }
        }
    }

    @Test
    fun `rejects fewer than two replacement questions`() {
        mockMvc.put("/api/sessions/current/questions") {
            with(user("member5@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "questions": [
                    { "text": "질문 1" }
                  ]
                }
                """.trimIndent()
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun `rejects blank replacement questions`() {
        mockMvc.put("/api/sessions/current/questions") {
            with(user("member5@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "questions": [
                    { "text": "질문 1" },
                    { "text": " " }
                  ]
                }
                """.trimIndent()
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun `rejects more than five replacement questions`() {
        mockMvc.put("/api/sessions/current/questions") {
            with(user("member5@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "questions": [
                    { "text": "질문 1" },
                    { "text": "질문 2" },
                    { "text": "질문 3" },
                    { "text": "질문 4" },
                    { "text": "질문 5" },
                    { "text": "질문 6" }
                  ]
                }
                """.trimIndent()
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun `replacement removes stale higher priority questions`() {
        seedFiveQuestions()

        mockMvc.put("/api/sessions/current/questions") {
            with(user("member5@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "questions": [
                    { "text": "남길 질문 1" },
                    { "text": "남길 질문 2" }
                  ]
                }
                """.trimIndent()
        }.andExpect {
            status { isOk() }
        }

        val rows = savedQuestions()
        require(rows.size == 2)
        check(rows.map { it["priority"] } == listOf(1, 2))
        check(rows.map { it["text"] } == listOf("남길 질문 1", "남길 질문 2"))
    }

    private fun seedFiveQuestions() {
        (1..5).forEach { priority ->
            jdbcTemplate.update(
                """
                insert into questions (id, club_id, session_id, membership_id, priority, text, draft_thought)
                values (?, ?, ?, ?, ?, ?, ?)
                on duplicate key update
                  text = values(text),
                  draft_thought = values(draft_thought)
                """.trimIndent(),
                "00000000-0000-0000-0000-00000000910$priority",
                "00000000-0000-0000-0000-000000000001",
                "00000000-0000-0000-0000-000000009001",
                "00000000-0000-0000-0000-000000000206",
                priority,
                "기존 질문 $priority",
                "기존 초안 $priority",
            )
        }
    }

    private fun savedQuestions(): List<Map<String, Any?>> =
        jdbcTemplate.queryForList(
            """
            select priority, text, draft_thought
            from questions
            where session_id = '00000000-0000-0000-0000-000000009001'
              and membership_id = '00000000-0000-0000-0000-000000000206'
            order by priority
            """.trimIndent(),
        )

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
