package com.readmates.auth.application

import com.readmates.auth.domain.MembershipStatus
import com.readmates.shared.security.CurrentMember
import com.readmates.support.MySqlTestContainer
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
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
class GoogleLoginServiceTest(
    @param:Autowired private val googleLoginService: GoogleLoginService,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val dataSource: DataSource,
) {
    @Test
    fun `connects existing gmail user and preserves active membership`() {
        val member = googleLoginService.loginVerifiedGoogleUser(
            googleSubjectId = "google-existing-host",
            email = "host@example.com",
            displayName = "김호스트",
            profileImageUrl = "https://example.com/sample-host.png",
        )

        assertEquals("host@example.com", member.email)
        assertEquals(MembershipStatus.ACTIVE, member.membershipStatus)
        assertEquals("HOST", member.role.name)

        val subject = jdbcTemplate.queryForObject(
            "select google_subject_id from users where email = 'host@example.com'",
            String::class.java,
        )
        assertEquals("google-existing-host", subject)
    }

    @Test
    fun `creates pending approval membership for new google user`() {
        val member = googleLoginService.loginVerifiedGoogleUser(
            googleSubjectId = "google-new-pending-user",
            email = "new.pending@example.com",
            displayName = "New Pending",
            profileImageUrl = "https://example.com/new.png",
        )

        assertEquals("new.pending@example.com", member.email)
        assertEquals(MembershipStatus.PENDING_APPROVAL, member.membershipStatus)
        assertEquals("MEMBER", member.role.name)
        assertNotNull(member.membershipId)
    }

    @Test
    fun `rejects google subject already connected to another email`() {
        googleLoginService.loginVerifiedGoogleUser(
            googleSubjectId = "google-conflict-subject",
            email = "conflict.one@example.com",
            displayName = "Conflict One",
            profileImageUrl = null,
        )

        org.junit.jupiter.api.assertThrows<GoogleLoginException> {
            googleLoginService.loginVerifiedGoogleUser(
                googleSubjectId = "google-conflict-subject",
                email = "conflict.two@example.com",
                displayName = "Conflict Two",
                profileImageUrl = null,
            )
        }
    }

    @Test
    fun `returns existing member when pending creation races with same google account`() {
        val googleSubjectId = "google-race-pending-user"
        val email = "race.pending@example.com"
        val userId = UUID.randomUUID().toString()
        val membershipId = UUID.randomUUID().toString()
        val executor = Executors.newSingleThreadExecutor()

        dataSource.connection.use { connection ->
            connection.autoCommit = false
            try {
                connection.prepareStatement(
                    """
                    insert into users (id, google_subject_id, email, name, short_name, auth_provider)
                    values (?, ?, ?, 'Race Pending', 'Race Pending', 'GOOGLE')
                    """.trimIndent(),
                ).use { statement ->
                    statement.setString(1, userId)
                    statement.setString(2, googleSubjectId)
                    statement.setString(3, email)
                    statement.executeUpdate()
                }
                connection.prepareStatement(
                    """
                    insert into memberships (id, club_id, user_id, role, status, joined_at)
                    values (?, '00000000-0000-0000-0000-000000000001', ?, 'MEMBER', 'PENDING_APPROVAL', null)
                    """.trimIndent(),
                ).use { statement ->
                    statement.setString(1, membershipId)
                    statement.setString(2, userId)
                    statement.executeUpdate()
                }

                val future = executor.submit<CurrentMember> {
                    googleLoginService.loginVerifiedGoogleUser(
                        googleSubjectId = googleSubjectId,
                        email = email,
                        displayName = "Race Pending",
                        profileImageUrl = null,
                    )
                }
                Thread.sleep(250)
                assertFalse(future.isDone)

                connection.commit()

                val member = future.get(5, TimeUnit.SECONDS)
                assertEquals(email, member.email)
                assertEquals(MembershipStatus.PENDING_APPROVAL, member.membershipStatus)
                assertEquals(userId, member.userId.toString())
            } catch (exception: Throwable) {
                connection.rollback()
                throw exception
            } finally {
                executor.shutdownNow()
            }
        }
    }

    companion object {
        const val CLEANUP_SQL = """
            update users
            set google_subject_id = 'readmates-dev-google-host',
                profile_image_url = null,
                auth_provider = 'GOOGLE',
                password_hash = null,
                password_set_at = null,
                updated_at = utc_timestamp(6)
            where email = 'host@example.com';

            delete from memberships
            where user_id in (
              select id
              from users
              where email in (
                'new.pending@example.com',
                'conflict.one@example.com',
                'conflict.two@example.com',
                'race.pending@example.com'
              )
                 or google_subject_id in (
                   'google-new-pending-user',
                   'google-conflict-subject',
                   'google-race-pending-user'
                 )
            );

            delete from users
            where email in (
              'new.pending@example.com',
              'conflict.one@example.com',
              'conflict.two@example.com',
              'race.pending@example.com'
            )
               or google_subject_id in (
                 'google-new-pending-user',
                 'google-conflict-subject',
                 'google-race-pending-user'
               );
        """

        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
