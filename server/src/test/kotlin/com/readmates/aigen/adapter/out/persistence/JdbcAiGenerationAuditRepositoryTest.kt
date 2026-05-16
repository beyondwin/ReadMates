package com.readmates.aigen.adapter.out.persistence

import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.port.out.AuditKind
import com.readmates.aigen.application.port.out.AuditLogEntry
import com.readmates.aigen.application.port.out.AuditStatus
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.TestPropertySource
import java.math.BigDecimal
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

@SpringBootTest
@TestPropertySource(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@Tag("integration")
class JdbcAiGenerationAuditRepositoryTest(
    @param:Autowired private val adapter: JdbcAiGenerationAuditRepository,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `insert FULL kind succeeds with null item and null transcript hash`() {
        val jobId = UUID.randomUUID()
        val sessionId = UUID.randomUUID()
        val clubId = UUID.randomUUID()
        val hostUserId = UUID.randomUUID()
        val createdAt = Instant.parse("2026-05-16T12:34:56.123456Z")

        adapter.insert(
            AuditLogEntry(
                jobId = jobId,
                sessionId = sessionId,
                clubId = clubId,
                hostUserId = hostUserId,
                kind = AuditKind.FULL,
                item = null,
                provider = Provider.CLAUDE,
                model = "claude-sonnet-4-5",
                transcriptSha256 = null,
                usage = TokenUsage(inputTokens = 1500, cachedInputTokens = 200, outputTokens = 800),
                costEstimateUsd = BigDecimal("0.1234"),
                status = AuditStatus.SUCCESS,
                errorCode = null,
                errorMessage = null,
                latencyMs = 4321,
                createdAt = createdAt,
            ),
        )

        val row =
            jdbcTemplate.queryForMap(
                """
                select job_id, session_id, club_id, host_user_id, kind, item, provider, model,
                       transcript_sha256, input_tokens, cached_input_tokens, output_tokens,
                       cost_estimate_usd, status, error_code, error_message, latency_ms, created_at
                from ai_generation_audit_log
                where job_id = ?
                """.trimIndent(),
                jobId.toString(),
            )

        assertThat(row["job_id"]).isEqualTo(jobId.toString())
        assertThat(row["session_id"]).isEqualTo(sessionId.toString())
        assertThat(row["club_id"]).isEqualTo(clubId.toString())
        assertThat(row["host_user_id"]).isEqualTo(hostUserId.toString())
        assertThat(row["kind"]).isEqualTo("FULL")
        assertThat(row["item"]).isNull()
        assertThat(row["provider"]).isEqualTo("CLAUDE")
        assertThat(row["model"]).isEqualTo("claude-sonnet-4-5")
        assertThat(row["transcript_sha256"]).isNull()
        assertThat((row["input_tokens"] as Number).toInt()).isEqualTo(1500)
        assertThat((row["cached_input_tokens"] as Number).toInt()).isEqualTo(200)
        assertThat((row["output_tokens"] as Number).toInt()).isEqualTo(800)
        assertThat(row["cost_estimate_usd"] as BigDecimal).isEqualByComparingTo(BigDecimal("0.1234"))
        assertThat(row["status"]).isEqualTo("SUCCESS")
        assertThat(row["error_code"]).isNull()
        assertThat(row["error_message"]).isNull()
        assertThat((row["latency_ms"] as Number).toInt()).isEqualTo(4321)
    }

    @Test
    fun `insert REGENERATE kind populates item column`() {
        val jobId = UUID.randomUUID()

        adapter.insert(
            sampleEntry(
                jobId = jobId,
                kind = AuditKind.REGENERATE,
                item = GenerationItem.SUMMARY,
                transcriptSha256 = "a".repeat(64),
            ),
        )

        val item =
            jdbcTemplate.queryForObject(
                "select item from ai_generation_audit_log where job_id = ?",
                String::class.java,
                jobId.toString(),
            )
        val sha =
            jdbcTemplate.queryForObject(
                "select transcript_sha256 from ai_generation_audit_log where job_id = ?",
                String::class.java,
                jobId.toString(),
            )
        assertThat(item).isEqualTo("SUMMARY")
        assertThat(sha).isEqualTo("a".repeat(64))
    }

    @Test
    fun `insert truncates error message to 512 chars`() {
        val jobId = UUID.randomUUID()
        val longErrorMessage = "x".repeat(700)

        adapter.insert(
            sampleEntry(
                jobId = jobId,
                status = AuditStatus.FAILED,
                errorCode = ErrorCode.PROVIDER_UNAVAILABLE,
                errorMessage = longErrorMessage,
            ),
        )

        val stored =
            jdbcTemplate.queryForObject(
                "select error_message from ai_generation_audit_log where job_id = ?",
                String::class.java,
                jobId.toString(),
            )
        assertThat(stored).hasSize(512)
    }

    @Test
    fun `audit log table has no transcript body column and rejects transcript sentinel substring`() {
        val transcriptColumns =
            jdbcTemplate.queryForList(
                """
                select column_name
                from information_schema.columns
                where table_schema = database()
                  and table_name = 'ai_generation_audit_log'
                  and column_name like 'transcript%'
                """.trimIndent(),
                String::class.java,
            )
        assertThat(transcriptColumns).containsExactly("transcript_sha256")

        val sentinel = "SECRET-TRANSCRIPT-MARKER"
        val jobId = UUID.randomUUID()
        adapter.insert(sampleEntry(jobId = jobId))

        val sentinelHits =
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from ai_generation_audit_log
                where error_message like ?
                   or model like ?
                   or error_code like ?
                """.trimIndent(),
                Int::class.java,
                "%$sentinel%",
                "%$sentinel%",
                "%$sentinel%",
            )
        assertThat(sentinelHits).isZero()
    }

    @Test
    fun `multiple rows can be queried via session and club id`() {
        val sessionId = UUID.randomUUID()
        val clubId = UUID.randomUUID()
        val firstJobId = UUID.randomUUID()
        val secondJobId = UUID.randomUUID()
        val baseInstant = Instant.parse("2026-05-16T10:00:00Z")

        adapter.insert(
            sampleEntry(
                jobId = firstJobId,
                sessionId = sessionId,
                clubId = clubId,
                createdAt = baseInstant,
            ),
        )
        adapter.insert(
            sampleEntry(
                jobId = secondJobId,
                sessionId = sessionId,
                clubId = clubId,
                createdAt = baseInstant.plus(1, ChronoUnit.MINUTES),
            ),
        )

        val sessionRows =
            jdbcTemplate.queryForList(
                "select job_id from ai_generation_audit_log where session_id = ? order by created_at",
                String::class.java,
                sessionId.toString(),
            )
        val clubRows =
            jdbcTemplate.queryForList(
                "select job_id from ai_generation_audit_log where club_id = ? order by created_at",
                String::class.java,
                clubId.toString(),
            )

        assertThat(sessionRows).containsExactly(firstJobId.toString(), secondJobId.toString())
        assertThat(clubRows).containsExactly(firstJobId.toString(), secondJobId.toString())
    }

    @Suppress("LongParameterList")
    private fun sampleEntry(
        jobId: UUID = UUID.randomUUID(),
        sessionId: UUID = UUID.randomUUID(),
        clubId: UUID = UUID.randomUUID(),
        hostUserId: UUID = UUID.randomUUID(),
        kind: AuditKind = AuditKind.FULL,
        item: GenerationItem? = null,
        provider: Provider = Provider.CLAUDE,
        model: String = "claude-sonnet-4-5",
        transcriptSha256: String? = null,
        usage: TokenUsage = TokenUsage(0, 0, 0),
        costEstimateUsd: BigDecimal = BigDecimal.ZERO,
        status: AuditStatus = AuditStatus.SUCCESS,
        errorCode: ErrorCode? = null,
        errorMessage: String? = null,
        latencyMs: Int = 0,
        createdAt: Instant = Instant.parse("2026-05-16T08:00:00Z"),
    ): AuditLogEntry =
        AuditLogEntry(
            jobId = jobId,
            sessionId = sessionId,
            clubId = clubId,
            hostUserId = hostUserId,
            kind = kind,
            item = item,
            provider = provider,
            model = model,
            transcriptSha256 = transcriptSha256,
            usage = usage,
            costEstimateUsd = costEstimateUsd,
            status = status,
            errorCode = errorCode,
            errorMessage = errorMessage,
            latencyMs = latencyMs,
            createdAt = createdAt,
        )
}
