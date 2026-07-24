package com.readmates.notification.adapter.out.persistence

import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.jdbc.Sql
import java.util.UUID

private const val CLEANUP_NOTIFICATION_POLICY_SQL = """
    delete from club_notification_policies
    where club_id = '00000000-0000-0000-0000-000000000001';
"""

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Sql(
    statements = [CLEANUP_NOTIFICATION_POLICY_SQL],
    executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
)
@Sql(
    statements = [CLEANUP_NOTIFICATION_POLICY_SQL],
    executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
)
@Tag("integration")
class JdbcNotificationPolicyAdapterTest(
    @param:Autowired private val adapter: JdbcNotificationPolicyAdapter,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")
    private val hostMembershipId = UUID.fromString("00000000-0000-0000-0000-000000000201")

    @Test
    fun `missing policy defaults reminder to off`() {
        assertThat(adapter.get(clubId).sessionReminderEnabled).isFalse()
        assertThat(adapter.get(clubId).updatedAt).isNull()
    }

    @Test
    fun `save inserts and updates one club policy`() {
        val enabled = adapter.save(clubId, hostMembershipId, sessionReminderEnabled = true)
        val disabled = adapter.save(clubId, hostMembershipId, sessionReminderEnabled = false)

        assertThat(enabled.sessionReminderEnabled).isTrue()
        assertThat(enabled.updatedAt).isNotNull()
        assertThat(disabled.sessionReminderEnabled).isFalse()
        assertThat(disabled.updatedAt).isNotNull()
        assertThat(
            jdbcTemplate.queryForObject(
                "select count(*) from club_notification_policies where club_id = ?",
                Int::class.java,
                clubId.toString(),
            ),
        ).isEqualTo(1)
        assertThat(
            jdbcTemplate.queryForObject(
                "select updated_by_membership_id from club_notification_policies where club_id = ?",
                String::class.java,
                clubId.toString(),
            ),
        ).isEqualTo(hostMembershipId.toString())
    }
}
