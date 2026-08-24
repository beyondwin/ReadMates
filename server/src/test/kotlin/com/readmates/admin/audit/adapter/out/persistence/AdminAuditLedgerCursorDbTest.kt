package com.readmates.admin.audit.adapter.out.persistence

import com.readmates.admin.audit.application.model.AdminAuditActionCategory
import com.readmates.admin.audit.application.model.AdminAuditFilter
import com.readmates.admin.audit.application.model.AdminAuditSourceQuery
import com.readmates.admin.audit.application.model.AdminAuditSourceType
import com.readmates.admin.audit.application.model.AdminAuditTimeRange
import com.readmates.admin.audit.application.model.AdminAuditTuple
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.annotation.Transactional
import java.time.OffsetDateTime

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Tag("integration")
@Transactional
class AdminAuditLedgerCursorDbTest(
    @param:Autowired private val adapter: JdbcAdminAuditLedgerAdapter,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `every committed audit source has an executable bounded query`() {
        val query = sourceQuery(filter())

        val queried = AdminAuditSourceType.entries.associateWith { source -> adapter.listSource(source, query) }

        assertThat(queried.keys).containsExactlyInAnyOrderElementsOf(AdminAuditSourceType.entries)
        assertThat(queried.values).allSatisfy { assertThat(it).hasSizeLessThanOrEqualTo(query.limit) }
    }

    @Test
    fun `semantic predicate is applied before source limit`() {
        repeat(60) { index ->
            jdbcTemplate.update(
                """
                insert into platform_audit_events
                  (id, actor_user_id, actor_platform_role, target_user_id, event_type, metadata_json, created_at)
                values (?, null, 'OWNER', null, 'PLATFORM_ADMIN_CHANGED', json_object(), ?)
                """.trimIndent(),
                uuid(index + 100),
                TimestampValue.plusSeconds(index.toLong()),
            )
        }
        jdbcTemplate.update(
            """
            insert into platform_audit_events
              (id, actor_user_id, actor_platform_role, target_user_id, event_type, metadata_json, created_at)
            values (?, null, 'OWNER', null, 'ADMIN_NOTIFICATION_MANUAL_REVIEW', json_object(), ?)
            """.trimIndent(),
            MATCHING_EVENT_ID,
            TimestampValue.minusSeconds(1),
        )
        val filtered =
            adapter.listSource(
                AdminAuditSourceType.PLATFORM,
                sourceQuery(filter().copy(actionCategory = AdminAuditActionCategory.NOTIFICATION), limit = 1),
            )

        assertThat(filtered.map { it.sourceId }).containsExactly(MATCHING_EVENT_ID)
    }

    @Test
    fun `numeric native id continuation has no gap or duplicate`() {
        repeat(3) { index ->
            jdbcTemplate.update(
                """
                insert into ai_generation_audit_log (
                  job_id, session_id, club_id, host_user_id, kind, provider, model,
                  status, input_tokens, cached_input_tokens, output_tokens,
                  cost_estimate_usd, latency_ms, created_at
                ) values (?, ?, ?, ?, 'GENERATE', 'safe', 'safe-model', 'SUCCEEDED', 0, 0, 0, 0, 1, ?)
                """.trimIndent(),
                uuid(index + 300),
                uuid(index + 400),
                uuid(index + 500),
                uuid(index + 600),
                TimestampValue,
            )
        }
        val first = adapter.listSource(AdminAuditSourceType.AI_GENERATION, sourceQuery(filter(), limit = 2))
        val last = first.last()
        val second =
            adapter.listSource(
                AdminAuditSourceType.AI_GENERATION,
                sourceQuery(
                    filter(),
                    limit = 2,
                    after = AdminAuditTuple(last.occurredAt, AdminAuditSourceType.AI_GENERATION.rank, last.sourceId),
                ),
            )

        assertThat(first).hasSize(2)
        assertThat(second).hasSize(1)
        assertThat(first.map { it.sourceId }).doesNotContainAnyElementsOf(second.map { it.sourceId })
    }

    private fun filter(): AdminAuditFilter =
        AdminAuditFilter(
            from = TimestampValue.minusMinutes(1),
            to = TimestampValue.plusMinutes(2),
            range = AdminAuditTimeRange.HOURS_24,
            clubId = null,
            actorRole = null,
            sourceSlice = null,
            actionCategory = null,
            outcome = null,
        )

    private fun sourceQuery(
        filter: AdminAuditFilter,
        limit: Int = 2,
        after: AdminAuditTuple? = null,
    ): AdminAuditSourceQuery = AdminAuditSourceQuery(filter, filter.to, after, limit)
}

private fun uuid(value: Int): String = "00000000-0000-0000-0000-${value.toString().padStart(12, '0')}"

private val TimestampValue = OffsetDateTime.parse("2035-01-01T00:00:00Z")
private const val MATCHING_EVENT_ID = "00000000-0000-0000-0000-000000000099"
