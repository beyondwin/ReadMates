package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.out.JobKind
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.Duration

/**
 * Enforces the label allowlist policy from spec §11.1: only the 6 enum-valued tag
 * keys (provider, model, kind, status, reason, direction) may appear on any aigen
 * meter, and high-cardinality identifiers (transcript, hostId, sessionId, clubId,
 * email) are absolutely forbidden.
 */
class MetricLabelsTest {
    private val allowlist = setOf("provider", "model", "kind", "status", "reason", "direction")
    private val forbidden = setOf("transcript", "hostId", "sessionId", "clubId", "email")

    @Test
    fun `MetricLabel enum has exactly the 6 allowlisted entries`() {
        val names = MetricLabel.values().map { it.tagKey }.toSet()
        assertThat(names).isEqualTo(allowlist)
        assertThat(MetricLabel.values().size).isEqualTo(6)
    }

    @Test
    fun `after exercising all public methods only allowlisted tag keys appear`() {
        val registry = SimpleMeterRegistry()
        val metrics = AiGenerationMetrics(registry)
        val model = ModelId(Provider.CLAUDE, "claude-sonnet-4-6")

        metrics.recordJobStarted()
        metrics.recordJobCompleted(JobStatus.SUCCEEDED, Provider.CLAUDE, model, JobKind.FULL)
        metrics.recordJobCompleted(
            JobStatus.FAILED,
            Provider.OPENAI,
            ModelId(Provider.OPENAI, "gpt-x"),
            JobKind.REGENERATE_SUMMARY,
        )
        metrics.recordLatency(Provider.CLAUDE, model, JobKind.FULL, Duration.ofSeconds(2))
        metrics.recordTokens(Provider.CLAUDE, model, TokenDirection.INPUT, 100)
        metrics.recordTokens(Provider.CLAUDE, model, TokenDirection.CACHE_READ_INPUT, 50)
        metrics.recordTokens(Provider.CLAUDE, model, TokenDirection.OUTPUT, 200)
        metrics.recordCost(Provider.CLAUDE, model, BigDecimal("0.05"))
        metrics.recordValidationFailure(ErrorCode.SCHEMA_INVALID)
        metrics.recordCapDenial(CapDenialReason.HOST_DAILY)
        metrics.registerQueueDepthGauge { 0 }

        val allTagKeys =
            registry.meters
                .filter { it.id.name.startsWith("readmates.aigen") }
                .flatMap { it.id.tags }
                .map { it.key }
                .toSet()

        assertThat(allTagKeys).isSubsetOf(allowlist)
    }

    @Test
    fun `forbidden high-cardinality tag keys are never registered by any public method`() {
        val registry = SimpleMeterRegistry()
        val metrics = AiGenerationMetrics(registry)
        val model = ModelId(Provider.CLAUDE, "claude-sonnet-4-6")

        metrics.recordJobStarted()
        metrics.recordJobCompleted(JobStatus.CANCELLED, Provider.CLAUDE, model, JobKind.FULL)
        metrics.recordLatency(Provider.CLAUDE, model, JobKind.FULL, Duration.ofMillis(10))
        metrics.recordTokens(Provider.CLAUDE, model, TokenDirection.OUTPUT, 1)
        metrics.recordCost(Provider.CLAUDE, model, BigDecimal("0.01"))
        metrics.recordValidationFailure(ErrorCode.AUTHOR_NAME_MISMATCH)
        metrics.recordCapDenial(CapDenialReason.CLUB_MONTHLY)
        metrics.registerQueueDepthGauge { 0 }

        val allTagKeys =
            registry.meters
                .filter { it.id.name.startsWith("readmates.aigen") }
                .flatMap { it.id.tags }
                .map { it.key }
                .toSet()

        assertThat(allTagKeys.intersect(forbidden)).isEmpty()
    }

    @Test
    fun `all eight spec meters are registered`() {
        val registry = SimpleMeterRegistry()
        val metrics = AiGenerationMetrics(registry)
        val model = ModelId(Provider.CLAUDE, "claude-sonnet-4-6")

        metrics.recordJobStarted()
        metrics.recordJobCompleted(JobStatus.SUCCEEDED, Provider.CLAUDE, model, JobKind.FULL)
        metrics.recordLatency(Provider.CLAUDE, model, JobKind.FULL, Duration.ofSeconds(1))
        metrics.recordTokens(Provider.CLAUDE, model, TokenDirection.INPUT, 100)
        metrics.recordCost(Provider.CLAUDE, model, BigDecimal("0.05"))
        metrics.recordValidationFailure(ErrorCode.SCHEMA_INVALID)
        metrics.recordCapDenial(CapDenialReason.HOST_DAILY)
        metrics.registerQueueDepthGauge { 0 }

        val names = registry.meters.map { it.id.name }.toSet()
        assertThat(names).contains(
            "readmates.aigen.jobs",
            "readmates.aigen.jobs.completed",
            "readmates.aigen.latency",
            "readmates.aigen.tokens",
            "readmates.aigen.cost.usd",
            "readmates.aigen.validation.failures",
            "readmates.aigen.cap.denials",
            "readmates.aigen.queue.depth",
        )
    }
}
