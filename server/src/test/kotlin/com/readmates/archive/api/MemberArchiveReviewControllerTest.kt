package com.readmates.archive.api

import com.readmates.support.MySqlTestContainer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.put

private const val CLEANUP_ARCHIVE_REVIEW_NOTIFICATION_SQL = """
    delete from notification_event_outbox
    where event_type = 'REVIEW_PUBLISHED';
    delete from notification_outbox
    where event_type = 'REVIEW_PUBLISHED';
    delete from notification_preferences
    where club_id = '00000000-0000-0000-0000-000000000001'
      and review_published_enabled = true;
    delete long_reviews
    from long_reviews
    join memberships on memberships.id = long_reviews.membership_id
      and memberships.club_id = long_reviews.club_id
    join users on users.id = memberships.user_id
    where long_reviews.club_id = '00000000-0000-0000-0000-000000000001'
      and long_reviews.session_id = '00000000-0000-0000-0000-000000000306'
      and users.email = 'member1@example.com';
"""

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@AutoConfigureMockMvc
@Sql(
    statements = [CLEANUP_ARCHIVE_REVIEW_NOTIFICATION_SQL],
    executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
)
@Sql(
    statements = [CLEANUP_ARCHIVE_REVIEW_NOTIFICATION_SQL],
    executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
)
class MemberArchiveReviewControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) {
    @Test
    fun `member saves public long review for published session and records notification event`() {
        enableReviewPublished("member2@example.com")

        mockMvc.put("/api/archive/sessions/00000000-0000-0000-0000-000000000306/my-long-review") {
            with(user("member1@example.com"))
            contentType = MediaType.APPLICATION_JSON
            content = """{"body":"발행된 회차에 새로 공개하는 서평입니다."}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.sessionId") { value("00000000-0000-0000-0000-000000000306") }
            jsonPath("$.body") { value("발행된 회차에 새로 공개하는 서평입니다.") }
        }

        val authorMembershipId = jdbcTemplate.queryForObject(
            """
            select memberships.id
            from memberships
            join users on users.id = memberships.user_id
            where users.email = 'member1@example.com'
              and memberships.club_id = '00000000-0000-0000-0000-000000000001'
            """.trimIndent(),
            String::class.java,
        )

        val event = jdbcTemplate.queryForMap(
            """
            select
              dedupe_key,
              json_unquote(json_extract(payload_json, '$.sessionId')) as session_id,
              json_unquote(json_extract(payload_json, '$.authorMembershipId')) as author_membership_id
            from notification_event_outbox
            where event_type = 'REVIEW_PUBLISHED'
              and aggregate_id = '00000000-0000-0000-0000-000000000306'
            """.trimIndent(),
        )
        assertThat(event["dedupe_key"]).isEqualTo(
            "review-published:00000000-0000-0000-0000-000000000306:$authorMembershipId",
        )
        assertThat(event["session_id"]).isEqualTo("00000000-0000-0000-0000-000000000306")
        assertThat(event["author_membership_id"]).isEqualTo(authorMembershipId)
    }

    private fun enableReviewPublished(email: String) {
        jdbcTemplate.update(
            """
            insert into notification_preferences (membership_id, club_id, review_published_enabled)
            select memberships.id, memberships.club_id, true
            from memberships
            join users on users.id = memberships.user_id
            where users.email = ?
              and memberships.club_id = '00000000-0000-0000-0000-000000000001'
            on duplicate key update review_published_enabled = true
            """.trimIndent(),
            email,
        )
    }

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
