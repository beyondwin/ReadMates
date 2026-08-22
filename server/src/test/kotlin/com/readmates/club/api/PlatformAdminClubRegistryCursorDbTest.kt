package com.readmates.club.api

import com.jayway.jsonpath.JsonPath
import com.readmates.auth.application.service.AuthSessionService
import com.readmates.club.application.model.ClubRegistrySearch
import com.readmates.club.application.service.PlatformAdminClubListCursorClaims
import com.readmates.club.application.service.PlatformAdminClubListCursorFilter
import com.readmates.club.application.service.PlatformAdminClubRegistryCursorSigner
import com.readmates.club.domain.ClubDomainStatus
import com.readmates.club.domain.ClubPublicVisibility
import com.readmates.club.domain.ClubStatus
import com.readmates.shared.paging.CursorCodec
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import jakarta.servlet.http.Cookie
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import java.time.Instant
import java.util.UUID

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@AutoConfigureMockMvc
@Tag("integration")
class PlatformAdminClubRegistryCursorDbTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val authSessionService: AuthSessionService,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val cursorSigner: PlatformAdminClubRegistryCursorSigner,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val createdSessionTokenHashes = linkedSetOf<String>()
    private val createdPlatformAdminUserIds = linkedSetOf<String>()
    private val createdUserIds = linkedSetOf<String>()
    private val createdClubDomainIds = linkedSetOf<String>()
    private val createdMembershipIds = linkedSetOf<String>()
    private val createdClubIds = linkedSetOf<String>()
    private val createdInvitationIds = linkedSetOf<String>()
    private val fixturePrefix = "Zzz Cursor ${UUID.randomUUID().toString().take(8)}"

    @AfterEach
    fun cleanupCreatedRows() {
        try {
            deleteWhereIn("invitations", "id", createdInvitationIds)
            deleteWhereIn("club_domains", "id", createdClubDomainIds)
            deleteWhereIn("memberships", "id", createdMembershipIds)
            deleteWhereIn("auth_sessions", "session_token_hash", createdSessionTokenHashes)
            deleteWhereIn("auth_sessions", "user_id", createdUserIds)
            deleteWhereIn("platform_admins", "user_id", createdPlatformAdminUserIds)
            deleteWhereIn("users", "id", createdUserIds)
            deleteWhereIn("clubs", "id", createdClubIds)
        } finally {
            createdSessionTokenHashes.clear()
            createdPlatformAdminUserIds.clear()
            createdUserIds.clear()
            createdClubDomainIds.clear()
            createdMembershipIds.clear()
            createdClubIds.clear()
            createdInvitationIds.clear()
            SecurityContextHolder.clearContext()
        }
    }

    @Test
    fun `search normalizes unicode case and whitespace`() {
        val admin = createPlatformAdminUser()
        val clubId = createClub(name = "$fixturePrefix Café Club")

        val response =
            listClubs(
                admin = admin,
                search = "  Cafe\u0301   club  ",
            )

        assertThat(clubIds(response)).contains(clubId)
    }

    @Test
    fun `each filter and conjunction is pushed down`() {
        val admin = createPlatformAdminUser()
        val matching =
            createClub(
                name = "$fixturePrefix Active Public",
                status = ClubStatus.ACTIVE,
                visibility = ClubPublicVisibility.PUBLIC,
            )
        createDomain(matching, ClubDomainStatus.ACTION_REQUIRED)
        assignHost(matching)
        val other =
            createClub(
                name = "$fixturePrefix Setup Private",
                status = ClubStatus.SETUP_REQUIRED,
                visibility = ClubPublicVisibility.PRIVATE,
            )
        createDomain(other, ClubDomainStatus.ACTIVE)

        val filtered =
            listClubs(
                admin = admin,
                search = fixturePrefix,
                lifecycle = "ACTIVE",
                visibility = "PUBLIC",
                domainStatus = "ACTION_REQUIRED",
                onboardingState = "ASSIGNED",
            )

        assertThat(clubIds(filtered)).containsExactly(matching)

        val invited = createClub(name = "$fixturePrefix Invited")
        createHostInvitation(invited, admin)
        val missing = createClub(name = "$fixturePrefix Missing Host")
        assertThat(clubIds(listClubs(admin = admin, search = fixturePrefix, onboardingState = "INVITED")))
            .containsExactly(invited)
        assertThat(clubIds(listClubs(admin = admin, search = fixturePrefix, onboardingState = "MISSING")))
            .contains(missing)
            .doesNotContain(matching, invited)
    }

    @Test
    fun `equal normalized names are ordered by club id without gaps or duplicates`() {
        val admin = createPlatformAdminUser()
        val laterId = UUID.fromString("ffffffff-ffff-4fff-8fff-${uniqueHex(12)}")
        val earlierId = UUID.fromString("00000000-0000-4000-8000-${uniqueHex(12)}")
        val name = "$fixturePrefix Twin"
        createClub(name = name, clubId = laterId)
        createClub(name = "  $name  ", clubId = earlierId)

        val first = listClubs(admin = admin, search = fixturePrefix, limit = 1)
        val second = listClubs(admin = admin, search = fixturePrefix, limit = 1, cursor = nextCursor(first))

        assertThat(clubIds(first)).containsExactly(earlierId.toString())
        assertThat(clubIds(second)).containsExactly(laterId.toString())
        assertThat(clubIds(first)).doesNotContainAnyElementsOf(clubIds(second))
    }

    @Test
    fun `pages past one hundred clubs without gaps or duplicates`() {
        val admin = createPlatformAdminUser()
        val expected =
            (1..110).map { index ->
                createClub(name = "$fixturePrefix ${index.toString().padStart(3, '0')}")
            }

        val seen = linkedSetOf<String>()
        var cursor: String? = null
        do {
            val page = listClubs(admin = admin, search = fixturePrefix, limit = 20, cursor = cursor)
            val ids = clubIds(page)
            assertThat(ids).isEqualTo(ids.distinct())
            assertThat(seen.intersect(ids.toSet())).isEmpty()
            seen += ids
            cursor = nextCursor(page)
        } while (cursor != null)

        assertThat(seen).containsExactlyElementsOf(expected)
        assertThat(seen).hasSize(110)
    }

    @Test
    fun `cursor tamper expiry and filter mismatch fail closed`() {
        val admin = createPlatformAdminUser()
        repeat(3) { index -> createClub(name = "$fixturePrefix ${index.toString().padStart(3, '0')}") }
        val page = listClubs(admin = admin, search = fixturePrefix, limit = 1)
        val cursor = checkNotNull(nextCursor(page))

        mockMvc
            .get("/api/admin/clubs") {
                cookie(sessionCookieForUser(admin))
                param("search", fixturePrefix)
                param("limit", "1")
                param("cursor", cursor.dropLast(1) + if (cursor.last() == 'A') 'B' else 'A')
            }.andExpect { status { isBadRequest() } }

        mockMvc
            .get("/api/admin/clubs") {
                cookie(sessionCookieForUser(admin))
                param("search", "$fixturePrefix other")
                param("limit", "1")
                param("cursor", cursor)
            }.andExpect { status { isBadRequest() } }

        mockMvc
            .get("/api/admin/clubs") {
                cookie(sessionCookieForUser(admin))
                param("search", fixturePrefix)
                param("limit", "1")
                param(
                    "cursor",
                    checkNotNull(CursorCodec.encode(mapOf("n" to "alpha", "id" to UUID.randomUUID().toString()))),
                )
            }.andExpect { status { isBadRequest() } }

        val expired =
            cursorSigner.encode(
                PlatformAdminClubListCursorClaims(
                    schemaVersion = 1,
                    filter =
                        PlatformAdminClubListCursorFilter(
                            search = ClubRegistrySearch.normalize(fixturePrefix),
                            lifecycle = null,
                            visibility = null,
                            domainStatus = null,
                            onboardingState = null,
                        ),
                    lastNormalizedName = "alpha",
                    lastClubId = UUID.fromString(clubIds(page).first()),
                    issuedAt = Instant.parse("2020-01-01T00:00:00Z"),
                    expiresAt = Instant.parse("2020-01-01T01:00:00Z"),
                    keyVersion = 1,
                ),
            )
        mockMvc
            .get("/api/admin/clubs") {
                cookie(sessionCookieForUser(admin))
                param("search", fixturePrefix)
                param("limit", "1")
                param("cursor", expired)
            }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `limit bounds and empty results are closed`() {
        val admin = createPlatformAdminUser()

        mockMvc
            .get("/api/admin/clubs") {
                cookie(sessionCookieForUser(admin))
                param("limit", "0")
            }.andExpect { status { isBadRequest() } }
        mockMvc
            .get("/api/admin/clubs") {
                cookie(sessionCookieForUser(admin))
                param("limit", "101")
            }.andExpect { status { isBadRequest() } }

        val empty = listClubs(admin = admin, search = "$fixturePrefix missing-club")
        assertThat(clubIds(empty)).isEmpty()
        assertThat(nextCursor(empty)).isNull()
    }

    @Test
    fun `by-id detail is authoritative outside page one`() {
        val admin = createPlatformAdminUser()
        val ids = (1..8).map { index -> createClub(name = "$fixturePrefix ${index.toString().padStart(3, '0')}") }
        val outsidePageOne = ids[6]
        createDomain(outsidePageOne, ClubDomainStatus.FAILED, hostname = "detail-${UUID.randomUUID()}.example.test")
        val firstPage = listClubs(admin = admin, search = fixturePrefix, limit = 3)
        assertThat(clubIds(firstPage)).doesNotContain(outsidePageOne)

        mockMvc
            .get("/api/admin/clubs/$outsidePageOne") {
                cookie(sessionCookieForUser(admin))
            }.andExpect {
                status { isOk() }
                jsonPath("$.clubId") { value(outsidePageOne) }
                jsonPath("$.adminRevision") { value(0) }
                jsonPath("$.name") { value("$fixturePrefix 007") }
                jsonPath("$.domains[0].status") { value("FAILED") }
                jsonPath("$.firstHostOnboardingState") { value("MISSING") }
            }
    }

    @Test
    fun `missing club is 404 and host without platform admin is 403`() {
        val admin = createPlatformAdminUser()
        mockMvc
            .get("/api/admin/clubs/${UUID.randomUUID()}") {
                cookie(sessionCookieForUser(admin))
            }.andExpect { status { isNotFound() } }

        mockMvc
            .get("/api/admin/clubs/${UUID.randomUUID()}") {
                cookie(sessionCookieForUser("00000000-0000-0000-0000-000000000101"))
            }.andExpect { status { isForbidden() } }
    }

    private fun listClubs(
        admin: String,
        search: String? = null,
        lifecycle: String? = null,
        visibility: String? = null,
        domainStatus: String? = null,
        onboardingState: String? = null,
        limit: Int? = null,
        cursor: String? = null,
    ): MockHttpServletResponse =
        mockMvc
            .get("/api/admin/clubs") {
                cookie(sessionCookieForUser(admin))
                search?.let { param("search", it) }
                lifecycle?.let { param("lifecycle", it) }
                visibility?.let { param("visibility", it) }
                domainStatus?.let { param("domainStatus", it) }
                onboardingState?.let { param("onboardingState", it) }
                limit?.let { param("limit", it.toString()) }
                cursor?.let { param("cursor", it) }
            }.andExpect { status { isOk() } }
            .andReturn()
            .response

    private fun clubIds(response: MockHttpServletResponse): List<String> =
        JsonPath.read(
            response.contentAsString,
            "$.items[*].clubId",
        )

    private fun nextCursor(response: MockHttpServletResponse): String? =
        JsonPath.read(
            response.contentAsString,
            "$.nextCursor",
        )

    private fun createPlatformAdminUser(): String {
        val userId = UUID.randomUUID().toString()
        jdbcTemplate.update(
            """
            insert into users (id, email, name, short_name, auth_provider)
            values (?, ?, 'Platform Admin', 'Admin', 'GOOGLE')
            """.trimIndent(),
            userId,
            "platform.${UUID.randomUUID()}@example.com",
        )
        createdUserIds += userId
        jdbcTemplate.update(
            "insert into platform_admins (user_id, role, status) values (?, 'OPERATOR', 'ACTIVE')",
            userId,
        )
        createdPlatformAdminUserIds += userId
        return userId
    }

    private fun createClub(
        name: String,
        status: ClubStatus = ClubStatus.ACTIVE,
        visibility: ClubPublicVisibility = ClubPublicVisibility.PRIVATE,
        clubId: UUID = UUID.randomUUID(),
    ): String {
        val slug = "zzz-cursor-${UUID.randomUUID().toString().take(12)}"
        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about, status, public_visibility)
            values (?, ?, ?, 'Cursor tagline', 'Cursor about', ?, ?)
            """.trimIndent(),
            clubId.toString(),
            slug,
            name,
            status.name,
            visibility.name,
        )
        createdClubIds += clubId.toString()
        return clubId.toString()
    }

    private fun createDomain(
        clubId: String,
        status: ClubDomainStatus,
        hostname: String = "cursor-${UUID.randomUUID()}.example.test",
    ) {
        val domainId = UUID.randomUUID().toString()
        jdbcTemplate.update(
            """
            insert into club_domains (id, club_id, hostname, kind, status, is_primary)
            values (?, ?, ?, 'SUBDOMAIN', ?, false)
            """.trimIndent(),
            domainId,
            clubId,
            hostname,
            status.name,
        )
        createdClubDomainIds += domainId
    }

    private fun createHostInvitation(
        clubId: String,
        adminUserId: String,
    ) {
        val invitationId = UUID.randomUUID().toString()
        jdbcTemplate.update(
            """
            insert into invitations (
              id, club_id, invited_by_membership_id, invited_by_platform_admin_user_id,
              invited_email, invited_name, role, token_hash, status, apply_to_current_session, expires_at
            )
            values (?, ?, null, ?, 'first.host@example.com', 'First Host', 'HOST', ?, 'PENDING', false,
              timestampadd(day, 7, utc_timestamp(6)))
            """.trimIndent(),
            invitationId,
            clubId,
            adminUserId,
            UUID.randomUUID().toString().replace("-", ""),
        )
        createdInvitationIds += invitationId
    }

    private fun assignHost(clubId: String) {
        val userId = UUID.randomUUID().toString()
        val membershipId = UUID.randomUUID().toString()
        jdbcTemplate.update(
            """
            insert into users (id, email, name, short_name, auth_provider)
            values (?, ?, 'Cursor Host', 'Host', 'GOOGLE')
            """.trimIndent(),
            userId,
            "cursor.host.${UUID.randomUUID()}@example.com",
        )
        createdUserIds += userId
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            values (?, ?, ?, 'HOST', 'ACTIVE', utc_timestamp(6), 'Host', 'globe-notebook')
            """.trimIndent(),
            membershipId,
            clubId,
            userId,
        )
        createdMembershipIds += membershipId
    }

    private fun sessionCookieForUser(userId: String): Cookie {
        val issuedSession =
            authSessionService.issueSession(
                userId = UUID.fromString(userId).toString(),
                userAgent = "PlatformAdminClubRegistryCursorDbTest",
                ipAddress = "127.0.0.1",
            )
        createdSessionTokenHashes += issuedSession.storedTokenHash
        return Cookie(AuthSessionService.COOKIE_NAME, issuedSession.rawToken)
    }

    private fun deleteWhereIn(
        tableName: String,
        columnName: String,
        values: Set<String>,
    ) {
        if (values.isEmpty()) {
            return
        }
        val placeholders = values.joinToString(",") { "?" }
        jdbcTemplate.update(
            "delete from $tableName where $columnName in ($placeholders)",
            *values.toTypedArray(),
        )
    }

    private fun uniqueHex(length: Int): String =
        UUID
            .randomUUID()
            .toString()
            .replace("-", "")
            .take(length)
}
