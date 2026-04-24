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
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.patch
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
class MemberProfileControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val authSessionService: AuthSessionService,
) {
    private val createdSessionTokenHashes = linkedSetOf<String>()
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
            deleteWhereIn("clubs", "id", createdClubIds)
        } finally {
            createdSessionTokenHashes.clear()
            createdMembershipIds.clear()
            createdUserIds.clear()
            createdClubIds.clear()
        }
    }

    @Test
    fun `member updates own short name after trimming input`() {
        val email = insertProfileMember(
            "self.active",
            "ACTIVE",
            shortName = "Before",
            profileImageUrl = "https://cdn.example.test/profiles/self-active.png",
        )
        val cookie = sessionCookieForEmail(email)
        val membershipId = membershipIdForEmail(email)

        mockMvc.patch("/api/me/profile") {
            cookie(cookie)
            header("X-Readmates-Bff-Secret", "test-bff-secret")
            header("Origin", "http://localhost:3000")
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"shortName":"  After  "}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.membershipId") { value(membershipId) }
            jsonPath("$.displayName") { value("self.active") }
            jsonPath("$.shortName") { value("After") }
            jsonPath("$.profileImageUrl") { value("https://cdn.example.test/profiles/self-active.png") }
            jsonPath("$.authenticated") { doesNotExist() }
            jsonPath("$.email") { doesNotExist() }
            jsonPath("$.membershipStatus") { doesNotExist() }
        }

        assertEquals("After", shortNameForEmail(email))
    }

    @Test
    fun `viewer updates own short name`() {
        val email = insertProfileMember("self.viewer", "VIEWER", shortName = "ViewerBefore")
        val cookie = sessionCookieForEmail(email)

        mockMvc.patch("/api/me/profile") {
            cookie(cookie)
            header("X-Readmates-Bff-Secret", "test-bff-secret")
            header("Origin", "http://localhost:3000")
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"shortName":"ViewerAfter"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.shortName") { value("ViewerAfter") }
        }

        assertEquals("ViewerAfter", shortNameForEmail(email))
    }

    @Test
    fun `own profile update requires authentication with structured error`() {
        mockMvc.patch("/api/me/profile") {
            header("X-Readmates-Bff-Secret", "test-bff-secret")
            header("Origin", "http://localhost:3000")
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"shortName":"NoSession"}"""
        }.andExpect {
            status { isUnauthorized() }
            jsonPath("$.code") { value("AUTHENTICATION_REQUIRED") }
            jsonPath("$.message") { value("Authentication required") }
        }
    }

    @Test
    fun `left and inactive members receive membership not allowed for own profile updates`() {
        listOf("LEFT", "INACTIVE").forEach { status ->
            val email = insertProfileMember("self.${status.lowercase()}", status, shortName = "Blocked$status")

            mockMvc.patch("/api/me/profile") {
                with(user(email).roles("MEMBER"))
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("Origin", "http://localhost:3000")
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"shortName":"ShouldNotStore"}"""
            }.andExpect {
                status { isForbidden() }
                jsonPath("$.code") { value("MEMBERSHIP_NOT_ALLOWED") }
                jsonPath("$.message") { value("Membership is not allowed to edit profile") }
            }

            assertEquals("Blocked$status", shortNameForEmail(email))
        }
    }

    @Test
    fun `own profile short name validation returns structured errors`() {
        val email = insertProfileMember("self.validation", "ACTIVE", shortName = "Original")
        val cookie = sessionCookieForEmail(email)
        val cases = listOf(
            "" to "SHORT_NAME_REQUIRED",
            "   " to "SHORT_NAME_REQUIRED",
            "123456789012345678901" to "SHORT_NAME_TOO_LONG",
            "name@example.com" to "SHORT_NAME_INVALID",
            "https://example.com/me" to "SHORT_NAME_INVALID",
            "example.com" to "SHORT_NAME_INVALID",
            "line\nbreak" to "SHORT_NAME_INVALID",
            "관리자" to "SHORT_NAME_RESERVED",
        )

        cases.forEach { (shortName, code) ->
            mockMvc.patch("/api/me/profile") {
                cookie(cookie)
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("Origin", "http://localhost:3000")
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"shortName":${jsonString(shortName)}}"""
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value(code) }
            }
        }

        assertEquals("Original", shortNameForEmail(email))
    }

    @Test
    fun `duplicate own short name is rejected within same club except current value`() {
        val email = insertProfileMember("self.duplicate", "ACTIVE", shortName = "Mine")
        insertProfileMember("self.taken", "ACTIVE", shortName = "Taken")
        val cookie = sessionCookieForEmail(email)

        mockMvc.patch("/api/me/profile") {
            cookie(cookie)
            header("X-Readmates-Bff-Secret", "test-bff-secret")
            header("Origin", "http://localhost:3000")
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"shortName":"Taken"}"""
        }.andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("SHORT_NAME_DUPLICATE") }
        }

        mockMvc.patch("/api/me/profile") {
            cookie(cookie)
            header("X-Readmates-Bff-Secret", "test-bff-secret")
            header("Origin", "http://localhost:3000")
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"shortName":"Mine"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.shortName") { value("Mine") }
        }
    }

    @Test
    fun `host updates same club member profile and receives host member list item`() {
        val hostCookie = sessionCookieForEmail("host@example.com")
        val targetMembershipIds = listOf("VIEWER", "ACTIVE", "SUSPENDED", "LEFT", "INACTIVE")
            .map { status -> status to membershipIdForEmail(insertProfileMember("host.${status.lowercase()}", status)) }

        targetMembershipIds.forEach { (status, membershipId) ->
            val newShortName = "Host$status".take(20)

            mockMvc.patch("/api/host/members/$membershipId/profile") {
                cookie(hostCookie)
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("Origin", "http://localhost:3000")
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"shortName":"$newShortName"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.membershipId") { value(membershipId) }
                jsonPath("$.shortName") { value(newShortName) }
                jsonPath("$.status") { value(status) }
                jsonPath("$.canDeactivate") { exists() }
            }

            assertEquals(newShortName, shortNameForMembership(membershipId))
        }
    }

    @Test
    fun `host profile update requires active host role`() {
        val memberCookie = sessionCookieForEmail("member5@example.com")
        val targetMembershipId = membershipIdForEmail(insertProfileMember("host.blocked", "ACTIVE", shortName = "Blocked"))

        mockMvc.patch("/api/host/members/$targetMembershipId/profile") {
            cookie(memberCookie)
            header("X-Readmates-Bff-Secret", "test-bff-secret")
            header("Origin", "http://localhost:3000")
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"shortName":"ShouldNotStore"}"""
        }.andExpect {
            status { isForbidden() }
            jsonPath("$.code") { value("HOST_ROLE_REQUIRED") }
        }

        assertEquals("Blocked", shortNameForMembership(targetMembershipId))
    }

    @Test
    fun `host profile update requires authentication with structured error`() {
        val targetMembershipId = membershipIdForEmail(insertProfileMember("host.anonymous", "ACTIVE", shortName = "Blocked"))

        mockMvc.patch("/api/host/members/$targetMembershipId/profile") {
            header("X-Readmates-Bff-Secret", "test-bff-secret")
            header("Origin", "http://localhost:3000")
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"shortName":"NoSession"}"""
        }.andExpect {
            status { isUnauthorized() }
            jsonPath("$.code") { value("AUTHENTICATION_REQUIRED") }
            jsonPath("$.message") { value("Authentication required") }
        }

        assertEquals("Blocked", shortNameForMembership(targetMembershipId))
    }

    @Test
    fun `host profile update is scoped to current club`() {
        val hostCookie = sessionCookieForEmail("host@example.com")
        val outsideMembershipId = membershipIdForEmail(
            insertProfileMemberOutsideClub("outside.profile", "ACTIVE", shortName = "Outside"),
        )

        mockMvc.patch("/api/host/members/$outsideMembershipId/profile") {
            cookie(hostCookie)
            header("X-Readmates-Bff-Secret", "test-bff-secret")
            header("Origin", "http://localhost:3000")
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"shortName":"ShouldNotStore"}"""
        }.andExpect {
            status { isNotFound() }
            jsonPath("$.code") { value("MEMBER_NOT_FOUND") }
        }

        assertEquals("Outside", shortNameForMembership(outsideMembershipId))
    }

    private fun insertProfileMember(
        prefix: String,
        status: String,
        shortName: String = prefix,
        profileImageUrl: String? = null,
    ): String {
        val userId = UUID.randomUUID().toString()
        val membershipId = UUID.randomUUID().toString()
        val email = "$prefix.${UUID.randomUUID()}@example.com"
        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, profile_image_url, auth_provider)
            values (?, ?, ?, ?, ?, ?, 'GOOGLE')
            """.trimIndent(),
            userId,
            "google-profile-$userId",
            email,
            prefix,
            shortName,
            profileImageUrl,
        )
        createdUserIds += userId
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at)
            values (?, '00000000-0000-0000-0000-000000000001', ?, 'MEMBER', ?, utc_timestamp(6))
            """.trimIndent(),
            membershipId,
            userId,
            status,
        )
        createdMembershipIds += membershipId
        return email
    }

    private fun insertProfileMemberOutsideClub(prefix: String, status: String, shortName: String): String {
        val clubId = UUID.randomUUID().toString()
        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about)
            values (?, ?, '다른 프로필 클럽', '다른 프로필 클럽', '다른 프로필 클럽입니다.')
            """.trimIndent(),
            clubId,
            "outside-profile-${UUID.randomUUID()}",
        )
        createdClubIds += clubId

        val userId = UUID.randomUUID().toString()
        val membershipId = UUID.randomUUID().toString()
        val email = "$prefix.${UUID.randomUUID()}@example.com"
        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, profile_image_url, auth_provider)
            values (?, ?, ?, ?, ?, null, 'GOOGLE')
            """.trimIndent(),
            userId,
            "google-outside-profile-$userId",
            email,
            prefix,
            shortName,
        )
        createdUserIds += userId
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at)
            values (?, ?, ?, 'MEMBER', ?, utc_timestamp(6))
            """.trimIndent(),
            membershipId,
            clubId,
            userId,
            status,
        )
        createdMembershipIds += membershipId
        return email
    }

    private fun sessionCookieForEmail(email: String): Cookie {
        val userId = jdbcTemplate.queryForObject(
            "select id from users where email = ?",
            String::class.java,
            email,
        ) ?: error("Expected seeded user for $email")
        val issuedSession = authSessionService.issueSession(
            userId = userId,
            userAgent = "MemberProfileControllerTest",
            ipAddress = "127.0.0.1",
        )
        createdSessionTokenHashes += issuedSession.storedTokenHash
        return Cookie(AuthSessionService.COOKIE_NAME, issuedSession.rawToken)
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

    private fun shortNameForEmail(email: String): String =
        jdbcTemplate.queryForObject(
            "select short_name from users where email = ?",
            String::class.java,
            email,
        ) ?: error("Expected short name for $email")

    private fun shortNameForMembership(membershipId: String): String =
        jdbcTemplate.queryForObject(
            """
            select users.short_name
            from memberships
            join users on users.id = memberships.user_id
            where memberships.id = ?
            """.trimIndent(),
            String::class.java,
            membershipId,
        ) ?: error("Expected short name for $membershipId")

    private fun jsonString(value: String): String =
        "\"${value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n")}\""

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
