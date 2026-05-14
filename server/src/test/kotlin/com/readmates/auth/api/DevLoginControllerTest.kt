package com.readmates.auth.api

import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.mock.web.MockHttpSession
import org.springframework.test.context.ActiveProfiles
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
@Tag("integration")
class DevLoginControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `logs in seeded host by email`() {
        mockMvc
            .post("/api/dev/login") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"email":"host@example.com"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.authenticated") { value(true) }
                jsonPath("$.email") { value("host@example.com") }
                jsonPath("$.role") { value("HOST") }
                jsonPath("$.displayName") { value("호스트") }
                jsonPath("$.accountName") { value("김호스트") }
                jsonPath("$.shortName") { doesNotExist() }
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

        mockMvc
            .post("/api/dev/login") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"email":"host@example.com"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.authenticated") { value(true) }
                jsonPath("$.email") { value("host@example.com") }
                jsonPath("$.role") { value("HOST") }
            }
    }

    @Test
    fun `rejects unknown email`() {
        mockMvc
            .post("/api/dev/login") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"email":"unknown@example.com"}"""
            }.andExpect {
                status { isUnauthorized() }
            }
    }

    @Test
    fun `rejects malformed email`() {
        mockMvc
            .post("/api/dev/login") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"email":"not-an-email"}"""
            }.andExpect {
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
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name)
            select
              '00000000-0000-0000-0000-000000009902',
              clubs.id,
              users.id,
              'MEMBER',
              'ACTIVE',
              utc_timestamp(6),
              users.short_name
            from clubs
            join users on users.email = 'active.nonseed@example.com'
            where clubs.slug = 'reading-sai'
            on duplicate key update
              role = values(role),
              status = values(status),
              joined_at = values(joined_at),
              short_name = values(short_name)
            """.trimIndent(),
        )

        mockMvc
            .post("/api/dev/login") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"email":"active.nonseed@example.com"}"""
            }.andExpect {
                status { isUnauthorized() }
            }
    }

    @Test
    fun `persists dev login session for auth me`() {
        val session =
            mockMvc
                .post("/api/dev/login") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"email":"host@example.com"}"""
                }.andExpect {
                    status { isOk() }
                }.andReturn()
                .request
                .session as MockHttpSession

        mockMvc
            .get("/api/auth/me") {
                this.session = session
            }.andExpect {
                status { isOk() }
                jsonPath("$.authenticated") { value(true) }
                jsonPath("$.email") { value("host@example.com") }
                jsonPath("$.role") { value("HOST") }
                jsonPath("$.displayName") { value("호스트") }
                jsonPath("$.accountName") { value("김호스트") }
                jsonPath("$.shortName") { doesNotExist() }
            }
    }

    @Test
    fun `logout clears dev login session`() {
        val session =
            mockMvc
                .post("/api/dev/login") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"email":"host@example.com"}"""
                }.andExpect {
                    status { isOk() }
                }.andReturn()
                .request
                .session as MockHttpSession

        mockMvc
            .post("/api/dev/logout") {
                this.session = session
            }.andExpect {
                status { isNoContent() }
            }

        mockMvc
            .get("/api/auth/me") {
                this.session = session
            }.andExpect {
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
            );
            delete from users
            where email = 'active.nonseed@example.com'
        """
    }
}

@SpringBootTest(
    properties = [
        "readmates.dev.login-enabled=false",
        "spring.flyway.enabled=false",
    ],
)
@AutoConfigureMockMvc
@Tag("integration")
class DevLoginDisabledControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `dev login endpoint is unavailable when disabled`() {
        mockMvc
            .post("/api/dev/login") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"email":"host@example.com"}"""
            }.andExpect {
                status { isNotFound() }
            }
    }
}

@SpringBootTest(
    properties = [
        "readmates.dev.login-enabled=true",
        "spring.flyway.enabled=false",
    ],
)
@AutoConfigureMockMvc
@ActiveProfiles("prod")
@Tag("integration")
class DevLoginProductionProfileControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `dev login endpoint is unavailable under prod profile`() {
        mockMvc
            .post("/api/dev/login") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"email":"host@example.com"}"""
            }.andExpect {
                status { isNotFound() }
            }
    }
}
