package com.readmates.auth.api

import com.readmates.auth.application.AuthSessionService
import com.readmates.support.MySqlTestContainer
import jakarta.servlet.http.Cookie
import javax.sql.DataSource
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
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
class HostMemberLifecycleControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val authSessionService: AuthSessionService,
    @param:Autowired private val dataSource: DataSource,
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
    fun `host lists members with current session participation flags`() {
        val hostCookie = sessionCookieForEmail("host@example.com")
        val sessionId = createOpenSession()
        val activeMembershipId = insertLifecycleMember("active.list", "ACTIVE")
        addParticipant(sessionId, activeMembershipId, "ACTIVE")

        mockMvc.get("/api/host/members") {
            cookie(hostCookie)
            header("X-Readmates-Bff-Secret", "test-bff-secret")
            header("Origin", "http://localhost:3000")
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.items[?(@.membershipId == '$activeMembershipId')].status") { value("ACTIVE") }
                jsonPath("$.items[?(@.membershipId == '$activeMembershipId')].currentSessionParticipationStatus") {
                    value("ACTIVE")
                }
                jsonPath("$.items[?(@.membershipId == '$activeMembershipId')].canSuspend") { value(true) }
                jsonPath("$.items[?(@.membershipId == '$activeMembershipId')].canRemoveFromCurrentSession") { value(true) }
            }
    }

    @Test
    fun `host members list returns paged contract`() {
        val hostCookie = sessionCookieForEmail("host@example.com")
        repeat(3) { index ->
            insertLifecycleMember("paged.members.$index", "ACTIVE")
        }

        mockMvc.get("/api/host/members") {
            cookie(hostCookie)
            header("X-Readmates-Bff-Secret", "test-bff-secret")
            header("Origin", "http://localhost:3000")
            param("limit", "2")
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.items.length()") { value(2) }
                jsonPath("$.nextCursor") { exists() }
            }
    }

    @Test
    fun `host suspends member and removes from current session when apply now`() {
        val hostCookie = sessionCookieForEmail("host@example.com")
        val sessionId = createOpenSession()
        val membershipId = insertLifecycleMember("suspend.now", "ACTIVE")
        addParticipant(sessionId, membershipId, "ACTIVE")

        mockMvc.post("/api/host/members/$membershipId/suspend") {
            cookie(hostCookie)
            header("X-Readmates-Bff-Secret", "test-bff-secret")
            header("Origin", "http://localhost:3000")
            contentType = MediaType.APPLICATION_JSON
            content = """{"currentSessionPolicy":"APPLY_NOW"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.member.status") { value("SUSPENDED") }
            jsonPath("$.currentSessionPolicyResult") { value("APPLIED") }
        }

        assertEquals("SUSPENDED", membershipStatus(membershipId))
        assertEquals("REMOVED", participationStatus(sessionId, membershipId))
    }

    @Test
    fun `next session suspend leaves current participant active`() {
        val hostCookie = sessionCookieForEmail("host@example.com")
        val sessionId = createOpenSession()
        val membershipId = insertLifecycleMember("suspend.next", "ACTIVE")
        addParticipant(sessionId, membershipId, "ACTIVE")

        mockMvc.post("/api/host/members/$membershipId/suspend") {
            cookie(hostCookie)
            header("X-Readmates-Bff-Secret", "test-bff-secret")
            header("Origin", "http://localhost:3000")
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"currentSessionPolicy":"NEXT_SESSION"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.member.status") { value("SUSPENDED") }
            jsonPath("$.currentSessionPolicyResult") { value("DEFERRED") }
        }

        assertEquals("SUSPENDED", membershipStatus(membershipId))
        assertEquals("ACTIVE", participationStatus(sessionId, membershipId))
    }

    @Test
    fun `host restores suspended member without current session auto add`() {
        val hostCookie = sessionCookieForEmail("host@example.com")
        val sessionId = createOpenSession()
        val membershipId = insertLifecycleMember("restore", "SUSPENDED")

        mockMvc.post("/api/host/members/$membershipId/restore") {
            cookie(hostCookie)
            header("X-Readmates-Bff-Secret", "test-bff-secret")
            header("Origin", "http://localhost:3000")
            with(csrf())
        }.andExpect {
            status { isOk() }
            jsonPath("$.member.status") { value("ACTIVE") }
            jsonPath("$.member.currentSessionParticipationStatus") { doesNotExist() }
            jsonPath("$.currentSessionPolicyResult") { value("NOT_APPLICABLE") }
        }

        assertEquals("ACTIVE", membershipStatus(membershipId))
        assertEquals(null, participationStatusOrNull(sessionId, membershipId))
    }

    @Test
    fun `host deactivates member to left and removes from current session when apply now`() {
        val hostCookie = sessionCookieForEmail("host@example.com")
        val sessionId = createOpenSession()
        val membershipId = insertLifecycleMember("deactivate.now", "ACTIVE")
        addParticipant(sessionId, membershipId, "ACTIVE")

        mockMvc.post("/api/host/members/$membershipId/deactivate") {
            cookie(hostCookie)
            header("X-Readmates-Bff-Secret", "test-bff-secret")
            header("Origin", "http://localhost:3000")
            with(csrf())
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
    fun `current session add is idempotent for active members`() {
        val hostCookie = sessionCookieForEmail("host@example.com")
        val sessionId = createOpenSession()
        val membershipId = insertLifecycleMember("session.add", "ACTIVE")
        addParticipant(sessionId, membershipId, "REMOVED")

        repeat(2) {
            mockMvc.post("/api/host/members/$membershipId/current-session/add") {
                cookie(hostCookie)
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("Origin", "http://localhost:3000")
                with(csrf())
            }.andExpect {
                status { isOk() }
                jsonPath("$.member.currentSessionParticipationStatus") { value("ACTIVE") }
                jsonPath("$.currentSessionPolicyResult") { value("APPLIED") }
            }
        }

        assertEquals(1, participantCount(sessionId, membershipId))
        assertEquals("ACTIVE", participationStatus(sessionId, membershipId))
    }

    @Test
    fun `current session remove is idempotent and marks removed`() {
        val hostCookie = sessionCookieForEmail("host@example.com")
        val sessionId = createOpenSession()
        val membershipId = insertLifecycleMember("session.remove", "ACTIVE")
        addParticipant(sessionId, membershipId, "ACTIVE")

        repeat(2) {
            mockMvc.post("/api/host/members/$membershipId/current-session/remove") {
                cookie(hostCookie)
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("Origin", "http://localhost:3000")
                with(csrf())
            }.andExpect {
                status { isOk() }
                jsonPath("$.member.currentSessionParticipationStatus") { value("REMOVED") }
                jsonPath("$.currentSessionPolicyResult") { value("APPLIED") }
            }
        }

        assertEquals(1, participantCount(sessionId, membershipId))
        assertEquals("REMOVED", participationStatus(sessionId, membershipId))
    }

    @Test
    fun `current session remove creates removed participant row for missing active member`() {
        val hostCookie = sessionCookieForEmail("host@example.com")
        val sessionId = createOpenSession()
        val membershipId = insertLifecycleMember("session.remove.missing", "ACTIVE")

        assertEquals(null, participationStatusOrNull(sessionId, membershipId))

        mockMvc.post("/api/host/members/$membershipId/current-session/remove") {
            cookie(hostCookie)
            header("X-Readmates-Bff-Secret", "test-bff-secret")
            header("Origin", "http://localhost:3000")
            with(csrf())
        }.andExpect {
            status { isOk() }
            jsonPath("$.member.currentSessionParticipationStatus") { value("REMOVED") }
            jsonPath("$.currentSessionPolicyResult") { value("APPLIED") }
        }

        assertEquals(1, participantCount(sessionId, membershipId))
        assertEquals("REMOVED", participationStatus(sessionId, membershipId))
    }

    @Test
    fun `current session add returns conflict for non active members`() {
        val hostCookie = sessionCookieForEmail("host@example.com")
        createOpenSession()
        val suspendedMembershipId = insertLifecycleMember("session.add.suspended", "SUSPENDED")
        val leftMembershipId = insertLifecycleMember("session.add.left", "LEFT")
        val inactiveMembershipId = insertLifecycleMember("session.add.inactive", "INACTIVE")

        listOf(suspendedMembershipId, leftMembershipId, inactiveMembershipId).forEach { membershipId ->
            mockMvc.post("/api/host/members/$membershipId/current-session/add") {
                cookie(hostCookie)
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("Origin", "http://localhost:3000")
                with(csrf())
            }.andExpect {
                status { isConflict() }
            }
        }
    }

    @Test
    fun `member cannot call host lifecycle endpoints`() {
        val memberCookie = sessionCookieForEmail("member5@example.com")
        val membershipId = insertLifecycleMember("member.blocked.lifecycle", "ACTIVE")

        mockMvc.post("/api/host/members/$membershipId/suspend") {
            cookie(memberCookie)
            header("X-Readmates-Bff-Secret", "test-bff-secret")
            header("Origin", "http://localhost:3000")
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"currentSessionPolicy":"APPLY_NOW"}"""
        }.andExpect {
            status { isForbidden() }
        }

        assertEquals("ACTIVE", membershipStatus(membershipId))
    }

    @Test
    fun `host cannot mutate a membership outside their club`() {
        val hostCookie = sessionCookieForEmail("host@example.com")
        val membershipId = insertLifecycleMemberOutsideClub("outside.lifecycle", "ACTIVE")

        mockMvc.post("/api/host/members/$membershipId/suspend") {
            cookie(hostCookie)
            header("X-Readmates-Bff-Secret", "test-bff-secret")
            header("Origin", "http://localhost:3000")
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"currentSessionPolicy":"APPLY_NOW"}"""
        }.andExpect {
            status { isNotFound() }
        }

        assertEquals("ACTIVE", membershipStatus(membershipId))
    }

    @Test
    fun `host cannot mutate self`() {
        val hostCookie = sessionCookieForEmail("host@example.com")
        val hostMembershipId = membershipIdForEmail("host@example.com")

        mockMvc.post("/api/host/members/$hostMembershipId/deactivate") {
            cookie(hostCookie)
            header("X-Readmates-Bff-Secret", "test-bff-secret")
            header("Origin", "http://localhost:3000")
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"currentSessionPolicy":"APPLY_NOW"}"""
        }.andExpect {
            status { isConflict() }
        }

        assertEquals("ACTIVE", membershipStatus(hostMembershipId))
    }

    @Test
    fun `last active host cannot be deactivated or suspended`() {
        val hostCookie = sessionCookieForEmail("host@example.com")
        val hostMembershipId = membershipIdForEmail("host@example.com")

        mockMvc.post("/api/host/members/$hostMembershipId/suspend") {
            cookie(hostCookie)
            header("X-Readmates-Bff-Secret", "test-bff-secret")
            header("Origin", "http://localhost:3000")
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"currentSessionPolicy":"APPLY_NOW"}"""
        }.andExpect {
            status { isConflict() }
        }

        mockMvc.post("/api/host/members/$hostMembershipId/deactivate") {
            cookie(hostCookie)
            header("X-Readmates-Bff-Secret", "test-bff-secret")
            header("Origin", "http://localhost:3000")
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"currentSessionPolicy":"APPLY_NOW"}"""
        }.andExpect {
            status { isConflict() }
        }

        assertEquals("ACTIVE", membershipStatus(hostMembershipId))
    }

    @Test
    fun `current session add waits for membership lifecycle lock before activating participant`() {
        val hostCookie = sessionCookieForEmail("host@example.com")
        val sessionId = createOpenSession()
        val membershipId = insertLifecycleMember("session.add.race", "ACTIVE")
        addParticipant(sessionId, membershipId, "REMOVED")
        val executor = Executors.newSingleThreadExecutor()

        dataSource.connection.use { connection ->
            connection.autoCommit = false
            try {
                connection.prepareStatement(
                    """
                    select id
                    from memberships
                    where id = ?
                    for update
                    """.trimIndent(),
                ).use { statement ->
                    statement.setString(1, membershipId)
                    statement.executeQuery().use { resultSet ->
                        resultSet.next()
                    }
                }

                val addStatus = executor.submit<Int> {
                    mockMvc.post("/api/host/members/$membershipId/current-session/add") {
                        cookie(hostCookie)
                        header("X-Readmates-Bff-Secret", "test-bff-secret")
                        header("Origin", "http://localhost:3000")
                    }.andReturn().response.status
                }

                Thread.sleep(200)
                connection.prepareStatement(
                    """
                    update memberships
                    set status = 'SUSPENDED',
                        updated_at = utc_timestamp(6)
                    where id = ?
                    """.trimIndent(),
                ).use { statement ->
                    statement.setString(1, membershipId)
                    statement.executeUpdate()
                }
                connection.commit()

                assertEquals(409, addStatus.get(5, TimeUnit.SECONDS))
            } finally {
                runCatching { connection.rollback() }
                executor.shutdownNow()
            }
        }

        assertEquals("SUSPENDED", membershipStatus(membershipId))
        assertEquals("REMOVED", participationStatus(sessionId, membershipId))
    }

    private fun insertLifecycleMember(prefix: String, status: String, role: String = "MEMBER"): String {
        val userId = UUID.randomUUID().toString()
        val membershipId = UUID.randomUUID().toString()
        val email = uniqueEmail(prefix)
        val name = prefix.replace('.', ' ').replaceFirstChar { it.uppercaseChar() }
        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, profile_image_url, auth_provider)
            values (?, ?, ?, ?, ?, null, 'GOOGLE')
            """.trimIndent(),
            userId,
            "google-lifecycle-$userId",
            email,
            name,
            name,
        )
        createdUserIds += userId
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name)
            values (?, '00000000-0000-0000-0000-000000000001', ?, ?, ?, utc_timestamp(6), ?)
            """.trimIndent(),
            membershipId,
            userId,
            role,
            status,
            name,
        )
        createdMembershipIds += membershipId
        return membershipId
    }

    private fun insertLifecycleMemberOutsideClub(prefix: String, status: String): String {
        val clubId = UUID.randomUUID().toString()
        val slug = "outside-lifecycle-${UUID.randomUUID()}"
        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about)
            values (?, ?, '다른 생명주기 클럽', '다른 생명주기 클럽', '다른 생명주기 클럽입니다.')
            """.trimIndent(),
            clubId,
            slug,
        )
        createdClubIds += clubId

        val userId = UUID.randomUUID().toString()
        val membershipId = UUID.randomUUID().toString()
        val email = uniqueEmail(prefix)
        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, profile_image_url, auth_provider)
            values (?, ?, ?, ?, ?, null, 'GOOGLE')
            """.trimIndent(),
            userId,
            "google-outside-lifecycle-$userId",
            email,
            prefix,
            prefix,
        )
        createdUserIds += userId
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name)
            values (?, ?, ?, 'MEMBER', ?, utc_timestamp(6), ?)
            """.trimIndent(),
            membershipId,
            clubId,
            userId,
            status,
            prefix,
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
              '멤버 생명주기 테스트 세션',
              '멤버 생명주기 테스트 책',
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

    private fun addParticipant(sessionId: String, membershipId: String, participationStatus: String) {
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
              ?
            )
            """.trimIndent(),
            UUID.randomUUID().toString(),
            sessionId,
            membershipId,
            participationStatus,
        )
    }

    private fun sessionCookieForEmail(email: String): Cookie {
        val userId = jdbcTemplate.queryForObject(
            "select id from users where email = ?",
            String::class.java,
            email,
        ) ?: error("Expected seeded user for $email")
        val issuedSession = authSessionService.issueSession(
            userId = userId,
            userAgent = "HostMemberLifecycleControllerTest",
            ipAddress = "127.0.0.1",
        )
        createdSessionTokenHashes += issuedSession.storedTokenHash
        return Cookie(AuthSessionService.COOKIE_NAME, issuedSession.rawToken)
    }

    private fun uniqueEmail(prefix: String): String =
        "$prefix.${UUID.randomUUID()}@example.com"

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
        participationStatusOrNull(sessionId, membershipId)
            ?: error("Expected participant for $sessionId and $membershipId")

    private fun participationStatusOrNull(sessionId: String, membershipId: String): String? =
        jdbcTemplate.query(
            """
            select participation_status
            from session_participants
            where session_id = ?
              and membership_id = ?
            """.trimIndent(),
            { resultSet, _ -> resultSet.getString("participation_status") },
            sessionId,
            membershipId,
        ).firstOrNull()

    private fun participantCount(sessionId: String, membershipId: String): Int =
        jdbcTemplate.queryForObject(
            """
            select count(*)
            from session_participants
            where session_id = ?
              and membership_id = ?
            """.trimIndent(),
            Int::class.java,
            sessionId,
            membershipId,
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
