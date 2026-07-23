package com.readmates.notification.api

import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.put

private const val CLEANUP_HOST_NOTIFICATION_POLICY_SQL = """
    delete from club_notification_policies
    where club_id = '00000000-0000-0000-0000-000000000001';
"""

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@AutoConfigureMockMvc
@Sql(
    statements = [CLEANUP_HOST_NOTIFICATION_POLICY_SQL],
    executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
)
@Sql(
    statements = [CLEANUP_HOST_NOTIFICATION_POLICY_SQL],
    executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
)
@Tag("integration")
class HostNotificationPolicyControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `missing host policy returns reminder off`() {
        mockMvc
            .get("/api/host/notifications/policy") {
                with(user("host@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.sessionReminderEnabled") { value(false) }
                jsonPath("$.updatedAt") { value(null) }
            }
    }

    @Test
    fun `host explicitly opts in to reminders`() {
        mockMvc
            .put("/api/host/notifications/policy") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"sessionReminderEnabled":true}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.sessionReminderEnabled") { value(true) }
                jsonPath("$.updatedAt") { isString() }
            }

        mockMvc
            .get("/api/host/notifications/policy") {
                with(user("host@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.sessionReminderEnabled") { value(true) }
                jsonPath("$.updatedAt") { isString() }
            }
    }

    @Test
    fun `member cannot read or update host policy`() {
        mockMvc
            .get("/api/host/notifications/policy") {
                with(user("member1@example.com"))
            }.andExpect {
                status { isForbidden() }
            }

        mockMvc
            .put("/api/host/notifications/policy") {
                with(user("member1@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"sessionReminderEnabled":true}"""
            }.andExpect {
                status { isForbidden() }
            }
    }
}
