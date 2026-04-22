package com.readmates.auth.api

import com.readmates.support.MySqlTestContainer
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.dev.google-oauth-auto-member-enabled=true",
    ],
)
@AutoConfigureMockMvc
@ActiveProfiles("dev")
@Sql(
    statements = [
        DevGoogleOAuthAutoMemberTest.CLEANUP_SQL,
    ],
    executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
)
class DevGoogleOAuthAutoMemberTest(
    @param:Autowired private val mockMvc: MockMvc,
) {
    @Test
    fun `does not auto provision unknown Google user into demo club even when old dev flag is enabled`() {
        mockMvc.get("/api/auth/me") {
            with(localGoogleLogin("local.google.auth@example.com", "google-local-auth", "로컬 구글"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.authenticated") { value(false) }
                jsonPath("$.email") { value("local.google.auth@example.com") }
                jsonPath("$.role") { value(null) }
            }
    }

    @Test
    fun `unknown Google user cannot reach protected member api without invitation acceptance`() {
        mockMvc.get("/api/sessions/current") {
            with(localGoogleLogin("local.google.member@example.com", "google-local-member", "Local Member"))
        }
            .andExpect {
                status { isForbidden() }
            }
    }

    companion object {
        const val CLEANUP_SQL = """
            delete from memberships
            where user_id in (
              select id
              from users
              where email in ('local.google.auth@example.com', 'local.google.member@example.com')
            );
            delete from users
            where email in ('local.google.auth@example.com', 'local.google.member@example.com');
        """

        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.dev.google-oauth-auto-member-enabled=true",
    ],
)
@AutoConfigureMockMvc
@ActiveProfiles("prod")
@Sql(
    statements = [
        DevGoogleOAuthAutoMemberProductionProfileTest.CLEANUP_SQL,
    ],
    executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
)
class DevGoogleOAuthAutoMemberProductionProfileTest(
    @param:Autowired private val mockMvc: MockMvc,
) {
    @Test
    fun `does not auto provision Google user under prod profile`() {
        mockMvc.get("/api/auth/me") {
            with(localGoogleLogin("local.google.prod@example.com", "google-local-prod", "Prod Google"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.authenticated") { value(false) }
                jsonPath("$.email") { value("local.google.prod@example.com") }
                jsonPath("$.role") { value(null) }
            }
    }

    companion object {
        const val CLEANUP_SQL = """
            delete from memberships
            where user_id in (
              select id
              from users
              where email = 'local.google.prod@example.com'
            );
            delete from users
            where email = 'local.google.prod@example.com';
        """

        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}

private fun localGoogleLogin(email: String, subject: String, name: String) =
    oidcLogin().idToken { token ->
        token.subject(subject)
        token.claim("email", email)
        token.claim("email_verified", true)
        token.claim("name", name)
        token.claim("picture", "https://example.com/avatar.png")
    }
