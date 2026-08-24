package com.readmates.auth.api

import com.readmates.auth.adapter.`in`.security.AuthClubContextHeader
import com.readmates.auth.adapter.`in`.web.MemberProfileController
import com.readmates.auth.application.MemberProfileError
import com.readmates.auth.application.MemberProfileException
import com.readmates.auth.application.port.`in`.ReplaceOwnMemberProfileUseCase
import com.readmates.auth.application.port.`in`.UpdateHostMemberProfileUseCase
import com.readmates.auth.application.port.`in`.UpdateOwnMemberAvatarUseCase
import com.readmates.auth.application.port.`in`.UpdateOwnMemberProfileUseCase
import com.readmates.auth.application.service.AuthSessionService
import com.readmates.club.application.port.`in`.ResolveClubContextUseCase
import com.readmates.shared.adapter.`in`.web.ApiErrorResponse
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import jakarta.servlet.http.Cookie
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.put
import java.sql.Timestamp
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import javax.sql.DataSource

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.auth.session-cookie-secure=false",
        "readmates.bff-secret=test-bff-secret",
        "readmates.allowed-origins=http://localhost:3000",
    ],
)
@AutoConfigureMockMvc
@Tag("integration")
@Suppress("LargeClass")
class MemberProfileControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val authSessionService: AuthSessionService,
    @param:Autowired private val dataSource: DataSource,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val createdSessionTokenHashes = linkedSetOf<String>()
    private val createdMembershipIds = linkedSetOf<String>()
    private val createdUserIds = linkedSetOf<String>()
    private val createdClubIds = linkedSetOf<String>()
    private val projectionSnapshots = linkedMapOf<String, PublicProjectionSnapshot?>()
    private val clubProjectionSnapshots = linkedMapOf<String, ClubProjectionSnapshot?>()

    private data class PublicProjectionSnapshot(
        val clubId: String,
        val publicationId: String?,
        val generation: Long,
        val clubGeneration: Long,
        val liveRecordRevision: Long?,
        val originReadable: Boolean,
        val convergenceId: String?,
        val updatedAt: Timestamp,
    )

    private data class ClubProjectionSnapshot(
        val generation: Long,
        val originReadable: Boolean,
        val convergenceId: String?,
        val updatedAt: Timestamp,
    )

    private data class ProfileErrorResponseCase(
        val error: MemberProfileError,
        val status: HttpStatus,
        val code: String,
        val message: String,
    )

    private val profileErrorResponseCases =
        listOf(
            ProfileErrorResponseCase(
                MemberProfileError.AUTHENTICATION_REQUIRED,
                HttpStatus.UNAUTHORIZED,
                "AUTHENTICATION_REQUIRED",
                "Authentication required",
            ),
            ProfileErrorResponseCase(
                MemberProfileError.HOST_ROLE_REQUIRED,
                HttpStatus.FORBIDDEN,
                "HOST_ROLE_REQUIRED",
                "Host role required",
            ),
            ProfileErrorResponseCase(
                MemberProfileError.MEMBERSHIP_NOT_ALLOWED,
                HttpStatus.FORBIDDEN,
                "MEMBERSHIP_NOT_ALLOWED",
                "Membership is not allowed to edit profile",
            ),
            ProfileErrorResponseCase(
                MemberProfileError.MEMBER_NOT_FOUND,
                HttpStatus.NOT_FOUND,
                "MEMBER_NOT_FOUND",
                "Member not found",
            ),
            ProfileErrorResponseCase(
                MemberProfileError.DISPLAY_NAME_REQUIRED,
                HttpStatus.BAD_REQUEST,
                "DISPLAY_NAME_REQUIRED",
                "Display name is required",
            ),
            ProfileErrorResponseCase(
                MemberProfileError.DISPLAY_NAME_TOO_LONG,
                HttpStatus.BAD_REQUEST,
                "DISPLAY_NAME_TOO_LONG",
                "Display name must be 20 characters or fewer",
            ),
            ProfileErrorResponseCase(
                MemberProfileError.DISPLAY_NAME_INVALID,
                HttpStatus.BAD_REQUEST,
                "DISPLAY_NAME_INVALID",
                "Display name is invalid",
            ),
            ProfileErrorResponseCase(
                MemberProfileError.DISPLAY_NAME_RESERVED,
                HttpStatus.BAD_REQUEST,
                "DISPLAY_NAME_RESERVED",
                "Display name is reserved",
            ),
            ProfileErrorResponseCase(
                MemberProfileError.DISPLAY_NAME_DUPLICATE,
                HttpStatus.CONFLICT,
                "DISPLAY_NAME_DUPLICATE",
                "Display name is already used in this club",
            ),
            ProfileErrorResponseCase(
                MemberProfileError.AVATAR_KEY_REQUIRED,
                HttpStatus.BAD_REQUEST,
                "AVATAR_KEY_REQUIRED",
                "Avatar key is required",
            ),
            ProfileErrorResponseCase(
                MemberProfileError.AVATAR_KEY_INVALID,
                HttpStatus.BAD_REQUEST,
                "AVATAR_KEY_INVALID",
                "Avatar key is invalid",
            ),
        )

    @Test
    fun `member profile errors preserve their public response matrix`() {
        val controller =
            MemberProfileController(
                mock(ReplaceOwnMemberProfileUseCase::class.java),
                mock(UpdateOwnMemberProfileUseCase::class.java),
                mock(UpdateOwnMemberAvatarUseCase::class.java),
                mock(UpdateHostMemberProfileUseCase::class.java),
                mock(ResolveClubContextUseCase::class.java),
            )

        profileErrorResponseCases.forEach { expected ->
            val response = controller.handleMemberProfileException(MemberProfileException(expected.error))

            assertEquals(expected.status, response.statusCode)
            assertEquals(
                ApiErrorResponse(
                    code = expected.code,
                    message = expected.message,
                    status = expected.status.value(),
                ),
                response.body,
            )
        }
    }

    @Test
    fun `member atomically replaces own profile in the trusted club context`() {
        val email = insertProfileMember("self.replace.multi", "ACTIVE", shortName = "Before")
        val primaryMembershipId = membershipIdForEmail(email)
        val otherMembershipId = insertSecondClubMembership(email, "starfish-notebook")
        val cookie = sessionCookieForEmail(email)

        mockMvc
            .put("/api/me/profile") {
                cookie(cookie)
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header(AuthClubContextHeader.CLUB_SLUG, "reading-sai")
                header("Origin", "http://localhost:3000")
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"displayName":"After","avatarKey":"cloud-green-book"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.membershipId") { value(primaryMembershipId) }
                jsonPath("$.displayName") { value("After") }
                jsonPath("$.avatarKey") { value("cloud-green-book") }
            }

        assertEquals("After", shortNameForMembership(primaryMembershipId))
        assertEquals("cloud-green-book", avatarKeyForMembership(primaryMembershipId))
        assertEquals("OtherAvatar", shortNameForMembership(otherMembershipId))
        assertEquals("starfish-notebook", avatarKeyForMembership(otherMembershipId))
    }

    @Suppress("LongMethod")
    @Test
    fun `public member profile change rotates projection atomically while no-op and rollback do not`() {
        val email = insertProfileMember("public.profile.projection", "ACTIVE", shortName = "Before")
        val membershipId = membershipIdForEmail(email)
        val cookie = sessionCookieForEmail(email)
        val publicSessionId = "00000000-0000-0000-0000-000000000306"
        val unrelatedPublicSessionId = "00000000-0000-0000-0000-000000000305"
        val participantId = UUID.randomUUID().toString()
        val highlightId = UUID.randomUUID().toString()
        rememberProjectionState(publicSessionId)
        rememberClubProjectionState("00000000-0000-0000-0000-000000000001")
        jdbcTemplate.update(
            """
            insert into session_participants (
              id, club_id, session_id, membership_id, rsvp_status, attendance_status, participation_status
            ) values (?, '00000000-0000-0000-0000-000000000001', ?, ?, 'GOING', 'ATTENDED', 'ACTIVE')
            """.trimIndent(),
            participantId,
            publicSessionId,
            membershipId,
        )
        jdbcTemplate.update(
            """
            insert into highlights (id, club_id, session_id, membership_id, text, sort_order)
            values (?, '00000000-0000-0000-0000-000000000001', ?, ?, 'Synthetic public profile projection', 99)
            """.trimIndent(),
            highlightId,
            publicSessionId,
            membershipId,
        )
        val before = projectionGeneration(publicSessionId)
        val unrelatedBefore = projectionGeneration(unrelatedPublicSessionId)
        mockMvc
            .get("/api/public/clubs/reading-sai/sessions/$publicSessionId") {
                header("X-Readmates-Bff-Secret", "test-bff-secret")
            }.andExpect {
                status { isOk() }
                jsonPath("$.highlights[?(@.text == 'Synthetic public profile projection')].authorShortName") {
                    value("Before")
                }
            }

        mockMvc
            .put("/api/me/profile") {
                cookie(cookie)
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header(AuthClubContextHeader.CLUB_SLUG, "reading-sai")
                header("Origin", "http://localhost:3000")
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"displayName":"After","avatarKey":"cloud-green-book"}"""
            }.andExpect { status { isOk() } }

        val changed = projectionGeneration(publicSessionId)
        assertEquals(before + 1, changed)
        assertEquals(unrelatedBefore, projectionGeneration(unrelatedPublicSessionId))
        assertEquals(
            1,
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from auth_public_projection_mutation_receipts receipts
                join public_mutation_convergence_links links on links.mutation_receipt_id = receipts.id
                join public_convergence_work work on work.convergence_id = links.convergence_id
                where receipts.subject_membership_id_snapshot = ?
                  and receipts.session_id_snapshot = ?
                  and receipts.operation = 'PROFILE_REPLACED'
                """.trimIndent(),
                Int::class.java,
                membershipId,
                publicSessionId,
            ),
        )
        mockMvc
            .get("/api/public/clubs/reading-sai/sessions/$publicSessionId") {
                header("X-Readmates-Bff-Secret", "test-bff-secret")
            }.andExpect {
                status { isOk() }
                jsonPath("$.highlights[?(@.text == 'Synthetic public profile projection')].authorShortName") {
                    value("After")
                }
                jsonPath("$.highlights[?(@.text == 'Synthetic public profile projection')].avatarKey") {
                    value("cloud-green-book")
                }
            }

        mockMvc
            .put("/api/me/profile") {
                cookie(cookie)
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header(AuthClubContextHeader.CLUB_SLUG, "reading-sai")
                header("Origin", "http://localhost:3000")
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"displayName":"After","avatarKey":"cloud-green-book"}"""
            }.andExpect { status { isOk() } }
        assertEquals(changed, projectionGeneration(publicSessionId))

        jdbcTemplate.update(
            "update public_projection_current set origin_readable = false where session_id = ?",
            publicSessionId,
        )
        mockMvc
            .put("/api/me/profile") {
                cookie(cookie)
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header(AuthClubContextHeader.CLUB_SLUG, "reading-sai")
                header("Origin", "http://localhost:3000")
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"displayName":"After deny","avatarKey":"starfish-notebook"}"""
            }.andExpect { status { isOk() } }
        val denied = projectionGeneration(publicSessionId)
        assertEquals(changed + 1, denied)
        assertEquals(false, projectionReadable(publicSessionId))
        mockMvc
            .get("/api/public/clubs/reading-sai/sessions/$publicSessionId") {
                header("X-Readmates-Bff-Secret", "test-bff-secret")
            }.andExpect { status { isNotFound() } }

        mockMvc
            .put("/api/me/profile") {
                cookie(cookie)
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header(AuthClubContextHeader.CLUB_SLUG, "reading-sai")
                header("Origin", "http://localhost:3000")
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"displayName":"After rollback","avatarKey":"invalid-avatar"}"""
            }.andExpect { status { isBadRequest() } }
        assertEquals(denied, projectionGeneration(publicSessionId))
    }

    @Test
    fun `atomic profile replacement rejects untrusted context and invalid avatars without partial writes`() {
        val email = insertProfileMember("self.replace.rejected", "ACTIVE", shortName = "Before")
        val membershipId = membershipIdForEmail(email)
        val cases =
            listOf(
                Triple(null, "cloud-green-book", "MEMBER_NOT_FOUND"),
                Triple("bad--slug", "cloud-green-book", "MEMBER_NOT_FOUND"),
                Triple("reading-sai", "hedgehog-green-mug", "AVATAR_KEY_INVALID"),
                Triple("reading-sai", "CLOUD-GREEN-BOOK", "AVATAR_KEY_INVALID"),
            )

        cases.forEach { (clubSlug, avatarKey, code) ->
            mockMvc
                .put("/api/me/profile") {
                    cookie(sessionCookieForEmail(email))
                    header("X-Readmates-Bff-Secret", "test-bff-secret")
                    clubSlug?.let { header(AuthClubContextHeader.CLUB_SLUG, it) }
                    header("Origin", "http://localhost:3000")
                    with(csrf())
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"displayName":"After","avatarKey":"$avatarKey"}"""
                }.andExpect {
                    when (code) {
                        "MEMBER_NOT_FOUND" -> status { isNotFound() }
                        "AVATAR_KEY_INVALID" -> status { isBadRequest() }
                        else -> error("Unexpected profile rejection code")
                    }
                    jsonPath("$.code") { value(code) }
                }
            assertEquals("Before", shortNameForMembership(membershipId))
            assertEquals("mushroom-green-book", avatarKeyForMembership(membershipId))
        }
    }

    @Test
    fun `atomic profile replacement rejects duplicate name without changing either field`() {
        val email = insertProfileMember("self.replace.duplicate", "ACTIVE", shortName = "Before")
        insertProfileMember("self.replace.taken", "ACTIVE", shortName = "Taken")
        val membershipId = membershipIdForEmail(email)

        mockMvc
            .put("/api/me/profile") {
                cookie(sessionCookieForEmail(email))
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header(AuthClubContextHeader.CLUB_SLUG, "reading-sai")
                header("Origin", "http://localhost:3000")
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"displayName":"Taken","avatarKey":"cloud-green-book"}"""
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("DISPLAY_NAME_DUPLICATE") }
            }

        assertEquals("Before", shortNameForMembership(membershipId))
        assertEquals("mushroom-green-book", avatarKeyForMembership(membershipId))
    }

    @Test
    fun `atomic profile replacement maps required fields without partial writes`() {
        val email = insertProfileMember("self.replace.required", "ACTIVE", shortName = "Before")
        val membershipId = membershipIdForEmail(email)
        val cookie = sessionCookieForEmail(email)
        val cases =
            listOf(
                Triple("""{"avatarKey":"cloud-green-book"}""", "DISPLAY_NAME_REQUIRED", "Display name is required"),
                Triple(
                    """{"displayName":null,"avatarKey":"cloud-green-book"}""",
                    "DISPLAY_NAME_REQUIRED",
                    "Display name is required",
                ),
                Triple(
                    """{"displayName":"   ","avatarKey":"cloud-green-book"}""",
                    "DISPLAY_NAME_REQUIRED",
                    "Display name is required",
                ),
                Triple("""{"displayName":"After"}""", "AVATAR_KEY_REQUIRED", "Avatar key is required"),
                Triple(
                    """{"displayName":"After","avatarKey":null}""",
                    "AVATAR_KEY_REQUIRED",
                    "Avatar key is required",
                ),
                Triple(
                    """{"displayName":"After","avatarKey":"   "}""",
                    "AVATAR_KEY_REQUIRED",
                    "Avatar key is required",
                ),
            )

        cases.forEach { (body, code, message) ->
            mockMvc
                .put("/api/me/profile") {
                    cookie(cookie)
                    header("X-Readmates-Bff-Secret", "test-bff-secret")
                    header(AuthClubContextHeader.CLUB_SLUG, "reading-sai")
                    header("Origin", "http://localhost:3000")
                    with(csrf())
                    contentType = MediaType.APPLICATION_JSON
                    content = body
                }.andExpect {
                    status { isBadRequest() }
                    jsonPath("$.code") { value(code) }
                    jsonPath("$.status") { value(400) }
                    jsonPath("$.message") { value(message) }
                }
            assertEquals("Before", shortNameForMembership(membershipId))
            assertEquals("mushroom-green-book", avatarKeyForMembership(membershipId))
        }
    }

    @Test
    @Suppress("LongMethod")
    fun `simultaneous PUT loses duplicate-name race without changing either profile field`() {
        val email = insertProfileMember("self.replace.race", "ACTIVE", shortName = "Before")
        val membershipId = membershipIdForEmail(email)
        val otherMembershipId =
            membershipIdForEmail(
                insertProfileMember("self.replace.race.other", "ACTIVE", shortName = "Other"),
            )
        val cookie = sessionCookieForEmail(email)
        val executor = Executors.newSingleThreadExecutor()

        dataSource.connection.use { connection ->
            connection.autoCommit = false
            try {
                connection
                    .prepareStatement(
                        """
                        select id
                        from clubs
                        where id = '00000000-0000-0000-0000-000000000001'
                        for update
                        """.trimIndent(),
                    ).use { statement ->
                        statement.executeQuery().use { resultSet -> resultSet.next() }
                    }

                val putResult =
                    executor.submit<Pair<Int, String>> {
                        val response =
                            mockMvc
                                .put("/api/me/profile") {
                                    cookie(cookie)
                                    header("X-Readmates-Bff-Secret", "test-bff-secret")
                                    header(AuthClubContextHeader.CLUB_SLUG, "reading-sai")
                                    header("Origin", "http://localhost:3000")
                                    with(csrf())
                                    contentType = MediaType.APPLICATION_JSON
                                    content = """{"displayName":"RaceTaken","avatarKey":"cloud-green-book"}"""
                                }.andReturn()
                                .response
                        response.status to response.contentAsString
                    }

                assertThrows(TimeoutException::class.java) {
                    putResult.get(300, TimeUnit.MILLISECONDS)
                }
                connection
                    .prepareStatement(
                        """
                        update memberships
                        set short_name = 'RaceTaken',
                            updated_at = utc_timestamp(6)
                        where id = ?
                        """.trimIndent(),
                    ).use { statement ->
                        statement.setString(1, otherMembershipId)
                        statement.executeUpdate()
                    }
                connection.commit()

                val (status, body) = putResult.get(5, TimeUnit.SECONDS)
                assertEquals(409, status)
                org.hamcrest.MatcherAssert.assertThat(
                    body,
                    org.hamcrest.Matchers.containsString("DISPLAY_NAME_DUPLICATE"),
                )
            } finally {
                runCatching { connection.rollback() }
                executor.shutdownNow()
            }
        }

        assertEquals("Before", shortNameForMembership(membershipId))
        assertEquals("mushroom-green-book", avatarKeyForMembership(membershipId))
        assertEquals("RaceTaken", shortNameForMembership(otherMembershipId))
    }

    @Test
    fun `simultaneous PUT requests allow one atomic winner and preserve both loser fields`() {
        val firstEmail = insertProfileMember("self.replace.concurrent.first", "ACTIVE", shortName = "FirstBefore")
        val secondEmail = insertProfileMember("self.replace.concurrent.second", "ACTIVE", shortName = "SecondBefore")
        val firstMembershipId = membershipIdForEmail(firstEmail)
        val secondMembershipId = membershipIdForEmail(secondEmail)
        val requests =
            listOf(
                Triple(sessionCookieForEmail(firstEmail), firstMembershipId, "cloud-green-book"),
                Triple(sessionCookieForEmail(secondEmail), secondMembershipId, "sun-green-book"),
            )
        val ready = CountDownLatch(requests.size)
        val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(requests.size)

        try {
            val results =
                requests.map { (cookie, membershipId, avatarKey) ->
                    executor.submit<Triple<Int, String, String>> {
                        ready.countDown()
                        start.await(5, TimeUnit.SECONDS)
                        val response =
                            mockMvc
                                .put("/api/me/profile") {
                                    cookie(cookie)
                                    header("X-Readmates-Bff-Secret", "test-bff-secret")
                                    header(AuthClubContextHeader.CLUB_SLUG, "reading-sai")
                                    header("Origin", "http://localhost:3000")
                                    with(csrf())
                                    contentType = MediaType.APPLICATION_JSON
                                    content = """{"displayName":"ConcurrentWinner","avatarKey":"$avatarKey"}"""
                                }.andReturn()
                                .response
                        Triple(response.status, membershipId, avatarKey)
                    }
                }
            ready.await(5, TimeUnit.SECONDS)
            start.countDown()
            val completed = results.map { it.get(10, TimeUnit.SECONDS) }

            assertEquals(listOf(200, 409), completed.map { it.first }.sorted())
            completed.forEach { (status, membershipId, requestedAvatarKey) ->
                if (status == 200) {
                    assertEquals("ConcurrentWinner", shortNameForMembership(membershipId))
                    assertEquals(requestedAvatarKey, avatarKeyForMembership(membershipId))
                } else {
                    val expectedName = if (membershipId == firstMembershipId) "FirstBefore" else "SecondBefore"
                    assertEquals(expectedName, shortNameForMembership(membershipId))
                    assertEquals("mushroom-green-book", avatarKeyForMembership(membershipId))
                }
            }
        } finally {
            start.countDown()
            executor.shutdownNow()
        }
    }

    @Test
    fun `atomic profile replacement rejects blocked memberships without partial writes`() {
        listOf("LEFT", "INACTIVE").forEach { membershipStatus ->
            val originalName = "Before$membershipStatus"
            val email =
                insertProfileMember(
                    "self.replace.${membershipStatus.lowercase()}",
                    membershipStatus,
                    shortName = originalName,
                )
            val membershipId = membershipIdForEmail(email)
            mockMvc
                .put("/api/me/profile") {
                    cookie(sessionCookieForEmail(email))
                    header("X-Readmates-Bff-Secret", "test-bff-secret")
                    header(AuthClubContextHeader.CLUB_SLUG, "reading-sai")
                    header("Origin", "http://localhost:3000")
                    with(csrf())
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"displayName":"After","avatarKey":"cloud-green-book"}"""
                }.andExpect {
                    status { isForbidden() }
                    jsonPath("$.code") { value("MEMBERSHIP_NOT_ALLOWED") }
                }
            assertEquals(originalName, shortNameForMembership(membershipId))
            assertEquals("mushroom-green-book", avatarKeyForMembership(membershipId))
        }
    }

    @Test
    fun `atomic profile replacement requires Spring Security authentication`() {
        val email = insertProfileMember("self.replace.unauthenticated", "ACTIVE", shortName = "Before")
        val membershipId = membershipIdForEmail(email)
        mockMvc
            .put("/api/me/profile") {
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header(AuthClubContextHeader.CLUB_SLUG, "reading-sai")
                header("Origin", "http://localhost:3000")
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"displayName":"After","avatarKey":"cloud-green-book"}"""
            }.andExpect {
                status { isUnauthorized() }
                content { string("") }
            }
        assertEquals("Before", shortNameForMembership(membershipId))
        assertEquals("mushroom-green-book", avatarKeyForMembership(membershipId))
    }

    @AfterEach
    fun cleanupCreatedRows() {
        try {
            deleteWhereIn("auth_sessions", "session_token_hash", createdSessionTokenHashes)
            deleteWhereIn("auth_sessions", "user_id", createdUserIds)
            cleanupCreatedPublicProjectionMutations()
            restoreProjectionSnapshots()
            deleteWhereIn("highlights", "membership_id", createdMembershipIds)
            deleteWhereIn("session_participants", "membership_id", createdMembershipIds)
            deleteWhereIn("memberships", "id", createdMembershipIds)
            deleteWhereIn("memberships", "user_id", createdUserIds)
            deleteWhereIn("users", "id", createdUserIds)
            deleteWhereIn("clubs", "id", createdClubIds)
        } finally {
            createdSessionTokenHashes.clear()
            createdMembershipIds.clear()
            createdUserIds.clear()
            createdClubIds.clear()
            projectionSnapshots.clear()
            clubProjectionSnapshots.clear()
        }
    }

    @Test
    fun `member updates own display name after trimming input`() {
        val email =
            insertProfileMember(
                "self.active",
                "ACTIVE",
                shortName = "Before",
                profileImageUrl = "https://cdn.example.test/profiles/self-active.png",
            )
        val cookie = sessionCookieForEmail(email)
        val membershipId = membershipIdForEmail(email)

        mockMvc
            .patch("/api/me/profile") {
                cookie(cookie)
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("Origin", "http://localhost:3000")
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"displayName":"  After  "}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.membershipId") { value(membershipId) }
                jsonPath("$.displayName") { value("After") }
                jsonPath("$.accountName") { value("self.active") }
                jsonPath("$.avatarKey") { value("mushroom-green-book") }
                jsonPath("$.shortName") { doesNotExist() }
                jsonPath("$.profileImageUrl") { value("https://cdn.example.test/profiles/self-active.png") }
                jsonPath("$.authenticated") { doesNotExist() }
                jsonPath("$.email") { doesNotExist() }
                jsonPath("$.membershipStatus") { doesNotExist() }
            }

        assertEquals("After", shortNameForEmail(email))
        assertEquals("mushroom-green-book", avatarKeyForMembership(membershipId))
    }

    @Test
    fun `member updates own avatar after trimming input`() {
        val email = insertProfileMember("self.avatar.active", "ACTIVE", shortName = "AvatarBefore")
        val cookie = sessionCookieForEmail(email)
        val membershipId = membershipIdForEmail(email)

        mockMvc
            .patch("/api/me/avatar") {
                cookie(cookie)
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header(AuthClubContextHeader.CLUB_SLUG, "reading-sai")
                header("Origin", "http://localhost:3000")
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"avatarKey":"  balloon-green-book  "}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.membershipId") { value(membershipId) }
                jsonPath("$.avatarKey") { value("balloon-green-book") }
                jsonPath("$.email") { doesNotExist() }
            }

        assertEquals("balloon-green-book", avatarKeyForMembership(membershipId))
    }

    @Test
    fun `own avatar update uses the membership selected by request club context`() {
        val email = insertProfileMember("self.avatar.multi", "ACTIVE", shortName = "PrimaryAvatar")
        val primaryMembershipId = membershipIdForEmail(email)
        val otherMembershipId = insertSecondClubMembership(email, "starfish-notebook")
        val cookie = sessionCookieForEmail(email)

        mockMvc
            .patch("/api/me/avatar") {
                cookie(cookie)
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header(AuthClubContextHeader.CLUB_SLUG, "reading-sai")
                header("Origin", "http://localhost:3000")
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"avatarKey":"balloon-green-book"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.membershipId") { value(primaryMembershipId) }
                jsonPath("$.avatarKey") { value("balloon-green-book") }
            }

        assertEquals("balloon-green-book", avatarKeyForMembership(primaryMembershipId))
        assertEquals("starfish-notebook", avatarKeyForMembership(otherMembershipId))
    }

    @Test
    fun `own avatar update rejects missing trusted club context for a multi club identity`() {
        val email = insertProfileMember("self.avatar.missing.context", "ACTIVE", shortName = "PrimaryAvatar")
        val primaryMembershipId = membershipIdForEmail(email)
        val otherMembershipId = insertSecondClubMembership(email, "starfish-notebook")
        val cookie = sessionCookieForEmail(email)

        mockMvc
            .patch("/api/me/avatar") {
                cookie(cookie)
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("Origin", "http://localhost:3000")
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"avatarKey":"balloon-green-book"}"""
            }.andExpect {
                status { isNotFound() }
                jsonPath("$.code") { value("MEMBER_NOT_FOUND") }
            }

        assertEquals("mushroom-green-book", avatarKeyForMembership(primaryMembershipId))
        assertEquals("starfish-notebook", avatarKeyForMembership(otherMembershipId))
    }

    @Test
    fun `viewer updates own avatar`() {
        val email = insertProfileMember("self.avatar.viewer", "VIEWER", shortName = "ViewerAvatar")
        val cookie = sessionCookieForEmail(email)
        val membershipId = membershipIdForEmail(email)

        mockMvc
            .patch("/api/me/avatar") {
                cookie(cookie)
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header(AuthClubContextHeader.CLUB_SLUG, "reading-sai")
                header("Origin", "http://localhost:3000")
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"avatarKey":"balloon-green-book"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.avatarKey") { value("balloon-green-book") }
            }

        assertEquals("balloon-green-book", avatarKeyForMembership(membershipId))
    }

    @Test
    fun `own avatar update requires Spring Security authentication`() {
        mockMvc
            .patch("/api/me/avatar") {
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header(AuthClubContextHeader.CLUB_SLUG, "reading-sai")
                header("Origin", "http://localhost:3000")
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"avatarKey":"balloon-green-book"}"""
            }.andExpect {
                status { isUnauthorized() }
                content { string("") }
            }
    }

    @Test
    fun `left and inactive members cannot update their own avatar`() {
        listOf("LEFT", "INACTIVE").forEach { status ->
            val email = insertProfileMember("self.avatar.${status.lowercase()}", status, shortName = "Avatar$status")
            val cookie = sessionCookieForEmail(email)
            val membershipId = membershipIdForEmail(email)

            mockMvc
                .patch("/api/me/avatar") {
                    cookie(cookie)
                    header("X-Readmates-Bff-Secret", "test-bff-secret")
                    header(AuthClubContextHeader.CLUB_SLUG, "reading-sai")
                    header("Origin", "http://localhost:3000")
                    with(csrf())
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"avatarKey":"balloon-green-book"}"""
                }.andExpect {
                    status { isForbidden() }
                    jsonPath("$.code") { value("MEMBERSHIP_NOT_ALLOWED") }
                }

            assertEquals("mushroom-green-book", avatarKeyForMembership(membershipId))
        }
    }

    @Test
    fun `own avatar update rejects invalid keys with a structured bad request`() {
        val email = insertProfileMember("self.avatar.invalid", "ACTIVE", shortName = "AvatarInvalid")
        val cookie = sessionCookieForEmail(email)

        mockMvc
            .patch("/api/me/avatar") {
                cookie(cookie)
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header(AuthClubContextHeader.CLUB_SLUG, "reading-sai")
                header("Origin", "http://localhost:3000")
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"avatarKey":"HEDGEHOG-GREEN-MUG"}"""
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("AVATAR_KEY_INVALID") }
            }
    }

    @Test
    fun `own avatar update allows duplicate avatar keys in the same club`() {
        val email =
            insertProfileMember(
                "self.avatar.duplicate",
                "ACTIVE",
                shortName = "AvatarDuplicate",
                avatarKey = "balloon-green-book",
            )
        insertProfileMember("self.avatar.taken", "ACTIVE", shortName = "AvatarTaken")
        val cookie = sessionCookieForEmail(email)
        val membershipId = membershipIdForEmail(email)

        mockMvc
            .patch("/api/me/avatar") {
                cookie(cookie)
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("X-Readmates-Club-Slug", "reading-sai")
                header("Origin", "http://localhost:3000")
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"avatarKey":"mushroom-green-book"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.avatarKey") { value("mushroom-green-book") }
            }

        assertEquals("mushroom-green-book", avatarKeyForMembership(membershipId))
    }

    @Test
    fun `viewer updates own display name`() {
        val email = insertProfileMember("self.viewer", "VIEWER", shortName = "ViewerBefore")
        val cookie = sessionCookieForEmail(email)

        mockMvc
            .patch("/api/me/profile") {
                cookie(cookie)
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("Origin", "http://localhost:3000")
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"displayName":"ViewerAfter"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.displayName") { value("ViewerAfter") }
                jsonPath("$.shortName") { doesNotExist() }
            }

        assertEquals("ViewerAfter", shortNameForEmail(email))
    }

    @Test
    fun `own profile update requires Spring Security authentication`() {
        mockMvc
            .patch("/api/me/profile") {
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("Origin", "http://localhost:3000")
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"displayName":"NoSession"}"""
            }.andExpect {
                status { isUnauthorized() }
                content { string("") }
            }
    }

    @Test
    fun `left and inactive members receive membership not allowed for own profile updates`() {
        listOf("LEFT", "INACTIVE").forEach { status ->
            val email = insertProfileMember("self.${status.lowercase()}", status, shortName = "Blocked$status")
            val cookie = sessionCookieForEmail(email)

            mockMvc
                .patch("/api/me/profile") {
                    cookie(cookie)
                    header("X-Readmates-Bff-Secret", "test-bff-secret")
                    header("Origin", "http://localhost:3000")
                    with(csrf())
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"displayName":"ShouldNotStore"}"""
                }.andExpect {
                    status { isForbidden() }
                    jsonPath("$.code") { value("MEMBERSHIP_NOT_ALLOWED") }
                    jsonPath("$.message") { value("Membership is not allowed to edit profile") }
                }

            assertEquals("Blocked$status", shortNameForEmail(email))
        }
    }

    @Test
    fun `own profile display name validation returns structured errors`() {
        val email = insertProfileMember("self.validation", "ACTIVE", shortName = "Original")
        val cookie = sessionCookieForEmail(email)
        val cases =
            listOf(
                "" to "DISPLAY_NAME_REQUIRED",
                "   " to "DISPLAY_NAME_REQUIRED",
                "123456789012345678901" to "DISPLAY_NAME_TOO_LONG",
                "name@example.com" to "DISPLAY_NAME_INVALID",
                "https://example.com/me" to "DISPLAY_NAME_INVALID",
                "example.com" to "DISPLAY_NAME_INVALID",
                "line\nbreak" to "DISPLAY_NAME_INVALID",
                "관리자" to "DISPLAY_NAME_RESERVED",
            )

        cases.forEach { (shortName, code) ->
            mockMvc
                .patch("/api/me/profile") {
                    cookie(cookie)
                    header("X-Readmates-Bff-Secret", "test-bff-secret")
                    header("Origin", "http://localhost:3000")
                    with(csrf())
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"displayName":${jsonString(shortName)}}"""
                }.andExpect {
                    status { isBadRequest() }
                    jsonPath("$.code") { value(code) }
                }
        }

        assertEquals("Original", shortNameForEmail(email))
    }

    @Test
    fun `duplicate own display name is rejected within same club except current value`() {
        val email = insertProfileMember("self.duplicate", "ACTIVE", shortName = "Mine")
        insertProfileMember("self.taken", "ACTIVE", shortName = "Taken")
        val cookie = sessionCookieForEmail(email)

        mockMvc
            .patch("/api/me/profile") {
                cookie(cookie)
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("Origin", "http://localhost:3000")
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"displayName":"Taken"}"""
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("DISPLAY_NAME_DUPLICATE") }
            }

        mockMvc
            .patch("/api/me/profile") {
                cookie(cookie)
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("Origin", "http://localhost:3000")
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"displayName":"Mine"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.displayName") { value("Mine") }
                jsonPath("$.shortName") { doesNotExist() }
            }
    }

    @Test
    fun `own profile duplicate check waits for club profile name lock`() {
        val email = insertProfileMember("self.race", "ACTIVE", shortName = "RaceMine")
        val otherMembershipId =
            membershipIdForEmail(
                insertProfileMember("self.race.other", "ACTIVE", shortName = "RaceOther"),
            )
        val cookie = sessionCookieForEmail(email)
        val executor = Executors.newSingleThreadExecutor()

        dataSource.connection.use { connection ->
            connection.autoCommit = false
            try {
                connection
                    .prepareStatement(
                        """
                        select id
                        from clubs
                        where id = '00000000-0000-0000-0000-000000000001'
                        for update
                        """.trimIndent(),
                    ).use { statement ->
                        statement.executeQuery().use { resultSet ->
                            resultSet.next()
                        }
                    }

                val updateStatus =
                    executor.submit<Int> {
                        mockMvc
                            .patch("/api/me/profile") {
                                cookie(cookie)
                                header("X-Readmates-Bff-Secret", "test-bff-secret")
                                header("Origin", "http://localhost:3000")
                                with(csrf())
                                contentType = MediaType.APPLICATION_JSON
                                content = """{"displayName":"RaceTaken"}"""
                            }.andReturn()
                            .response.status
                    }

                assertThrows(TimeoutException::class.java) {
                    updateStatus.get(300, TimeUnit.MILLISECONDS)
                }

                connection
                    .prepareStatement(
                        """
                        update memberships
                        set short_name = 'RaceTaken',
                            updated_at = utc_timestamp(6)
                        where id = ?
                        """.trimIndent(),
                    ).use { statement ->
                        statement.setString(1, otherMembershipId)
                        statement.executeUpdate()
                    }
                connection.commit()

                assertEquals(409, updateStatus.get(5, TimeUnit.SECONDS))
            } finally {
                runCatching { connection.rollback() }
                executor.shutdownNow()
            }
        }

        assertEquals("RaceMine", shortNameForEmail(email))
        assertEquals("RaceTaken", shortNameForMembership(otherMembershipId))
    }

    @Test
    fun `own profile update rejects membership status changed to left while waiting for profile name lock`() {
        val email = insertProfileMember("self.status.race", "ACTIVE", shortName = "StatusRaceMine")
        val membershipId = membershipIdForEmail(email)
        val cookie = sessionCookieForEmail(email)
        val executor = Executors.newSingleThreadExecutor()

        dataSource.connection.use { connection ->
            connection.autoCommit = false
            try {
                connection
                    .prepareStatement(
                        """
                        select id
                        from clubs
                        where id = '00000000-0000-0000-0000-000000000001'
                        for update
                        """.trimIndent(),
                    ).use { statement ->
                        statement.executeQuery().use { resultSet ->
                            resultSet.next()
                        }
                    }

                val updateResult =
                    executor.submit<Pair<Int, String>> {
                        val response =
                            mockMvc
                                .patch("/api/me/profile") {
                                    cookie(cookie)
                                    header("X-Readmates-Bff-Secret", "test-bff-secret")
                                    header("Origin", "http://localhost:3000")
                                    with(csrf())
                                    contentType = MediaType.APPLICATION_JSON
                                    content = """{"displayName":"StatusRaceAfter"}"""
                                }.andReturn()
                                .response
                        response.status to response.contentAsString
                    }

                assertThrows(TimeoutException::class.java) {
                    updateResult.get(300, TimeUnit.MILLISECONDS)
                }

                connection
                    .prepareStatement(
                        """
                        update memberships
                        set status = 'LEFT'
                        where id = ?
                        """.trimIndent(),
                    ).use { statement ->
                        statement.setString(1, membershipId)
                        statement.executeUpdate()
                    }
                connection.commit()

                val (status, body) = updateResult.get(5, TimeUnit.SECONDS)
                assertEquals(403, status)
                org.hamcrest.MatcherAssert.assertThat(body, org.hamcrest.Matchers.containsString("MEMBERSHIP_NOT_ALLOWED"))
            } finally {
                runCatching { connection.rollback() }
                executor.shutdownNow()
            }
        }

        assertEquals("StatusRaceMine", shortNameForEmail(email))
    }

    @Test
    fun `host updates same club member profile and receives host member list item`() {
        val hostCookie = sessionCookieForEmail("host@example.com")
        val targetMembershipIds =
            listOf("VIEWER", "ACTIVE", "SUSPENDED", "LEFT", "INACTIVE")
                .map { status -> status to membershipIdForEmail(insertProfileMember("host.${status.lowercase()}", status)) }

        targetMembershipIds.forEach { (status, membershipId) ->
            val newShortName = "Host$status".take(20)

            mockMvc
                .patch("/api/host/members/$membershipId/profile") {
                    cookie(hostCookie)
                    header("X-Readmates-Bff-Secret", "test-bff-secret")
                    header("Origin", "http://localhost:3000")
                    with(csrf())
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"displayName":"$newShortName"}"""
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.membershipId") { value(membershipId) }
                    jsonPath("$.displayName") { value(newShortName) }
                    jsonPath("$.avatarKey") { value("mushroom-green-book") }
                    jsonPath("$.shortName") { doesNotExist() }
                    jsonPath("$.status") { value(status) }
                    jsonPath("$.canDeactivate") { exists() }
                }

            assertEquals(newShortName, shortNameForMembership(membershipId))
            assertEquals("mushroom-green-book", avatarKeyForMembership(membershipId))
        }
    }

    @Test
    fun `host profile update requires active host role`() {
        val memberCookie = sessionCookieForEmail("member5@example.com")
        val targetMembershipId = membershipIdForEmail(insertProfileMember("host.blocked", "ACTIVE", shortName = "Blocked"))

        mockMvc
            .patch("/api/host/members/$targetMembershipId/profile") {
                cookie(memberCookie)
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("Origin", "http://localhost:3000")
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"displayName":"ShouldNotStore"}"""
            }.andExpect {
                status { isForbidden() }
                jsonPath("$.code") { value("HOST_ROLE_REQUIRED") }
            }

        assertEquals("Blocked", shortNameForMembership(targetMembershipId))
    }

    @Test
    fun `host profile update requires Spring Security authentication`() {
        val targetMembershipId = membershipIdForEmail(insertProfileMember("host.anonymous", "ACTIVE", shortName = "Blocked"))

        mockMvc
            .patch("/api/host/members/$targetMembershipId/profile") {
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("Origin", "http://localhost:3000")
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"displayName":"NoSession"}"""
            }.andExpect {
                status { isUnauthorized() }
                content { string("") }
            }

        assertEquals("Blocked", shortNameForMembership(targetMembershipId))
    }

    @Test
    fun `host profile update is scoped to current club`() {
        val hostCookie = sessionCookieForEmail("host@example.com")
        val outsideMembershipId =
            membershipIdForEmail(
                insertProfileMemberOutsideClub("outside.profile", "ACTIVE", shortName = "Outside"),
            )

        mockMvc
            .patch("/api/host/members/$outsideMembershipId/profile") {
                cookie(hostCookie)
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("Origin", "http://localhost:3000")
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"displayName":"ShouldNotStore"}"""
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
        avatarKey: String = "mushroom-green-book",
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
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            values (?, '00000000-0000-0000-0000-000000000001', ?, 'MEMBER', ?, utc_timestamp(6), ?, ?)
            """.trimIndent(),
            membershipId,
            userId,
            status,
            shortName,
            avatarKey,
        )
        createdMembershipIds += membershipId
        return email
    }

    private fun insertProfileMemberOutsideClub(
        prefix: String,
        status: String,
        shortName: String,
    ): String {
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
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            values (?, ?, ?, 'MEMBER', ?, utc_timestamp(6), ?, 'mushroom-green-book')
            """.trimIndent(),
            membershipId,
            clubId,
            userId,
            status,
            shortName,
        )
        createdMembershipIds += membershipId
        return email
    }

    private fun insertSecondClubMembership(
        email: String,
        avatarKey: String,
    ): String {
        val clubId = UUID.randomUUID().toString()
        val clubSlug = "profile-scope-${UUID.randomUUID()}"
        val membershipId = UUID.randomUUID().toString()
        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about)
            values (?, ?, '다른 프로필 클럽', '다른 프로필 클럽', '다른 프로필 클럽입니다.')
            """.trimIndent(),
            clubId,
            clubSlug,
        )
        createdClubIds += clubId
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            select ?, ?, users.id, 'MEMBER', 'ACTIVE', timestampadd(second, 1, utc_timestamp(6)), 'OtherAvatar', ?
            from users
            where users.email = ?
            """.trimIndent(),
            membershipId,
            clubId,
            avatarKey,
            email,
        )
        createdMembershipIds += membershipId
        return membershipId
    }

    private fun sessionCookieForEmail(email: String): Cookie {
        val userId =
            jdbcTemplate.queryForObject(
                "select id from users where email = ?",
                String::class.java,
                email,
            ) ?: error("Expected seeded user for $email")
        val issuedSession =
            authSessionService.issueSession(
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
            """
            select memberships.short_name
            from memberships
            join users on users.id = memberships.user_id
            where users.email = ?
            """.trimIndent(),
            String::class.java,
            email,
        ) ?: error("Expected display name for $email")

    private fun shortNameForMembership(membershipId: String): String =
        jdbcTemplate.queryForObject(
            """
            select memberships.short_name
            from memberships
            where memberships.id = ?
            """.trimIndent(),
            String::class.java,
            membershipId,
        ) ?: error("Expected display name for $membershipId")

    private fun avatarKeyForMembership(membershipId: String): String =
        jdbcTemplate.queryForObject(
            "select avatar_key from memberships where id = ?",
            String::class.java,
            membershipId,
        ) ?: error("Expected avatar key for $membershipId")

    private fun projectionGeneration(sessionId: String): Long =
        jdbcTemplate.queryForObject(
            "select coalesce((select generation from public_projection_current where session_id = ?), 0)",
            Long::class.java,
            sessionId,
        ) ?: 0

    private fun projectionReadable(sessionId: String): Boolean =
        jdbcTemplate.queryForObject(
            "select origin_readable from public_projection_current where session_id = ?",
            Boolean::class.java,
            sessionId,
        ) ?: false

    private fun rememberProjectionState(sessionId: String) {
        projectionSnapshots.putIfAbsent(
            sessionId,
            loadProjectionSnapshot(sessionId),
        )
    }

    private fun rememberClubProjectionState(clubId: String) {
        clubProjectionSnapshots.putIfAbsent(
            clubId,
            loadClubProjectionSnapshot(clubId),
        )
    }

    private fun loadProjectionSnapshot(sessionId: String): PublicProjectionSnapshot? =
        jdbcTemplate
            .query(
                """
                select club_id, publication_id_snapshot, generation, club_generation,
                       live_record_revision, origin_readable, convergence_id, updated_at
                from public_projection_current
                where session_id = ?
                """.trimIndent(),
                { rs, _ ->
                    PublicProjectionSnapshot(
                        clubId = rs.getString("club_id"),
                        publicationId = rs.getString("publication_id_snapshot"),
                        generation = rs.getLong("generation"),
                        clubGeneration = rs.getLong("club_generation"),
                        liveRecordRevision = rs.getLong("live_record_revision").takeUnless { rs.wasNull() },
                        originReadable = rs.getBoolean("origin_readable"),
                        convergenceId = rs.getString("convergence_id"),
                        updatedAt = rs.getTimestamp("updated_at"),
                    )
                },
                sessionId,
            ).singleOrNull()

    private fun loadClubProjectionSnapshot(clubId: String): ClubProjectionSnapshot? =
        jdbcTemplate
            .query(
                """
                select generation, origin_readable, convergence_id, updated_at
                from public_club_projection_generations
                where club_id = ?
                """.trimIndent(),
                { rs, _ ->
                    ClubProjectionSnapshot(
                        generation = rs.getLong("generation"),
                        originReadable = rs.getBoolean("origin_readable"),
                        convergenceId = rs.getString("convergence_id"),
                        updatedAt = rs.getTimestamp("updated_at"),
                    )
                },
                clubId,
            ).singleOrNull()

    private fun cleanupCreatedPublicProjectionMutations() {
        if (createdMembershipIds.isEmpty()) return
        val placeholders = createdMembershipIds.joinToString(", ") { "?" }
        val receiptIds =
            jdbcTemplate
                .queryForList(
                    """
                    select id from auth_public_projection_mutation_receipts
                    where subject_membership_id_snapshot in ($placeholders)
                    """.trimIndent(),
                    String::class.java,
                    *createdMembershipIds.toTypedArray(),
                ).filterNotNull()
                .toSet()
        if (receiptIds.isEmpty()) return
        val receiptPlaceholders = receiptIds.joinToString(", ") { "?" }
        val convergenceIds =
            jdbcTemplate
                .queryForList(
                    """
                    select convergence_id from public_mutation_convergence_links
                    where mutation_receipt_id in ($receiptPlaceholders)
                    """.trimIndent(),
                    String::class.java,
                    *receiptIds.toTypedArray(),
                ).filterNotNull()
                .toSet()
        deleteWhereIn("public_convergence_events", "convergence_id", convergenceIds)
        deleteWhereIn("public_convergence_work", "convergence_id", convergenceIds)
        deleteWhereIn("public_mutation_convergence_links", "mutation_receipt_id", receiptIds)
        deleteWhereIn("auth_public_projection_mutation_receipts", "id", receiptIds)
    }

    private fun restoreProjectionSnapshots() {
        projectionSnapshots.forEach { (sessionId, snapshot) ->
            if (snapshot == null) {
                jdbcTemplate.update("delete from public_projection_current where session_id = ?", sessionId)
            } else {
                jdbcTemplate.update(
                    """
                    update public_projection_current
                    set club_id = ?, publication_id_snapshot = ?, generation = ?, club_generation = ?,
                        live_record_revision = ?, origin_readable = ?, convergence_id = ?, updated_at = ?
                    where session_id = ?
                    """.trimIndent(),
                    snapshot.clubId,
                    snapshot.publicationId,
                    snapshot.generation,
                    snapshot.clubGeneration,
                    snapshot.liveRecordRevision,
                    snapshot.originReadable,
                    snapshot.convergenceId,
                    snapshot.updatedAt,
                    sessionId,
                )
            }
        }
        clubProjectionSnapshots.forEach { (clubId, snapshot) ->
            if (snapshot == null) {
                jdbcTemplate.update("delete from public_club_projection_generations where club_id = ?", clubId)
            } else {
                jdbcTemplate.update(
                    """
                    update public_club_projection_generations
                    set generation = ?, origin_readable = ?, convergence_id = ?, updated_at = ?
                    where club_id = ?
                    """.trimIndent(),
                    snapshot.generation,
                    snapshot.originReadable,
                    snapshot.convergenceId,
                    snapshot.updatedAt,
                    clubId,
                )
            }
        }
        projectionSnapshots.forEach { (sessionId, snapshot) ->
            assertEquals(snapshot, loadProjectionSnapshot(sessionId), "Projection fixture leaked for $sessionId")
        }
        clubProjectionSnapshots.forEach { (clubId, snapshot) ->
            assertEquals(snapshot, loadClubProjectionSnapshot(clubId), "Club projection fixture leaked for $clubId")
        }
    }

    private fun jsonString(value: String): String = "\"${value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n")}\""

    private fun deleteWhereIn(
        tableName: String,
        columnName: String,
        values: Set<String>,
    ) {
        if (values.isEmpty()) {
            return
        }

        val placeholders = values.joinToString(", ") { "?" }
        jdbcTemplate.update(
            "delete from $tableName where $columnName in ($placeholders)",
            *values.toTypedArray(),
        )
    }
}
