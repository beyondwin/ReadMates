package com.readmates.archive.api

import com.readmates.support.MySqlTestContainer
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.annotation.DirtiesContext
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class ReadmatesSeedDataTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) {
    @Test
    fun `seed creates exactly six readmates users and memberships`() {
        assertEquals(6, jdbcTemplate.queryForObject("select count(*) from users where email in ($SEEDED_EMAILS)", Int::class.java))
        assertEquals(6, jdbcTemplate.queryForObject("select count(*) from memberships where club_id = ?", Int::class.java, CLUB_ID))
    }

    @Test
    fun `seed attendance matches recode participants`() {
        val rows = jdbcTemplate.query(
            """
            select sessions.number, users.email, session_participants.attendance_status
            from session_participants
            join sessions on sessions.id = session_participants.session_id
            join memberships on memberships.id = session_participants.membership_id
            join users on users.id = memberships.user_id
            where sessions.club_id = ?
              and sessions.number between 1 and 6
            order by sessions.number, users.email
            """.trimIndent(),
            { rs, _ -> Triple(rs.getInt("number"), rs.getString("email"), rs.getString("attendance_status")) },
            CLUB_ID,
        )

        assertEquals(36, rows.size)
        EXPECTED_ATTENDANCE.forEach { (sessionNumber, expectedAttendedEmails) ->
            val actualAttendedEmails = rows
                .filter { it.first == sessionNumber && it.third == "ATTENDED" }
                .map { it.second }
                .toSet()
            assertEquals(expectedAttendedEmails, actualAttendedEmails, "session $sessionNumber attendance")
        }
    }

    @Test
    fun `seed notes include useful real data for all six sessions`() {
        val highlightsBySession = countBySession("highlights")
        val oneLinersBySession = countBySession("one_line_reviews")
        val checkinsBySession = countBySession("reading_checkins")

        (1..6).forEach { sessionNumber ->
            require((highlightsBySession[sessionNumber] ?: 0) >= 2) { "session $sessionNumber should have at least two highlights" }
            require((oneLinersBySession[sessionNumber] ?: 0) >= 2) { "session $sessionNumber should have at least two one-line reviews" }
            require((checkinsBySession[sessionNumber] ?: 0) >= 2) { "session $sessionNumber should have at least two check-ins" }
        }
    }

    @Test
    fun `seed sessions include cover image urls and neutral locations`() {
        val rows = jdbcTemplate.query(
            """
            select number, book_image_url, location_label, meeting_url, meeting_passcode
            from sessions
            where club_id = ?
              and number between 1 and 6
            order by number
            """.trimIndent(),
            { rs, _ ->
                SeedSessionMetadata(
                    number = rs.getInt("number"),
                    bookImageUrl = rs.getString("book_image_url"),
                    locationLabel = rs.getString("location_label"),
                    meetingUrl = rs.getString("meeting_url"),
                    meetingPasscode = rs.getString("meeting_passcode"),
                )
            },
            CLUB_ID,
        )

        assertEquals(6, rows.size)
        rows.forEach { row ->
            require(row.bookImageUrl?.startsWith("https://image.aladin.co.kr/product/") == true) {
                "session ${row.number} should use a stable Aladin cover URL"
            }
            assertEquals("온라인", row.locationLabel)
            assertEquals(null, row.meetingUrl)
            assertEquals(null, row.meetingPasscode)
        }
    }

    private fun countBySession(tableName: String): Map<Int, Int> =
        jdbcTemplate.query(
            """
            select sessions.number, count(*) as count
            from $tableName
            join sessions on sessions.id = $tableName.session_id
            where sessions.club_id = ?
              and sessions.number between 1 and 6
            group by sessions.number
            """.trimIndent(),
            { rs, _ -> rs.getInt("number") to rs.getInt("count") },
            CLUB_ID,
        ).toMap()

    private data class SeedSessionMetadata(
        val number: Int,
        val bookImageUrl: String?,
        val locationLabel: String,
        val meetingUrl: String?,
        val meetingPasscode: String?,
    )

    companion object {
        private const val CLUB_ID = "00000000-0000-0000-0000-000000000001"
        private const val SEEDED_EMAILS =
            "'host@example.com','member1@example.com','member2@example.com','member3@example.com','member4@example.com','member5@example.com'"

        private val EXPECTED_ATTENDANCE = mapOf(
            1 to setOf("host@example.com", "member1@example.com", "member5@example.com"),
            2 to setOf("host@example.com", "member2@example.com", "member5@example.com"),
            3 to setOf("host@example.com", "member2@example.com", "member5@example.com", "member3@example.com", "member1@example.com", "member4@example.com"),
            4 to setOf("host@example.com", "member2@example.com", "member3@example.com", "member4@example.com"),
            5 to setOf("host@example.com", "member4@example.com", "member2@example.com", "member1@example.com"),
            6 to setOf("host@example.com", "member5@example.com", "member2@example.com"),
        )

        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
