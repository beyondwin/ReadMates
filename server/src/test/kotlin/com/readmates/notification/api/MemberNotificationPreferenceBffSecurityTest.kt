package com.readmates.notification.api

import com.readmates.support.MySqlTestContainer
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.put

private const val CLEANUP_MEMBER_NOTIFICATION_BFF_PREFERENCES_SQL = """
    delete from notification_preferences
    where club_id = '00000000-0000-0000-0000-000000000001';
"""

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.bff-secret=test-bff-secret",
        "readmates.allowed-origins=http://localhost:3000",
    ],
)
@AutoConfigureMockMvc
@Sql(
    statements = [
        CLEANUP_MEMBER_NOTIFICATION_BFF_PREFERENCES_SQL,
    ],
    executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
)
@Sql(
    statements = [
        CLEANUP_MEMBER_NOTIFICATION_BFF_PREFERENCES_SQL,
    ],
    executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
)
class MemberNotificationPreferenceBffSecurityTest(
    @param:Autowired private val mockMvc: MockMvc,
) {
    @Test
    fun `member notification preference bff request reaches controller without spring csrf token`() {
        mockMvc.put("/api/me/notifications/preferences") {
            with(user("member1@example.com"))
            header("X-Readmates-Bff-Secret", "test-bff-secret")
            header("Origin", "http://localhost:3000")
            contentType = MediaType.APPLICATION_JSON
            content = """
                {
                  "emailEnabled": false,
                  "events": {
                    "NEXT_BOOK_PUBLISHED": true,
                    "SESSION_REMINDER_DUE": false,
                    "FEEDBACK_DOCUMENT_PUBLISHED": true,
                    "REVIEW_PUBLISHED": true
                  }
                }
            """.trimIndent()
        }.andExpect {
            status { isOk() }
            jsonPath("$.emailEnabled") { value(false) }
            jsonPath("$.events.SESSION_REMINDER_DUE") { value(false) }
            jsonPath("$.events.REVIEW_PUBLISHED") { value(true) }
        }
    }

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
