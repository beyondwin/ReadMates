package com.readmates.admin.operations.adapter.out.persistence

import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.jdbc.Sql
import java.util.UUID

private const val COUNTS_CLEANUP_SQL = """
    delete from admin_operation_case_events;
    delete from admin_operation_cases;
    delete from admin_operation_source_status;
"""

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Sql(statements = [COUNTS_CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [COUNTS_CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class JdbcAdminOperationCaseCountsTest(
    @param:Autowired private val adapter: JdbcAdminOperationCaseAdapter,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `open count includes every active lifecycle state`() {
        insertCase("00000000-0000-0000-0000-00000000c011", "count-open", "OPEN")
        insertCase("00000000-0000-0000-0000-00000000c012", "count-acknowledged", "ACKNOWLEDGED")
        insertCase("00000000-0000-0000-0000-00000000c013", "count-snoozed", "SNOOZED")
        insertCase("00000000-0000-0000-0000-00000000c014", "count-resolved", "RESOLVED")

        val counts = adapter.counts(UUID.fromString("00000000-0000-0000-0000-00000000a201"))

        assertThat(counts.open).isEqualTo(3)
        assertThat(counts.snoozed).isEqualTo(1)
    }

    private fun insertCase(
        id: String,
        sourceKey: String,
        state: String,
    ) {
        jdbcTemplate.update(
            """
            insert into admin_operation_cases (
              id, source_type, source_key, state, severity, safe_summary_code,
              first_observed_at, last_observed_at, snoozed_until, resolved_at, impact_count, detail_href
            )
            values (?, 'NOTIFICATION', ?, ?, 'WARNING', 'NOTIFICATION_DELIVERY_BACKLOG',
                    '2026-08-04 05:00:00.000000', '2026-08-04 05:00:00.000000', ?, ?, 1,
                    '/admin/notifications')
            """.trimIndent(),
            id,
            sourceKey,
            state,
            if (state == "SNOOZED") "2026-08-04 06:00:00.000000" else null,
            if (state == "RESOLVED") "2026-08-04 06:00:00.000000" else null,
        )
    }
}
