package com.readmates.auth.application.service

import com.readmates.auth.application.port.out.GoogleAccountStorePort
import com.readmates.auth.application.port.out.MemberAvatarAllocationPort
import com.readmates.auth.application.port.out.MemberIdentityLookupPort
import com.readmates.auth.application.port.out.MembershipDuplicateException
import com.readmates.auth.application.port.out.PlatformAdminLookupPort
import com.readmates.auth.domain.BookClubAvatarKey
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.shared.security.CurrentMember
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.mockito.Mockito.inOrder
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.jdbc.Sql
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import javax.sql.DataSource

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@Sql(statements = [GoogleLoginServiceTest.CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [GoogleLoginServiceTest.CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class GoogleLoginServiceTest(
    @param:Autowired private val googleLoginService: GoogleLoginService,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val dataSource: DataSource,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `allocates target club avatar before persisting an explicit viewer membership`() {
        val memberIdentityLookup = mock(MemberIdentityLookupPort::class.java)
        val googleAccountStore = mock(GoogleAccountStorePort::class.java)
        val platformAdminLookup = mock(PlatformAdminLookupPort::class.java)
        val avatarAllocation = mock(MemberAvatarAllocationPort::class.java)
        val allocatedKey = BookClubAvatarKey.SHEEP_NOTEBOOK
        val userId = UUID.randomUUID()
        val clubId = UUID.randomUUID()
        val createdMember =
            CurrentMember(
                userId = userId,
                membershipId = UUID.randomUUID(),
                clubId = clubId,
                clubSlug = "reading-sai",
                email = "allocated.viewer@example.com",
                displayName = "Allocated Viewer",
                accountName = "Allocated Viewer",
                role = MembershipRole.MEMBER,
                membershipStatus = MembershipStatus.VIEWER,
                avatarKey = allocatedKey.wireValue,
            )
        `when`(avatarAllocation.allocateForClubSlug("reading-sai", null)).thenReturn(allocatedKey)
        `when`(memberIdentityLookup.findAnyUserIdByEmail("allocated.viewer@example.com")).thenReturn(null)
        `when`(
            googleAccountStore.createGoogleUser(
                "google-allocated-viewer",
                "allocated.viewer@example.com",
                "Allocated Viewer",
                "https://example.com/profile.png",
            ),
        ).thenReturn(userId)
        `when`(googleAccountStore.findActivePublicClubIdBySlug("reading-sai")).thenReturn(clubId)
        `when`(memberIdentityLookup.findMembershipStatusByUserIdAndClubId(userId, clubId)).thenReturn(null)
        `when`(
            googleAccountStore.createViewerMembershipForExistingUser(userId, "reading-sai", allocatedKey),
        ).thenReturn(createdMember)
        val service =
            GoogleLoginService(
                memberIdentityLookup,
                googleAccountStore,
                platformAdminLookup,
                avatarAllocation,
            )

        val actual =
            service
                .loginVerifiedGoogleUserForSession(
                    googleSubjectId = "google-allocated-viewer",
                    email = "allocated.viewer@example.com",
                    displayName = "Allocated Viewer",
                    profileImageUrl = "https://example.com/profile.png",
                    targetClubSlug = "reading-sai",
                ).currentMember

        assertEquals(createdMember, actual)
        inOrder(avatarAllocation, googleAccountStore).apply {
            verify(avatarAllocation).allocateForClubSlug("reading-sai", null)
            verify(googleAccountStore).createViewerMembershipForExistingUser(userId, "reading-sai", allocatedKey)
        }
    }

    @Test
    fun `connects existing gmail user and preserves active membership`() {
        val member =
            googleLoginService.loginVerifiedGoogleUser(
                googleSubjectId = "google-existing-host",
                email = "host@example.com",
                displayName = "김호스트",
                profileImageUrl = "https://example.com/sample-host.png",
            )

        assertEquals("host@example.com", member.email)
        assertEquals(MembershipStatus.ACTIVE, member.membershipStatus)
        assertEquals("HOST", member.role.name)

        val subject =
            jdbcTemplate.queryForObject(
                "select google_subject_id from users where email = 'host@example.com'",
                String::class.java,
            )
        assertEquals("google-existing-host", subject)
    }

    @Test
    fun `generic google login creates an account without unintended membership`() {
        val result =
            googleLoginService.loginVerifiedGoogleUserForSession(
                googleSubjectId = "google-new-viewer-user",
                email = "new.viewer@example.com",
                displayName = "New Viewer",
                profileImageUrl = "https://example.com/new.png",
                targetClubSlug = null,
            )

        assertNull(result.currentMember)
        assertEquals(
            0,
            jdbcTemplate.queryForObject(
                "select count(*) from memberships join users on users.id = memberships.user_id where users.email = ?",
                Int::class.java,
                "new.viewer@example.com",
            ),
        )
    }

    @Test
    fun `explicit active public target creates viewer only in that club`() {
        val result =
            googleLoginService.loginVerifiedGoogleUserForSession(
                googleSubjectId = "google-target-viewer-user",
                email = "target.viewer@example.com",
                displayName = "Target Viewer",
                profileImageUrl = null,
                targetClubSlug = "sample-book-club",
            )

        assertEquals("sample-book-club", result.currentMember?.clubSlug)
        assertEquals(MembershipStatus.VIEWER, result.currentMember?.membershipStatus)
        assertEquals(
            listOf("sample-book-club"),
            jdbcTemplate.queryForList(
                """
                select clubs.slug
                from memberships
                join clubs on clubs.id = memberships.club_id
                join users on users.id = memberships.user_id
                where users.email = ?
                """.trimIndent(),
                String::class.java,
                "target.viewer@example.com",
            ),
        )
    }

    @Test
    fun `target viewer creation keeps neutral membership display names unique`() {
        insertTargetMember("display.owner@example.com", "google-display-owner", "VIEWER", "Same Name")

        val result =
            googleLoginService.loginVerifiedGoogleUserForSession(
                googleSubjectId = "google-display-joiner",
                email = "display.joiner@example.com",
                displayName = "Same Name",
                profileImageUrl = null,
                targetClubSlug = "sample-book-club",
            )

        assertEquals(MembershipStatus.VIEWER, result.currentMember?.membershipStatus)
        val displayNames =
            jdbcTemplate
                .queryForList(
                    """
                    select memberships.short_name
                    from memberships
                    join clubs on clubs.id = memberships.club_id
                    join users on users.id = memberships.user_id
                    where clubs.slug = 'sample-book-club'
                      and users.email in ('display.owner@example.com', 'display.joiner@example.com')
                    """.trimIndent(),
                    String::class.java,
                ).filterNotNull()
        assertEquals(2, displayNames.distinct().size)
        assertTrue(displayNames.contains("Same Name"))
        assertTrue(displayNames.any { it.startsWith("둘러보기-") })
    }

    @Test
    fun `existing user in another club joins only the explicit target`() {
        val result =
            googleLoginService.loginVerifiedGoogleUserForSession(
                googleSubjectId = "google-existing-other-club",
                email = "host@example.com",
                displayName = "김호스트",
                profileImageUrl = null,
                targetClubSlug = "sample-book-club",
            )

        assertEquals("sample-book-club", result.currentMember?.clubSlug)
        assertEquals(MembershipStatus.VIEWER, result.currentMember?.membershipStatus)
        assertEquals(
            setOf("reading-sai", "sample-book-club"),
            jdbcTemplate
                .queryForList(
                    """
                    select clubs.slug
                    from memberships
                    join clubs on clubs.id = memberships.club_id
                    join users on users.id = memberships.user_id
                    where users.email = ?
                    """.trimIndent(),
                    String::class.java,
                    "host@example.com",
                ).toSet(),
        )
    }

    @Test
    fun `explicit target preserves viewer and active but rejects blocked membership states`() {
        listOf("VIEWER", "ACTIVE").forEach { status ->
            val email = "preserve.${status.lowercase()}@example.com"
            insertTargetMember(email, "google-preserve-${status.lowercase()}", status)

            val result =
                googleLoginService.loginVerifiedGoogleUserForSession(
                    "google-preserve-${status.lowercase()}",
                    email,
                    "Preserve",
                    null,
                    "sample-book-club",
                )

            assertEquals(status, result.currentMember?.membershipStatus?.name)
        }

        listOf("LEFT", "SUSPENDED", "INACTIVE").forEach { status ->
            val email = "blocked.${status.lowercase()}@example.com"
            insertTargetMember(email, "google-blocked-${status.lowercase()}", status)

            org.junit.jupiter.api.assertThrows<GoogleLoginException> {
                googleLoginService.loginVerifiedGoogleUserForSession(
                    "google-blocked-${status.lowercase()}",
                    email,
                    "Blocked",
                    null,
                    "sample-book-club",
                )
            }
        }
    }

    @Test
    fun `explicit target rejects private inactive and missing clubs without membership`() {
        val states = listOf("PRIVATE" to "ACTIVE", "PUBLIC" to "SUSPENDED")
        states.forEachIndexed { index, (visibility, status) ->
            val slug = "blocked-join-$index"
            insertClub(slug, status, visibility)
            val email = "blocked.club.$index@example.com"

            org.junit.jupiter.api.assertThrows<GoogleLoginException> {
                googleLoginService.loginVerifiedGoogleUserForSession(
                    "google-blocked-club-$index",
                    email,
                    "Blocked Club",
                    null,
                    slug,
                )
            }
            assertEquals(
                0,
                jdbcTemplate.queryForObject(
                    "select count(*) from users where email = ?",
                    Int::class.java,
                    email,
                ),
            )
        }
    }

    @Test
    fun `rejects google subject already connected to another email`() {
        googleLoginService.loginVerifiedGoogleUserForSession(
            googleSubjectId = "google-conflict-subject",
            email = "conflict.one@example.com",
            displayName = "Conflict One",
            profileImageUrl = null,
            targetClubSlug = null,
        )

        org.junit.jupiter.api.assertThrows<GoogleLoginException> {
            googleLoginService.loginVerifiedGoogleUserForSession(
                googleSubjectId = "google-conflict-subject",
                email = "conflict.two@example.com",
                displayName = "Conflict Two",
                profileImageUrl = null,
                targetClubSlug = null,
            )
        }
    }

    @Test
    fun `returns existing member when viewer creation races with same google account`() {
        val googleSubjectId = "google-race-viewer-user"
        val email = "race.viewer@example.com"
        val userId = UUID.randomUUID().toString()
        val membershipId = UUID.randomUUID().toString()
        val executor = Executors.newSingleThreadExecutor()

        dataSource.connection.use { connection ->
            connection.autoCommit = false
            try {
                connection
                    .prepareStatement(
                        """
                        insert into users (id, google_subject_id, email, name, short_name, auth_provider)
                        values (?, ?, ?, 'Race Viewer', 'Race Viewer', 'GOOGLE')
                        """.trimIndent(),
                    ).use { statement ->
                        statement.setString(1, userId)
                        statement.setString(2, googleSubjectId)
                        statement.setString(3, email)
                        statement.executeUpdate()
                    }
                connection
                    .prepareStatement(
                        """
                        insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
                        values (?, '00000000-0000-0000-0000-000000000001', ?, 'MEMBER', 'VIEWER', null, 'Race Viewer', 'mushroom-green-book')
                        """.trimIndent(),
                    ).use { statement ->
                        statement.setString(1, membershipId)
                        statement.setString(2, userId)
                        statement.executeUpdate()
                    }

                val future =
                    executor.submit<CurrentMember> {
                        googleLoginService.loginVerifiedGoogleUser(
                            googleSubjectId = googleSubjectId,
                            email = email,
                            displayName = "Race Viewer",
                            profileImageUrl = null,
                        )
                    }
                Thread.sleep(250)
                assertFalse(future.isDone)

                connection.commit()

                val member = future.get(5, TimeUnit.SECONDS)
                assertEquals(email, member.email)
                assertEquals(MembershipStatus.VIEWER, member.membershipStatus)
                assertEquals(userId, member.userId.toString())
            } catch (exception: Throwable) {
                connection.rollback()
                throw exception
            } finally {
                executor.shutdownNow()
            }
        }
    }

    @Test
    fun `recovers a concurrent target membership unique conflict by exact club lookup`() {
        val memberIdentityLookup = mock(MemberIdentityLookupPort::class.java)
        val googleAccountStore = mock(GoogleAccountStorePort::class.java)
        val platformAdminLookup = mock(PlatformAdminLookupPort::class.java)
        val avatarAllocation = mock(MemberAvatarAllocationPort::class.java)
        val userId = UUID.randomUUID()
        val clubId = UUID.randomUUID()
        val avatarKey = BookClubAvatarKey.DEER_BROWN_BOOK
        val racedMember =
            CurrentMember(
                userId = userId,
                membershipId = UUID.randomUUID(),
                clubId = clubId,
                clubSlug = "sample-book-club",
                email = "membership.race@example.com",
                displayName = "Race",
                accountName = "Race",
                role = MembershipRole.MEMBER,
                membershipStatus = MembershipStatus.VIEWER,
                avatarKey = avatarKey.wireValue,
            )
        `when`(googleAccountStore.googleSubjectOwnerEmail("google-membership-race"))
            .thenReturn("membership.race@example.com")
        `when`(googleAccountStore.findUserIdByGoogleSubject("google-membership-race")).thenReturn(userId)
        `when`(googleAccountStore.findActivePublicClubIdBySlug("sample-book-club")).thenReturn(clubId)
        `when`(memberIdentityLookup.findMembershipStatusByUserIdAndClubId(userId, clubId))
            .thenReturn(null, MembershipStatus.VIEWER)
        `when`(avatarAllocation.allocateForClubSlug("sample-book-club", null)).thenReturn(avatarKey)
        `when`(googleAccountStore.createViewerMembershipForExistingUser(userId, "sample-book-club", avatarKey))
            .thenThrow(MembershipDuplicateException(IllegalStateException("unique conflict")))
        `when`(memberIdentityLookup.findMemberByUserIdAndClubId(userId, clubId)).thenReturn(racedMember)
        val service =
            GoogleLoginService(
                memberIdentityLookup,
                googleAccountStore,
                platformAdminLookup,
                avatarAllocation,
            )

        val result =
            service.loginVerifiedGoogleUserForSession(
                "google-membership-race",
                "membership.race@example.com",
                "Race",
                null,
                "sample-book-club",
            )

        assertEquals(racedMember, result.currentMember)
    }

    @Test
    fun `recovers a real concurrent target membership insert by exact club lookup`() {
        val googleSubjectId = "google-target-membership-race-db"
        val email = "target.membership.race.db@example.com"
        val userId = UUID.randomUUID().toString()
        val membershipId = UUID.randomUUID().toString()
        insertGoogleUser(userId, googleSubjectId, email, "Target Race")
        val executor = Executors.newSingleThreadExecutor()

        dataSource.connection.use { connection ->
            connection.autoCommit = false
            try {
                connection
                    .prepareStatement(
                        """
                        insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
                        values (?, '00000000-0000-0000-0000-000000000002', ?, 'MEMBER', 'VIEWER', null, 'Target Race', 'hedgehog-green-book')
                        """.trimIndent(),
                    ).use { statement ->
                        statement.setString(1, membershipId)
                        statement.setString(2, userId)
                        statement.executeUpdate()
                    }

                val future =
                    executor.submit<GoogleLoginResult> {
                        googleLoginService.loginVerifiedGoogleUserForSession(
                            googleSubjectId = googleSubjectId,
                            email = email,
                            displayName = "Target Race",
                            profileImageUrl = null,
                            targetClubSlug = "sample-book-club",
                        )
                    }
                Thread.sleep(250)
                assertFalse(future.isDone)

                connection.commit()

                val result = future.get(5, TimeUnit.SECONDS)
                assertEquals("sample-book-club", result.currentMember?.clubSlug)
                assertEquals(MembershipStatus.VIEWER, result.currentMember?.membershipStatus)
                assertEquals(membershipId, result.currentMember?.membershipId.toString())
                assertEquals(
                    1,
                    jdbcTemplate.queryForObject(
                        """
                        select count(*)
                        from memberships
                        where club_id = '00000000-0000-0000-0000-000000000002'
                          and user_id = ?
                        """.trimIndent(),
                        Int::class.java,
                        userId,
                    ),
                )
            } catch (exception: Throwable) {
                connection.rollback()
                throw exception
            } finally {
                executor.shutdownNow()
            }
        }
    }

    private fun insertGoogleUser(
        userId: String,
        googleSubjectId: String,
        email: String,
        name: String,
    ) {
        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, auth_provider)
            values (?, ?, ?, ?, ?, 'GOOGLE')
            """.trimIndent(),
            userId,
            googleSubjectId,
            email,
            name,
            name,
        )
    }

    private fun insertTargetMember(
        email: String,
        googleSubjectId: String,
        status: String,
        shortName: String = email.substringBefore('@').take(50),
    ) {
        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, auth_provider)
            values (uuid(), ?, ?, 'Target User', ?, 'GOOGLE')
            """.trimIndent(),
            googleSubjectId,
            email,
            shortName,
        )
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            select uuid(), clubs.id, users.id, 'MEMBER', ?, utc_timestamp(6), users.short_name, 'hedgehog-green-book'
            from clubs join users on users.email = ?
            where clubs.slug = 'sample-book-club'
            """.trimIndent(),
            status,
            email,
        )
    }

    private fun insertClub(
        slug: String,
        status: String,
        publicVisibility: String,
    ) {
        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about, status, public_visibility)
            values (uuid(), ?, ?, '', '', ?, ?)
            """.trimIndent(),
            slug,
            slug,
            status,
            publicVisibility,
        )
    }

    companion object {
        const val CLEANUP_SQL = """
            update users
            set google_subject_id = 'readmates-dev-google-host',
                profile_image_url = null,
                auth_provider = 'GOOGLE',
                updated_at = utc_timestamp(6)
            where email = 'host@example.com';

            delete from memberships
            where club_id = '00000000-0000-0000-0000-000000000002'
              and user_id = (select id from users where email = 'host@example.com');

            delete from memberships
            where user_id in (
              select id
              from users
              where email in (
                'new.viewer@example.com',
                'conflict.one@example.com',
                'conflict.two@example.com',
                'race.viewer@example.com'
                ,'target.viewer@example.com'
                ,'preserve.viewer@example.com'
                ,'preserve.active@example.com'
                ,'blocked.left@example.com'
                ,'blocked.suspended@example.com'
                ,'blocked.inactive@example.com'
                ,'blocked.club.0@example.com'
                ,'blocked.club.1@example.com'
                ,'display.owner@example.com'
                ,'display.joiner@example.com'
              )
                 or google_subject_id in (
                   'google-new-viewer-user',
                   'google-conflict-subject',
                   'google-race-viewer-user'
                 )
            );

            delete from users
            where email in (
              'new.viewer@example.com',
              'conflict.one@example.com',
              'conflict.two@example.com',
              'race.viewer@example.com'
              ,'target.viewer@example.com'
              ,'preserve.viewer@example.com'
              ,'preserve.active@example.com'
              ,'blocked.left@example.com'
              ,'blocked.suspended@example.com'
              ,'blocked.inactive@example.com'
              ,'blocked.club.0@example.com'
              ,'blocked.club.1@example.com'
              ,'display.owner@example.com'
              ,'display.joiner@example.com'
            )
               or google_subject_id in (
                 'google-new-viewer-user',
                 'google-conflict-subject',
                 'google-race-viewer-user'
               );

            delete from clubs where slug in ('blocked-join-0', 'blocked-join-1');
        """
    }
}
