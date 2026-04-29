package com.readmates.notification.api

import com.readmates.support.MySqlTestContainer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.put

private const val CLEANUP_MEMBER_NOTIFICATION_PREFERENCES_SQL = """
    delete from notification_preferences
    where club_id = '00000000-0000-0000-0000-000000000001';
"""

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@AutoConfigureMockMvc
@Sql(
    statements = [
        CLEANUP_MEMBER_NOTIFICATION_PREFERENCES_SQL,
    ],
    executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
)
@Sql(
    statements = [
        CLEANUP_MEMBER_NOTIFICATION_PREFERENCES_SQL,
    ],
    executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
)
class MemberNotificationPreferenceControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) {
    @Test
    fun `authenticated member reads default notification preferences`() {
        mockMvc.get("/api/me/notifications/preferences") {
            with(user("member1@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.emailEnabled") { value(true) }
            jsonPath("$.events.NEXT_BOOK_PUBLISHED") { value(true) }
            jsonPath("$.events.SESSION_REMINDER_DUE") { value(true) }
            jsonPath("$.events.FEEDBACK_DOCUMENT_PUBLISHED") { value(true) }
            jsonPath("$.events.REVIEW_PUBLISHED") { value(false) }
        }
    }

    @Test
    fun `authenticated member saves notification preferences`() {
        mockMvc.put("/api/me/notifications/preferences") {
            with(user("member1@example.com"))
            with(csrf())
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
            jsonPath("$.events.NEXT_BOOK_PUBLISHED") { value(true) }
            jsonPath("$.events.SESSION_REMINDER_DUE") { value(false) }
            jsonPath("$.events.FEEDBACK_DOCUMENT_PUBLISHED") { value(true) }
            jsonPath("$.events.REVIEW_PUBLISHED") { value(true) }
        }

        val saved = jdbcTemplate.queryForMap(
            """
            select
              notification_preferences.email_enabled,
              notification_preferences.session_reminder_due_enabled,
              notification_preferences.review_published_enabled
            from notification_preferences
            join memberships on memberships.id = notification_preferences.membership_id
              and memberships.club_id = notification_preferences.club_id
            join users on users.id = memberships.user_id
            where users.email = 'member1@example.com'
              and notification_preferences.club_id = '00000000-0000-0000-0000-000000000001'
            """.trimIndent(),
        )

        assertThat(saved["email_enabled"]).isEqualTo(false)
        assertThat(saved["session_reminder_due_enabled"]).isEqualTo(false)
        assertThat(saved["review_published_enabled"]).isEqualTo(true)
    }

    @Test
    fun `unauthenticated member notification preference read is rejected`() {
        mockMvc.get("/api/me/notifications/preferences")
            .andExpect {
                status { isUnauthorized() }
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
