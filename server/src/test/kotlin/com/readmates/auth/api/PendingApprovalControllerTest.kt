package com.readmates.auth.api

import com.readmates.auth.application.AuthSessionService
import com.readmates.support.MySqlTestContainer
import jakarta.servlet.http.Cookie
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import java.util.UUID

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.auth.session-cookie-secure=false",
    ],
)
@AutoConfigureMockMvc
class PendingApprovalControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val authSessionService: AuthSessionService,
) {
    private val createdSessionTokenHashes = linkedSetOf<String>()
    private val createdSessionIds = linkedSetOf<String>()
    private val createdMembershipIds = linkedSetOf<String>()
    private val createdUserIds = linkedSetOf<String>()
    private val createdClubIds = linkedSetOf<String>()

    @AfterEach
    fun cleanupCreatedRows() {
        try {
            deleteWhereIn("auth_sessions", "session_token_hash", createdSessionTokenHashes)
            deleteWhereIn("auth_sessions", "user_id", createdUserIds)
            deleteWhereIn("memberships", "id", createdMembershipIds)
            deleteWhereIn("memberships", "user_id", createdUserIds)
            deleteWhereIn("users", "id", createdUserIds)
            deleteWhereIn("sessions", "id", createdSessionIds)
            deleteWhereIn("clubs", "id", createdClubIds)
        } finally {
            createdSessionTokenHashes.clear()
            createdSessionIds.clear()
            createdMembershipIds.clear()
            createdUserIds.clear()
            createdClubIds.clear()
            SecurityContextHolder.clearContext()
        }
    }

    @Test
    fun `pending approval user can read pending app summary`() {
        val cookie = pendingSessionCookie("pending.summary@example.com")

        mockMvc.get("/api/app/pending") {
            cookie(cookie)
        }.andExpect {
            status { isOk() }
            content { contentTypeCompatibleWith(MediaType.APPLICATION_JSON) }
            jsonPath("$.approvalState") { value("PENDING_APPROVAL") }
            jsonPath("$.clubName") { value("ReadMates") }
            jsonPath("$.currentSession.sessionNumber") { value(2) }
            jsonPath("$.currentSession.title") { value("2회차 · 열린 책") }
            jsonPath("$.currentSession.bookTitle") { value("열린 책") }
            jsonPath("$.currentSession.bookAuthor") { value("열린 저자") }
            jsonPath("$.currentSession.date") { value("2026-05-20") }
            jsonPath("$.currentSession.locationLabel") { value("온라인") }
        }
    }

    @Test
    fun `pending approval summary returns null current session when club has no open or published session`() {
        val cookie = pendingSessionCookie(
            email = "pending.no-session@example.com",
            withSessions = false,
        )

        mockMvc.get("/api/app/pending") {
            cookie(cookie)
        }.andExpect {
            status { isOk() }
            jsonPath("$.approvalState") { value("PENDING_APPROVAL") }
            jsonPath("$.clubName") { value("ReadMates") }
            jsonPath("$.currentSession") { value(null) }
        }
    }

    @Test
    fun `active member cannot read pending app summary`() {
        val cookie = memberSessionCookie(
            email = "active.pending-summary@example.com",
            membershipStatus = "ACTIVE",
        )

        mockMvc.get("/api/app/pending") {
            cookie(cookie)
        }.andExpect {
            status { isForbidden() }
        }
    }

    @Test
    fun `anonymous user cannot read pending app summary`() {
        mockMvc.get("/api/app/pending")
            .andExpect {
                status { isUnauthorized() }
            }
    }

    private fun pendingSessionCookie(email: String, withSessions: Boolean = true): Cookie =
        memberSessionCookie(
            email = email,
            membershipStatus = "PENDING_APPROVAL",
            withSessions = withSessions,
        )

    private fun memberSessionCookie(
        email: String,
        membershipStatus: String,
        withSessions: Boolean = true,
    ): Cookie {
        val clubId = UUID.randomUUID().toString()
        val userId = UUID.randomUUID().toString()
        val membershipId = UUID.randomUUID().toString()

        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about)
            values (?, ?, 'ReadMates', 'Test club', 'Test club for pending approval summary')
            """.trimIndent(),
            clubId,
            "pending-summary-$clubId",
        )
        createdClubIds += clubId

        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, profile_image_url, auth_provider)
            values (?, ?, ?, 'Pending Approval', 'Pending', null, 'GOOGLE')
            """.trimIndent(),
            userId,
            "google-pending-summary-$userId",
            email,
        )
        createdUserIds += userId

        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at)
            values (?, ?, ?, 'MEMBER', ?, if(? = 'ACTIVE', utc_timestamp(6), null))
            """.trimIndent(),
            membershipId,
            clubId,
            userId,
            membershipStatus,
            membershipStatus,
        )
        createdMembershipIds += membershipId

        if (withSessions) {
            insertSession(
                clubId = clubId,
                number = 1,
                title = "1회차 · 지난 책",
                bookTitle = "지난 책",
                bookAuthor = "지난 저자",
                sessionDate = "2026-04-20",
                locationLabel = "강남",
                state = "PUBLISHED",
            )
            insertSession(
                clubId = clubId,
                number = 2,
                title = "2회차 · 열린 책",
                bookTitle = "열린 책",
                bookAuthor = "열린 저자",
                sessionDate = "2026-05-20",
                locationLabel = "온라인",
                state = "OPEN",
            )
            insertSession(
                clubId = clubId,
                number = 3,
                title = "3회차 · 초안 책",
                bookTitle = "초안 책",
                bookAuthor = "초안 저자",
                sessionDate = "2026-06-20",
                locationLabel = "비공개",
                state = "DRAFT",
            )
        }

        val issuedSession = authSessionService.issueSession(
            userId = userId,
            userAgent = "PendingApprovalControllerTest",
            ipAddress = "127.0.0.1",
        )
        createdSessionTokenHashes += issuedSession.storedTokenHash
        return Cookie(AuthSessionService.COOKIE_NAME, issuedSession.rawToken)
    }

    private fun insertSession(
        clubId: String,
        number: Int,
        title: String,
        bookTitle: String,
        bookAuthor: String,
        sessionDate: String,
        locationLabel: String,
        state: String,
    ) {
        val sessionId = UUID.randomUUID().toString()
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, book_translator, book_link,
              session_date, start_time, end_time, location_label, question_deadline_at, state
            )
            values (?, ?, ?, ?, ?, ?, null, null, ?, '20:00', '22:00', ?, concat(?, ' 14:59:00.000000'), ?)
            """.trimIndent(),
            sessionId,
            clubId,
            number,
            title,
            bookTitle,
            bookAuthor,
            sessionDate,
            locationLabel,
            sessionDate,
            state,
        )
        createdSessionIds += sessionId
    }

    private fun deleteWhereIn(tableName: String, columnName: String, values: Set<String>) {
        if (values.isEmpty()) {
            return
        }

        val placeholders = values.joinToString(", ") { "?" }
        jdbcTemplate.update(
            "delete from $tableName where $columnName in ($placeholders)",
            *values.toTypedArray(),
        )
    }

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
