package com.readmates.auth.api

import com.readmates.auth.application.AuthSessionService
import com.readmates.support.MySqlTestContainer
import jakarta.servlet.http.Cookie
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.UUID

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.auth.session-cookie-secure=false",
        "readmates.bff-secret=test-bff-secret",
        "readmates.allowed-origins=http://localhost:3000",
    ],
)
@AutoConfigureMockMvc
class SelfMembershipControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val authSessionService: AuthSessionService,
) {
    private val createdSessionTokenHashes = linkedSetOf<String>()
    private val createdMembershipIds = linkedSetOf<String>()
    private val createdUserIds = linkedSetOf<String>()
    private val createdSessionIds = linkedSetOf<String>()

    @AfterEach
    fun cleanupCreatedRows() {
        try {
            deleteWhereIn("session_participants", "session_id", createdSessionIds)
            deleteWhereIn("sessions", "id", createdSessionIds)
            deleteWhereIn("auth_sessions", "session_token_hash", createdSessionTokenHashes)
            deleteWhereIn("auth_sessions", "user_id", createdUserIds)
            deleteWhereIn("memberships", "id", createdMembershipIds)
            deleteWhereIn("memberships", "user_id", createdUserIds)
            deleteWhereIn("users", "id", createdUserIds)
            resetSeedMembership("member5@example.com", "MEMBER")
            resetSeedMembership("host@example.com", "HOST")
        } finally {
            createdSessionTokenHashes.clear()
            createdMembershipIds.clear()
            createdUserIds.clear()
            createdSessionIds.clear()
        }
    }

    @Test
    fun `member leaves club and current session is removed by default`() {
        val memberCookie = sessionCookieForEmail("member5@example.com")
        val sessionId = createOpenSessionWithMember("member5@example.com")
        val membershipId = membershipIdForEmail("member5@example.com")

        mockMvc.post("/api/me/membership/leave") {
            cookie(memberCookie)
            header("X-Readmates-Bff-Secret", "test-bff-secret")
            header("Origin", "http://localhost:3000")
            contentType = MediaType.APPLICATION_JSON
            content = """{"currentSessionPolicy":"APPLY_NOW"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.member.status") { value("LEFT") }
            jsonPath("$.currentSessionPolicyResult") { value("APPLIED") }
        }

        assertEquals("LEFT", membershipStatus(membershipId))
        assertEquals("REMOVED", participationStatus(sessionId, membershipId))
    }

    @Test
    fun `host self leave is rejected when it would remove the last active host`() {
        val hostCookie = sessionCookieForEmail("host@example.com")
        val hostMembershipId = membershipIdForEmail("host@example.com")

        mockMvc.post("/api/me/membership/leave") {
            cookie(hostCookie)
            header("X-Readmates-Bff-Secret", "test-bff-secret")
            header("Origin", "http://localhost:3000")
            contentType = MediaType.APPLICATION_JSON
            content = """{"currentSessionPolicy":"APPLY_NOW"}"""
        }.andExpect {
            status { isConflict() }
        }

        assertEquals("ACTIVE", membershipStatus(hostMembershipId))
    }

    @Test
    fun `concurrent host self leave cannot remove every active host`() {
        val secondHostEmail = insertHostMember("second.host")
        val hostCookie = sessionCookieForEmail("host@example.com")
        val secondHostCookie = sessionCookieForEmail(secondHostEmail)
        val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)

        try {
            val statuses = listOf(hostCookie, secondHostCookie).map { cookie ->
                executor.submit<Int> {
                    start.await(5, TimeUnit.SECONDS)
                    mockMvc.post("/api/me/membership/leave") {
                        cookie(cookie)
                        header("X-Readmates-Bff-Secret", "test-bff-secret")
                        header("Origin", "http://localhost:3000")
                        contentType = MediaType.APPLICATION_JSON
                        content = """{"currentSessionPolicy":"APPLY_NOW"}"""
                    }.andReturn().response.status
                }
            }
            start.countDown()

            assertEquals(listOf(200, 409), statuses.map { it.get(10, TimeUnit.SECONDS) }.sorted())
            assertEquals(1, activeHostCount())
        } finally {
            executor.shutdownNow()
        }
    }

    private fun createOpenSessionWithMember(email: String): String {
        val sessionId = UUID.randomUUID().toString()
        val membershipId = membershipIdForEmail(email)
        val nextNumber = jdbcTemplate.queryForObject(
            """
            select coalesce(max(number), 0) + 1000
            from sessions
            where club_id = '00000000-0000-0000-0000-000000000001'
            """.trimIndent(),
            Int::class.java,
        ) ?: 1000
        jdbcTemplate.update(
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
              book_image_url,
              session_date,
              start_time,
              end_time,
              location_label,
              meeting_url,
              meeting_passcode,
              question_deadline_at,
              state
            )
            values (
              ?,
              '00000000-0000-0000-0000-000000000001',
              ?,
              '본인 탈퇴 테스트 세션',
              '본인 탈퇴 테스트 책',
              '테스트 저자',
              null,
              null,
              null,
              '2026-05-20',
              '20:00',
              '22:00',
              '온라인',
              null,
              null,
              '2026-05-19 14:59:00.000000',
              'OPEN'
            )
            """.trimIndent(),
            sessionId,
            nextNumber,
        )
        createdSessionIds += sessionId
        jdbcTemplate.update(
            """
            insert into session_participants (
              id,
              club_id,
              session_id,
              membership_id,
              rsvp_status,
              attendance_status,
              participation_status
            )
            values (
              ?,
              '00000000-0000-0000-0000-000000000001',
              ?,
              ?,
              'NO_RESPONSE',
              'UNKNOWN',
              'ACTIVE'
            )
            """.trimIndent(),
            UUID.randomUUID().toString(),
            sessionId,
            membershipId,
        )
        return sessionId
    }

    private fun sessionCookieForEmail(email: String): Cookie {
        val userId = jdbcTemplate.queryForObject(
            "select id from users where email = ?",
            String::class.java,
            email,
        ) ?: error("Expected seeded user for $email")
        val issuedSession = authSessionService.issueSession(
            userId = userId,
            userAgent = "SelfMembershipControllerTest",
            ipAddress = "127.0.0.1",
        )
        createdSessionTokenHashes += issuedSession.storedTokenHash
        return Cookie(AuthSessionService.COOKIE_NAME, issuedSession.rawToken)
    }

    private fun insertHostMember(prefix: String): String {
        val userId = UUID.randomUUID().toString()
        val membershipId = UUID.randomUUID().toString()
        val email = "$prefix.${UUID.randomUUID()}@example.com"
        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, profile_image_url, auth_provider)
            values (?, ?, ?, ?, ?, null, 'GOOGLE')
            """.trimIndent(),
            userId,
            "google-self-lifecycle-$userId",
            email,
            prefix,
            prefix,
        )
        createdUserIds += userId
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at)
            values (?, '00000000-0000-0000-0000-000000000001', ?, 'HOST', 'ACTIVE', utc_timestamp(6))
            """.trimIndent(),
            membershipId,
            userId,
        )
        createdMembershipIds += membershipId
        return email
    }

    private fun membershipIdForEmail(email: String): String =
        jdbcTemplate.queryForObject(
            """
            select memberships.id
            from memberships
            join users on users.id = memberships.user_id
            where users.email = ?
            """.trimIndent(),
            String::class.java,
            email,
        ) ?: error("Expected membership for $email")

    private fun membershipStatus(membershipId: String): String =
        jdbcTemplate.queryForObject(
            "select status from memberships where id = ?",
            String::class.java,
            membershipId,
        ) ?: error("Expected membership status for $membershipId")

    private fun participationStatus(sessionId: String, membershipId: String): String =
        jdbcTemplate.queryForObject(
            """
            select participation_status
            from session_participants
            where session_id = ?
              and membership_id = ?
            """.trimIndent(),
            String::class.java,
            sessionId,
            membershipId,
        ) ?: error("Expected participant for $sessionId and $membershipId")

    private fun resetSeedMembership(email: String, role: String) {
        jdbcTemplate.update(
            """
            update memberships
            join users on users.id = memberships.user_id
            set memberships.role = ?,
                memberships.status = 'ACTIVE',
                memberships.joined_at = coalesce(memberships.joined_at, utc_timestamp(6)),
                memberships.updated_at = utc_timestamp(6)
            where users.email = ?
              and memberships.club_id = '00000000-0000-0000-0000-000000000001'
            """.trimIndent(),
            role,
            email,
        )
    }

    private fun activeHostCount(): Int =
        jdbcTemplate.queryForObject(
            """
            select count(*)
            from memberships
            where club_id = '00000000-0000-0000-0000-000000000001'
              and role = 'HOST'
              and status = 'ACTIVE'
            """.trimIndent(),
            Int::class.java,
        ) ?: 0

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
