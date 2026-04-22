package com.readmates.auth.api

import com.readmates.support.MySqlTestContainer
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.dev.login-enabled=true",
        "readmates.app-base-url=http://localhost:3000",
    ],
)
@AutoConfigureMockMvc
@ActiveProfiles("dev")
@Sql(statements = [DevInvitationControllerTest.CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
class DevInvitationControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
) {
    @Test
    fun `legacy dev password invitation accept endpoint returns gone`() {
        val token = createInvitation("dev.invited@example.com")

        val result = mockMvc.post("/api/dev/invitations/$token/accept")
            .andExpect {
                status { isGone() }
            }.andReturn()

        assertEquals("Password invitation acceptance has been removed", result.response.errorMessage)
    }

    private fun createInvitation(email: String): String {
        val acceptUrl = mockMvc.post("/api/host/invitations") {
            with(user("host@example.com"))
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"$email","name":"개발 초대"}"""
        }
            .andExpect { status { isCreated() } }
            .andReturn()
            .response
            .contentAsString
            .substringAfter("\"acceptUrl\":\"")
            .substringBefore("\"")

        return acceptUrl.substringAfterLast("/")
    }

    companion object {
        const val CLEANUP_SQL = """
            delete from session_participants
            where membership_id in (
              select memberships.id
              from memberships
              join users on users.id = memberships.user_id
              where users.email = 'dev.invited@example.com'
            );
            delete from invitations where invited_email = 'dev.invited@example.com';
            delete from memberships
            where user_id in (
              select id from users where email = 'dev.invited@example.com'
            );
            delete from users where email = 'dev.invited@example.com';
        """

        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
