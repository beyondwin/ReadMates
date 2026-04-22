package com.readmates.auth.api

import com.readmates.auth.application.MemberAccountRepository
import com.readmates.support.MySqlTestContainer
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.mock.web.MockHttpSession
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.dev.login-enabled=true",
    ],
)
@AutoConfigureMockMvc
@Sql(
    statements = [
        DevLoginControllerTest.CLEANUP_NON_SEED_ACTIVE_MEMBER_SQL,
    ],
    executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
)
class DevLoginControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val memberAccountRepository: MemberAccountRepository,
) {
    @Test
    fun `logs in seeded host by email`() {
        mockMvc.post("/api/dev/login") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"host@example.com"}"""
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.authenticated") { value(true) }
                jsonPath("$.email") { value("host@example.com") }
                jsonPath("$.role") { value("HOST") }
                jsonPath("$.displayName") { value("김호스트") }
                jsonPath("$.shortName") { value("호스트") }
            }
    }

    @Test
    fun `logs in seeded host after real Google subject is connected`() {
        jdbcTemplate.update(
            """
            update users
            set google_subject_id = '111525753821806126443'
            where email = 'host@example.com'
            """.trimIndent(),
        )

        mockMvc.post("/api/dev/login") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"host@example.com"}"""
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.authenticated") { value(true) }
                jsonPath("$.email") { value("host@example.com") }
                jsonPath("$.role") { value("HOST") }
            }
    }

    @Test
    fun `rejects unknown email`() {
        mockMvc.post("/api/dev/login") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"unknown@example.com"}"""
        }
            .andExpect {
                status { isUnauthorized() }
            }
    }

    @Test
    fun `rejects malformed email`() {
        mockMvc.post("/api/dev/login") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"not-an-email"}"""
        }
            .andExpect {
                status { isBadRequest() }
            }
    }

    @Test
    fun `rejects active member that is not from dev seed`() {
        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, profile_image_url)
            values (
              '00000000-0000-0000-0000-000000009901',
              'google-real-non-seed-member',
              'active.nonseed@example.com',
              '비시드',
              '비시드',
              null
            )
            on duplicate key update
              email = values(email),
              google_subject_id = values(google_subject_id),
              name = values(name),
              short_name = values(short_name),
              profile_image_url = values(profile_image_url),
              updated_at = utc_timestamp(6)
            """.trimIndent(),
        )
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at)
            select
              '00000000-0000-0000-0000-000000009902',
              clubs.id,
              users.id,
              'MEMBER',
              'ACTIVE',
              utc_timestamp(6)
            from clubs
            join users on users.email = 'active.nonseed@example.com'
            where clubs.slug = 'reading-sai'
            on duplicate key update
              role = values(role),
              status = values(status),
              joined_at = values(joined_at)
            """.trimIndent(),
        )

        mockMvc.post("/api/dev/login") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"active.nonseed@example.com"}"""
        }
            .andExpect {
                status { isUnauthorized() }
            }
    }

    @Test
    fun `dev Google member creation refuses reused subject for a different email`() {
        createGoogleSubjectOwner(
            email = "subject.owner@example.com",
            googleSubjectId = "readmates-dev-google-subject-owner",
            displayName = "Subject Owner",
        )

        val member = memberAccountRepository.createDevGoogleMember(
            googleSubjectId = "readmates-dev-google-subject-owner",
            email = "subject.new@example.com",
            displayName = "Subject New",
            profileImageUrl = null,
        )

        assertNull(member)
        val ownerRow = jdbcTemplate.queryForMap(
            "select email, name from users where google_subject_id = 'readmates-dev-google-subject-owner'",
        )
        val newEmailCount = jdbcTemplate.queryForObject(
            "select count(*) from users where email = 'subject.new@example.com'",
            Int::class.java,
        )
        assertEquals("subject.owner@example.com", ownerRow["email"])
        assertEquals("Subject Owner", ownerRow["name"])
        assertEquals(0, newEmailCount)
    }

    @Test
    fun `persists dev login session for auth me`() {
        val session = mockMvc.post("/api/dev/login") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"host@example.com"}"""
        }
            .andExpect {
                status { isOk() }
            }
            .andReturn()
            .request
            .session as MockHttpSession

        mockMvc.get("/api/auth/me") {
            this.session = session
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.authenticated") { value(true) }
                jsonPath("$.email") { value("host@example.com") }
                jsonPath("$.role") { value("HOST") }
                jsonPath("$.displayName") { value("김호스트") }
                jsonPath("$.shortName") { value("호스트") }
            }
    }

    @Test
    fun `logout clears dev login session`() {
        val session = mockMvc.post("/api/dev/login") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"host@example.com"}"""
        }
            .andExpect {
                status { isOk() }
            }
            .andReturn()
            .request
            .session as MockHttpSession

        mockMvc.post("/api/dev/logout") {
            this.session = session
        }
            .andExpect {
                status { isNoContent() }
            }

        mockMvc.get("/api/auth/me") {
            this.session = session
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.authenticated") { value(false) }
                jsonPath("$.email") { value(null) }
                jsonPath("$.role") { value(null) }
            }
    }

    companion object {
        const val CLEANUP_NON_SEED_ACTIVE_MEMBER_SQL = """
            update users
            set google_subject_id = 'readmates-dev-google-host'
            where email = 'host@example.com';

            delete from memberships
            where user_id in (
              select id
              from users
              where email = 'active.nonseed@example.com'
                or email in (
                  'subject.owner@example.com',
                  'subject.new@example.com'
                )
            );
            delete from users
            where email = 'active.nonseed@example.com'
               or email in (
                 'subject.owner@example.com',
                 'subject.new@example.com'
               );
        """

        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }

    private fun createGoogleSubjectOwner(email: String, googleSubjectId: String, displayName: String) {
        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, profile_image_url, auth_provider)
            values (uuid(), ?, ?, ?, ?, null, 'GOOGLE')
            on duplicate key update
              google_subject_id = values(google_subject_id),
              email = values(email),
              name = values(name),
              short_name = values(short_name),
              profile_image_url = values(profile_image_url),
              auth_provider = values(auth_provider),
              updated_at = utc_timestamp(6)
            """.trimIndent(),
            googleSubjectId,
            email,
            displayName,
            displayName,
        )
    }
}

@SpringBootTest(
    properties = [
        "readmates.dev.login-enabled=false",
        "spring.flyway.enabled=false",
        "spring.autoconfigure.exclude=org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration,org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration",
    ],
)
@AutoConfigureMockMvc
class DevLoginDisabledControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
) {
    @Test
    fun `dev login endpoint is unavailable when disabled`() {
        mockMvc.post("/api/dev/login") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"host@example.com"}"""
        }
            .andExpect {
                status { isNotFound() }
            }
    }
}

@SpringBootTest(
    properties = [
        "readmates.dev.login-enabled=true",
        "spring.flyway.enabled=false",
        "spring.autoconfigure.exclude=org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration,org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration",
    ],
)
@AutoConfigureMockMvc
@ActiveProfiles("prod")
class DevLoginProductionProfileControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
) {
    @Test
    fun `dev login endpoint is unavailable under prod profile`() {
        mockMvc.post("/api/dev/login") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"host@example.com"}"""
        }
            .andExpect {
                status { isNotFound() }
            }
    }
}
