package com.readmates.session.domain

import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.UncategorizedSQLException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.TestPropertySource

@SpringBootTest
@TestPropertySource(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@Tag("integration")
class SessionInvariantConstraintTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val createdSessionIds = mutableListOf<String>()

    @AfterEach
    fun cleanupCreatedSessions() {
        if (createdSessionIds.isNotEmpty()) {
            val placeholders = createdSessionIds.joinToString(", ") { "?" }
            jdbcTemplate.update(
                "delete from sessions where id in ($placeholders)",
                *createdSessionIds.toTypedArray(),
            )
            createdSessionIds.clear()
        }
    }

    @Test
    fun `PUBLISHED with HOST_ONLY visibility violates constraint`() {
        assertThrows(UncategorizedSQLException::class.java) {
            insertSession(
                id = "00000000-0000-0000-0000-000000099001",
                state = "PUBLISHED",
                visibility = "HOST_ONLY",
            )
        }
    }

    @Test
    fun `DRAFT with PUBLIC visibility violates constraint`() {
        assertThrows(UncategorizedSQLException::class.java) {
            insertSession(
                id = "00000000-0000-0000-0000-000000099002",
                state = "DRAFT",
                visibility = "PUBLIC",
            )
        }
    }

    @Test
    fun `PUBLISHED with MEMBER visibility is valid`() {
        insertSession(
            id = "00000000-0000-0000-0000-000000099003",
            state = "PUBLISHED",
            visibility = "MEMBER",
        )
        createdSessionIds += "00000000-0000-0000-0000-000000099003"
    }

    @Test
    fun `PUBLISHED with PUBLIC visibility is valid`() {
        insertSession(
            id = "00000000-0000-0000-0000-000000099004",
            state = "PUBLISHED",
            visibility = "PUBLIC",
        )
        createdSessionIds += "00000000-0000-0000-0000-000000099004"
    }

    @Test
    fun `DRAFT with HOST_ONLY visibility is valid`() {
        insertSession(
            id = "00000000-0000-0000-0000-000000099005",
            state = "DRAFT",
            visibility = "HOST_ONLY",
        )
        createdSessionIds += "00000000-0000-0000-0000-000000099005"
    }

    private fun insertSession(
        id: String,
        state: String,
        visibility: String,
    ) {
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author,
              book_translator, book_link, book_image_url,
              session_date, start_time, end_time, location_label,
              meeting_url, meeting_passcode, question_deadline_at,
              state, visibility
            )
            values (
              ?, '00000000-0000-0000-0000-000000000001',
              ?, '제약 테스트 세션', '제약 테스트 책', '제약 테스트 저자',
              null, null, null,
              '2099-01-01', '20:00:00', '22:00:00', '온라인',
              null, null, '2098-12-31 14:59:00.000000',
              ?, ?
            )
            """.trimIndent(),
            id,
            idSuffix(id),
            state,
            visibility,
        )
    }

    private fun idSuffix(id: String): Int {
        // Use the last 5 characters as a high session number (e.g., 99001) to avoid conflicts with seeded data
        return id
            .takeLast(5)
            .trimStart('0')
            .ifEmpty { "0" }
            .toInt()
    }
}
