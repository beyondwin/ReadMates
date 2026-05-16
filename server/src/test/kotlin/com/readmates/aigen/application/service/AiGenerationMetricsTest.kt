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
import java.util.concurrent.atomic.AtomicLong

/**
 * Validates that AiGenerationMetrics emits the 8 spec §11.1 meters with the
 * correct tag keys. Tag values are intentionally NOT asserted exhaustively here;
 * the [MetricLabelsTest] covers allowlist enforcement across the full surface.
 */
class AiGenerationMetricsTest {

    private val registry = SimpleMeterRegistry()
    private val model = ModelId(Provider.CLAUDE, "claude-sonnet-4-6")
    private val metrics = AiGenerationMetrics(registry)

    @Test
    fun `recordJobStarted increments readmates_aigen_jobs_total`() {
        metrics.recordJobStarted()
        metrics.recordJobStarted()

        val counter = registry.find("readmates.aigen.jobs").counter()
        assertThat(counter).isNotNull
        assertThat(counter!!.count()).isEqualTo(2.0)
    }

    @Test
    fun `recordJobCompleted increments completed counter with status provider model kind tags`() {
        metrics.recordJobCompleted(JobStatus.SUCCEEDED, Provider.CLAUDE, model, JobKind.FULL)

        val counter = registry.find("readmates.aigen.jobs.completed")
            .tag("status", "SUCCEEDED")
            .tag("provider", "CLAUDE")
            .tag("model", "claude-sonnet-4-6")
            .tag("kind", "FULL")
            .counter()
        assertThat(counter).isNotNull
        assertThat(counter!!.count()).isEqualTo(1.0)
    }

    @Test
    fun `recordLatency records to histogram with provider model kind tags`() {
        metrics.recordLatency(Provider.OPENAI, ModelId(Provider.OPENAI, "gpt-x"), JobKind.REGENERATE_SUMMARY, Duration.ofMillis(1500))

        val timer = registry.find("readmates.aigen.latency")
            .tag("provider", "OPENAI")
            .tag("model", "gpt-x")
            .tag("kind", "REGENERATE_SUMMARY")
            .timer()
        assertThat(timer).isNotNull
        assertThat(timer!!.count()).isEqualTo(1L)
        assertThat(timer.totalTime(java.util.concurrent.TimeUnit.MILLISECONDS)).isEqualTo(1500.0)
    }

    @Test
    fun `recordTokens increments token counter with lowercase direction tag`() {
        metrics.recordTokens(Provider.CLAUDE, model, TokenDirection.INPUT, 1000L)
        metrics.recordTokens(Provider.CLAUDE, model, TokenDirection.CACHED_INPUT, 200L)
        metrics.recordTokens(Provider.CLAUDE, model, TokenDirection.OUTPUT, 300L)

        val input = registry.find("readmates.aigen.tokens")
            .tag("provider", "CLAUDE").tag("model", "claude-sonnet-4-6").tag("direction", "input")
            .counter()
        val cached = registry.find("readmates.aigen.tokens")
            .tag("provider", "CLAUDE").tag("model", "claude-sonnet-4-6").tag("direction", "cached_input")
            .counter()
        val output = registry.find("readmates.aigen.tokens")
            .tag("provider", "CLAUDE").tag("model", "claude-sonnet-4-6").tag("direction", "output")
            .counter()
        assertThat(input?.count()).isEqualTo(1000.0)
        assertThat(cached?.count()).isEqualTo(200.0)
        assertThat(output?.count()).isEqualTo(300.0)
    }

    @Test
    fun `recordCost increments cost counter by BigDecimal value with provider model tags`() {
        metrics.recordCost(Provider.GEMINI, ModelId(Provider.GEMINI, "gemini-2-flash"), BigDecimal("0.12345"))
        metrics.recordCost(Provider.GEMINI, ModelId(Provider.GEMINI, "gemini-2-flash"), BigDecimal("0.00055"))

        val counter = registry.find("readmates.aigen.cost.usd")
            .tag("provider", "GEMINI")
            .tag("model", "gemini-2-flash")
            .counter()
        assertThat(counter).isNotNull
        assertThat(counter!!.count()).isEqualTo(0.124, org.assertj.core.data.Offset.offset(0.001))
    }

    @Test
    fun `recordValidationFailure increments validation_failures with reason tag`() {
        metrics.recordValidationFailure(ErrorCode.SCHEMA_INVALID)
        metrics.recordValidationFailure(ErrorCode.AUTHOR_NAME_MISMATCH)

        val schema = registry.find("readmates.aigen.validation.failures").tag("reason", "SCHEMA_INVALID").counter()
        val author = registry.find("readmates.aigen.validation.failures").tag("reason", "AUTHOR_NAME_MISMATCH").counter()
        assertThat(schema?.count()).isEqualTo(1.0)
        assertThat(author?.count()).isEqualTo(1.0)
    }

    @Test
    fun `recordCapDenial increments cap_denials with reason tag`() {
        metrics.recordCapDenial(CapDenialReason.HOST_DAILY)
        metrics.recordCapDenial(CapDenialReason.CLUB_MONTHLY)
        metrics.recordCapDenial(CapDenialReason.HOST_PER_MINUTE)

        val host = registry.find("readmates.aigen.cap.denials").tag("reason", "HOST_DAILY").counter()
        val club = registry.find("readmates.aigen.cap.denials").tag("reason", "CLUB_MONTHLY").counter()
        val perMin = registry.find("readmates.aigen.cap.denials").tag("reason", "HOST_PER_MINUTE").counter()
        assertThat(host?.count()).isEqualTo(1.0)
        assertThat(club?.count()).isEqualTo(1.0)
        assertThat(perMin?.count()).isEqualTo(1.0)
    }

    @Test
    fun `registerQueueDepthGauge registers gauge whose value tracks supplier`() {
        val depth = AtomicLong(7L)
        metrics.registerQueueDepthGauge { depth.get() }

        val gauge = registry.find("readmates.aigen.queue.depth").gauge()
        assertThat(gauge).isNotNull
        assertThat(gauge!!.value()).isEqualTo(7.0)

        depth.set(42L)
        assertThat(gauge.value()).isEqualTo(42.0)
    }
}
