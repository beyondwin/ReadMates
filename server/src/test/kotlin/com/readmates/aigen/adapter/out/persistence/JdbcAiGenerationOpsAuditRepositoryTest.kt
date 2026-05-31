package com.readmates.aigen.adapter.out.persistence

import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.out.AiGenerationAdminActionAuditEntry
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.TestPropertySource
import java.math.BigDecimal
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID

@SpringBootTest
@TestPropertySource(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@Tag("integration")
class JdbcAiGenerationOpsAuditRepositoryTest(
    @param:Autowired private val repository: JdbcAiGenerationOpsAuditRepository,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    @BeforeEach
    fun cleanAuditTables() {
        jdbcTemplate.execute("delete from ai_generation_audit_log")
        jdbcTemplate.execute("delete from ai_generation_admin_action_audit")
    }

    @Test
    fun `repository aggregates provider costs from audit rows`() {
        val since = Instant.parse("2026-05-01T00:00:00Z")
        insertAuditRow(provider = "OPENAI", model = "gpt-model", cost = BigDecimal("0.1200"))
        insertAuditRow(provider = "OPENAI", model = "gpt-model", cost = BigDecimal("0.0800"))
        insertAuditRow(provider = "CLAUDE", model = "claude-model", cost = BigDecimal("0.0100"))

        val costs = repository.providerCostsSince(since)

        val openAi = costs.single { it.provider == Provider.OPENAI && it.model == "gpt-model" }
        assertThat(openAi.costEstimateUsd).isEqualByComparingTo(BigDecimal("0.2000"))
    }

    @Test
    fun `windowUsageBetween sums cost and counts rows in the half-open range`() {
        val start = Instant.parse("2026-05-10T00:00:00Z")
        val end = Instant.parse("2026-05-20T00:00:00Z")
        // in range
        insertAuditRow(
            provider = "OPENAI",
            model = "gpt-model",
            cost = BigDecimal("0.1000"),
            createdAt = Instant.parse("2026-05-12T00:00:00Z"),
        )
        insertAuditRow(
            provider = "CLAUDE",
            model = "claude-model",
            cost = BigDecimal("0.0500"),
            createdAt = Instant.parse("2026-05-19T23:59:59Z"),
        )
        // out of range: before start, and on the exclusive end boundary
        insertAuditRow(
            provider = "OPENAI",
            model = "gpt-model",
            cost = BigDecimal("9.0000"),
            createdAt = Instant.parse("2026-05-09T23:59:59Z"),
        )
        insertAuditRow(
            provider = "OPENAI",
            model = "gpt-model",
            cost = BigDecimal("9.0000"),
            createdAt = end,
        )

        val usage = repository.windowUsageBetween(start, end)

        assertThat(usage.jobCount).isEqualTo(2L)
        assertThat(usage.costUsd).isEqualByComparingTo(BigDecimal("0.1500"))
    }

    @Test
    fun `repository records admin action audit rows`() {
        val jobId = UUID.randomUUID()
        val adminUserId = UUID.randomUUID()

        repository.record(
            AiGenerationAdminActionAuditEntry(
                jobId = jobId,
                clubId = UUID.randomUUID(),
                sessionId = UUID.randomUUID(),
                adminUserId = adminUserId,
                adminRole = PlatformAdminRole.OPERATOR,
                action = "FORCE_CANCEL",
                previousStatus = "RUNNING",
                nextStatus = "CANCELLED",
                result = "SUCCESS",
                safeErrorCode = null,
                createdAt = Instant.parse("2026-05-18T00:00:00Z"),
            ),
        )

        val row =
            jdbcTemplate.queryForMap(
                """
                select action, previous_status, next_status, result
                from ai_generation_admin_action_audit
                where job_id = ? and admin_user_id = ?
                """.trimIndent(),
                jobId.toString(),
                adminUserId.toString(),
            )

        assertThat(row["action"]).isEqualTo("FORCE_CANCEL")
        assertThat(row["previous_status"]).isEqualTo("RUNNING")
        assertThat(row["next_status"]).isEqualTo("CANCELLED")
        assertThat(row["result"]).isEqualTo("SUCCESS")
    }

    private fun insertAuditRow(
        provider: String,
        model: String,
        cost: BigDecimal,
        createdAt: Instant = Instant.parse("2026-05-18T00:00:00Z"),
    ) {
        jdbcTemplate.update(
            """
            insert into ai_generation_audit_log (
              job_id, session_id, club_id, host_user_id, kind, item, provider, model,
              transcript_sha256, input_tokens, cached_input_tokens, output_tokens,
              cost_estimate_usd, status, error_code, error_message, latency_ms, created_at
            )
            values (?, ?, ?, ?, 'FULL', null, ?, ?, null, 0, 0, 0, ?, 'SUCCESS', null, null, 0, ?)
            """.trimIndent(),
            UUID.randomUUID().toString(),
            UUID.randomUUID().toString(),
            UUID.randomUUID().toString(),
            UUID.randomUUID().toString(),
            provider,
            model,
            cost,
            Timestamp.from(createdAt),
        )
    }
}
