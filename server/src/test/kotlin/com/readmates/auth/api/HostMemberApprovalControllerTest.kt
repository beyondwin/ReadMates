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
    fun `host lists viewer members`() {
        val hostCookie = sessionCookieForEmail("host@example.com")
        val viewerEmail = uniqueEmail("viewer.list")
        insertViewerMember(viewerEmail, "Viewer List")

        mockMvc.get("/api/host/members/viewers") {
            cookie(hostCookie)
        }.andExpect {
            status { isOk() }
            jsonPath("$[0].email") { value(viewerEmail) }
            jsonPath("$[0].status") { value("VIEWER") }
        }
    }

    @Test
    fun `host activates viewer member and adds them to current session`() {
        val hostCookie = sessionCookieForEmail("host@example.com")
        val sessionId = createOpenSession()
        val membershipId = insertViewerMember(uniqueEmail("viewer.activate"), "Viewer Activate")

        mockMvc.post("/api/host/members/$membershipId/activate") {
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
            select rsvp_status, attendance_status, participation_status
            from session_participants
            where session_id = ?
              and membership_id = ?
            """.trimIndent(),
            sessionId,
            membershipId,
        )
        assertEquals("NO_RESPONSE", participant["rsvp_status"])
        assertEquals("UNKNOWN", participant["attendance_status"])
        assertEquals("ACTIVE", participant["participation_status"])
    }

    @Test
    fun `host deactivates viewer member`() {
        val hostCookie = sessionCookieForEmail("host@example.com")
        val membershipId = insertViewerMember(uniqueEmail("viewer.deactivate"), "Viewer Deactivate")

        mockMvc.post("/api/host/members/$membershipId/deactivate-viewer") {
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
    fun `compatibility aliases list approve and reject viewer members`() {
        val hostCookie = sessionCookieForEmail("host@example.com")
        val approvedMembershipId = insertViewerMember(uniqueEmail("viewer.alias.approve"), "Viewer Alias Approve")
        val rejectedMembershipId = insertViewerMember(uniqueEmail("viewer.alias.reject"), "Viewer Alias Reject")

        mockMvc.get("/api/host/members/pending-approvals") {
            cookie(hostCookie)
        }.andExpect {
            status { isOk() }
        }

        mockMvc.post("/api/host/members/$approvedMembershipId/approve") {
            cookie(hostCookie)
        }.andExpect {
            status { isOk() }
            jsonPath("$.status") { value("ACTIVE") }
        }

        mockMvc.post("/api/host/members/$rejectedMembershipId/reject") {
            cookie(hostCookie)
        }.andExpect {
            status { isOk() }
            jsonPath("$.status") { value("INACTIVE") }
        }

        assertEquals("ACTIVE", membershipStatus(approvedMembershipId))
        assertEquals("INACTIVE", membershipStatus(rejectedMembershipId))
    }

    @Test
    fun `member cannot list viewer members`() {
        val memberCookie = sessionCookieForEmail("member5@example.com")

        mockMvc.get("/api/host/members/viewers") {
            cookie(memberCookie)
        }.andExpect {
            status { isForbidden() }
        }
    }

    @Test
    fun `member cannot activate or deactivate viewer members`() {
        val memberCookie = sessionCookieForEmail("member5@example.com")
        val activateMembershipId = insertViewerMember(uniqueEmail("member.blocked.activate"), "Blocked Activate")
        val deactivateMembershipId = insertViewerMember(uniqueEmail("member.blocked.deactivate"), "Blocked Deactivate")

        mockMvc.post("/api/host/members/$activateMembershipId/activate") {
            cookie(memberCookie)
        }.andExpect {
            status { isForbidden() }
        }
        mockMvc.post("/api/host/members/$deactivateMembershipId/deactivate-viewer") {
            cookie(memberCookie)
        }.andExpect {
            status { isForbidden() }
        }

        assertEquals("VIEWER", membershipStatus(activateMembershipId))
        assertEquals("VIEWER", membershipStatus(deactivateMembershipId))
    }

    @Test
    fun `host cannot list activate or deactivate viewer members outside their club`() {
        val hostCookie = sessionCookieForEmail("host@example.com")
        val outsideEmail = uniqueEmail("outside.viewer")
        val outsideMembershipId = insertViewerMemberOutsideClub(outsideEmail, "Outside Viewer")
        val outsideDeactivateMembershipId = insertViewerMemberOutsideClub(uniqueEmail("outside.deactivate"), "Outside Deactivate")

        val listResponse = mockMvc.get("/api/host/members/viewers") {
            cookie(hostCookie)
        }.andExpect {
            status { isOk() }
        }.andReturn().response.contentAsString
        assertFalse(listResponse.contains(outsideEmail))

        mockMvc.post("/api/host/members/$outsideMembershipId/activate") {
            cookie(hostCookie)
        }.andExpect {
            status { isNotFound() }
        }
        mockMvc.post("/api/host/members/$outsideDeactivateMembershipId/deactivate-viewer") {
            cookie(hostCookie)
        }.andExpect {
            status { isNotFound() }
        }

        assertEquals(
            "VIEWER",
            membershipStatus(outsideMembershipId),
        )
        assertEquals(
            "VIEWER",
            membershipStatus(outsideDeactivateMembershipId),
        )
    }

    private fun insertViewerMember(email: String, name: String): String {
        val userId = UUID.randomUUID().toString()
        val membershipId = UUID.randomUUID().toString()
        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, profile_image_url, auth_provider)
            values (?, ?, ?, ?, ?, null, 'GOOGLE')
            """.trimIndent(),
            userId,
            "google-viewer-$userId",
            email,
            name,
            name,
        )
        createdUserIds += userId
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at)
            values (?, '00000000-0000-0000-0000-000000000001', ?, 'MEMBER', 'VIEWER', null)
            """.trimIndent(),
            membershipId,
            userId,
        )
        createdMembershipIds += membershipId
        return membershipId
    }

    private fun insertViewerMemberOutsideClub(email: String, name: String): String {
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
            "google-outside-viewer-$userId",
            email,
            name,
            name,
        )
        createdUserIds += userId
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at)
            values (?, ?, ?, 'MEMBER', 'VIEWER', null)
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
