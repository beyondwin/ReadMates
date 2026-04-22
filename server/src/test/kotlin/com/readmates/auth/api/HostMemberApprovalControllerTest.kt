package com.readmates.auth.api

import com.readmates.auth.application.AuthSessionService
import com.readmates.support.MySqlTestContainer
import jakarta.servlet.http.Cookie
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import java.util.UUID

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.auth.session-cookie-secure=false",
    ],
)
@AutoConfigureMockMvc
class HostMemberApprovalControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val authSessionService: AuthSessionService,
) {
    private val createdSessionTokenHashes = linkedSetOf<String>()
    private val createdMembershipIds = linkedSetOf<String>()
    private val createdUserIds = linkedSetOf<String>()
    private val createdSessionIds = linkedSetOf<String>()
    private val createdClubIds = linkedSetOf<String>()

    @AfterEach
    fun cleanupCreatedRows() {
        try {
            deleteWhereIn("session_participants", "membership_id", createdMembershipIds)
            deleteWhereIn("session_participants", "session_id", createdSessionIds)
            deleteWhereIn("sessions", "id", createdSessionIds)
            deleteWhereIn("auth_sessions", "session_token_hash", createdSessionTokenHashes)
            deleteWhereIn("auth_sessions", "user_id", createdUserIds)
            deleteWhereIn("memberships", "id", createdMembershipIds)
            deleteWhereIn("memberships", "user_id", createdUserIds)
            deleteWhereIn("users", "id", createdUserIds)
            deleteWhereIn("clubs", "id", createdClubIds)
        } finally {
            createdSessionTokenHashes.clear()
            createdMembershipIds.clear()
            createdUserIds.clear()
            createdSessionIds.clear()
            createdClubIds.clear()
        }
    }

    @Test
    fun `host lists pending approvals`() {
        val hostCookie = sessionCookieForEmail("host@example.com")
        val pendingEmail = uniqueEmail("pending.list")
        insertPendingMember(pendingEmail, "Pending List")

        mockMvc.get("/api/host/members/pending-approvals") {
            cookie(hostCookie)
        }.andExpect {
            status { isOk() }
            jsonPath("$[0].email") { value(pendingEmail) }
            jsonPath("$[0].status") { value("PENDING_APPROVAL") }
        }
    }

    @Test
    fun `host approves pending member`() {
        val hostCookie = sessionCookieForEmail("host@example.com")
        val sessionId = createOpenSession()
        val membershipId = insertPendingMember(uniqueEmail("pending.approve"), "Pending Approve")

        mockMvc.post("/api/host/members/$membershipId/approve") {
            cookie(hostCookie)
        }.andExpect {
            status { isOk() }
            jsonPath("$.status") { value("ACTIVE") }
        }

        val membership = jdbcTemplate.queryForMap(
            """
            select status, joined_at
            from memberships
            where id = ?
            """.trimIndent(),
            membershipId,
        )
        assertEquals("ACTIVE", membership["status"])
        assertNotNull(membership["joined_at"])

        val participant = jdbcTemplate.queryForMap(
            """
            select rsvp_status, attendance_status
            from session_participants
            where session_id = ?
              and membership_id = ?
            """.trimIndent(),
            sessionId,
            membershipId,
        )
        assertEquals("NO_RESPONSE", participant["rsvp_status"])
        assertEquals("UNKNOWN", participant["attendance_status"])
    }

    @Test
    fun `host rejects pending member`() {
        val hostCookie = sessionCookieForEmail("host@example.com")
        val membershipId = insertPendingMember(uniqueEmail("pending.reject"), "Pending Reject")

        mockMvc.post("/api/host/members/$membershipId/reject") {
            cookie(hostCookie)
        }.andExpect {
            status { isOk() }
            jsonPath("$.status") { value("INACTIVE") }
        }

        val membership = jdbcTemplate.queryForMap(
            """
            select status, joined_at
            from memberships
            where id = ?
            """.trimIndent(),
            membershipId,
        )
        assertEquals("INACTIVE", membership["status"])
        assertEquals(null, membership["joined_at"])
    }

    @Test
    fun `member cannot list pending approvals`() {
        val memberCookie = sessionCookieForEmail("member5@example.com")

        mockMvc.get("/api/host/members/pending-approvals") {
            cookie(memberCookie)
        }.andExpect {
            status { isForbidden() }
        }
    }

    @Test
    fun `member cannot approve or reject pending approvals`() {
        val memberCookie = sessionCookieForEmail("member5@example.com")
        val approveMembershipId = insertPendingMember(uniqueEmail("member.blocked.approve"), "Blocked Approve")
        val rejectMembershipId = insertPendingMember(uniqueEmail("member.blocked.reject"), "Blocked Reject")

        mockMvc.post("/api/host/members/$approveMembershipId/approve") {
            cookie(memberCookie)
        }.andExpect {
            status { isForbidden() }
        }
        mockMvc.post("/api/host/members/$rejectMembershipId/reject") {
            cookie(memberCookie)
        }.andExpect {
            status { isForbidden() }
        }

        assertEquals("PENDING_APPROVAL", membershipStatus(approveMembershipId))
        assertEquals("PENDING_APPROVAL", membershipStatus(rejectMembershipId))
    }

    @Test
    fun `host cannot list approve or reject pending members outside their club`() {
        val hostCookie = sessionCookieForEmail("host@example.com")
        val outsideEmail = uniqueEmail("outside.pending")
        val outsideMembershipId = insertPendingMemberOutsideClub(outsideEmail, "Outside Pending")
        val outsideRejectMembershipId = insertPendingMemberOutsideClub(uniqueEmail("outside.reject"), "Outside Reject")

        val listResponse = mockMvc.get("/api/host/members/pending-approvals") {
            cookie(hostCookie)
        }.andExpect {
            status { isOk() }
        }.andReturn().response.contentAsString
        assertFalse(listResponse.contains(outsideEmail))

        mockMvc.post("/api/host/members/$outsideMembershipId/approve") {
            cookie(hostCookie)
        }.andExpect {
            status { isNotFound() }
        }
        mockMvc.post("/api/host/members/$outsideRejectMembershipId/reject") {
            cookie(hostCookie)
        }.andExpect {
            status { isNotFound() }
        }

        assertEquals(
            "PENDING_APPROVAL",
            membershipStatus(outsideMembershipId),
        )
        assertEquals(
            "PENDING_APPROVAL",
            membershipStatus(outsideRejectMembershipId),
        )
    }

    private fun insertPendingMember(email: String, name: String): String {
        val userId = UUID.randomUUID().toString()
        val membershipId = UUID.randomUUID().toString()
        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, profile_image_url, auth_provider)
            values (?, ?, ?, ?, ?, null, 'GOOGLE')
            """.trimIndent(),
            userId,
            "google-pending-approval-$userId",
            email,
            name,
            name,
        )
        createdUserIds += userId
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at)
            values (?, '00000000-0000-0000-0000-000000000001', ?, 'MEMBER', 'PENDING_APPROVAL', null)
            """.trimIndent(),
            membershipId,
            userId,
        )
        createdMembershipIds += membershipId
        return membershipId
    }

    private fun insertPendingMemberOutsideClub(email: String, name: String): String {
        val clubId = UUID.randomUUID().toString()
        val slug = "outside-approval-${UUID.randomUUID()}"
        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about)
            values (?, ?, '다른 승인 클럽', '다른 승인 클럽', '다른 승인 클럽입니다.')
            """.trimIndent(),
            clubId,
            slug,
        )
        createdClubIds += clubId

        val userId = UUID.randomUUID().toString()
        val membershipId = UUID.randomUUID().toString()
        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, profile_image_url, auth_provider)
            values (?, ?, ?, ?, ?, null, 'GOOGLE')
            """.trimIndent(),
            userId,
            "google-outside-approval-$userId",
            email,
            name,
            name,
        )
        createdUserIds += userId
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at)
            values (?, ?, ?, 'MEMBER', 'PENDING_APPROVAL', null)
            """.trimIndent(),
            membershipId,
            clubId,
            userId,
        )
        createdMembershipIds += membershipId
        return membershipId
    }

    private fun createOpenSession(): String {
        val sessionId = UUID.randomUUID().toString()
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
              '승인 테스트 세션',
              '승인 테스트 책',
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
            userAgent = "HostMemberApprovalControllerTest",
            ipAddress = "127.0.0.1",
        )
        createdSessionTokenHashes += issuedSession.storedTokenHash
        return Cookie(AuthSessionService.COOKIE_NAME, issuedSession.rawToken)
    }

    private fun uniqueEmail(prefix: String): String =
        "$prefix.${UUID.randomUUID()}@example.com"

    private fun membershipStatus(membershipId: String): String =
        jdbcTemplate.queryForObject(
            "select status from memberships where id = ?",
            String::class.java,
            membershipId,
        ) ?: error("Expected membership status for $membershipId")

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
