package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GroundingFailureReason
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.out.JobKind
import com.readmates.aigen.application.port.out.ProviderCircuitOutcome
import com.readmates.aigen.application.port.out.ProviderGateRejection
import io.micrometer.core.instrument.Counter
import io.micrometer.core.instrument.Gauge
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.Tag
import io.micrometer.core.instrument.Tags
import io.micrometer.core.instrument.Timer
import org.springframework.stereotype.Component
import java.math.BigDecimal
import java.time.Duration
import java.util.concurrent.atomic.AtomicReference

/**
 * Encapsulates the 8 Prometheus meters specified in AI Generation spec §11.1
 * plus the bounded grounded-section repair outcome counter.
 *
 * **Label allowlist policy.** Only the 6 enum-valued tag keys defined in
 * [MetricLabel] (`provider`, `model`, `kind`, `status`, `reason`, `direction`)
 * may appear on any aigen meter. Every meter registration in this class routes
 * through the [aigenMeter] helper which accepts only typed [MetricLabel] keys —
 * making it a compile-time error to add high-cardinality tags such as
 * `transcript`, `hostId`, `sessionId`, `clubId`, or `email`. The companion
 * [com.readmates.aigen.application.service.MetricLabelsTest] enforces this at
 * test time via a reflective scan of the registry.
 *
 * **Reason tag values.** [recordValidationFailure] accepts [ErrorCode] but only
 * the validation-subset codes (`SCHEMA_INVALID`, `AUTHOR_NAME_MISMATCH`,
 * `HIGHLIGHTS_OUT_OF_RANGE`, `ONE_LINE_REVIEWS_DUPLICATE`,
 * `FEEDBACK_TEMPLATE_INVALID`) are expected by callers. The full enum is
 * accepted to avoid a second enum; callers are responsible for emitting only
 * validation-class codes.
 *
 * @see <a href="../../../../../../../../../../docs/development/aigen/aigen-spec.md">aigen-spec §11.1</a>
 */
@Component
@Suppress("TooManyFunctions")
class AiGenerationMetrics(
    private val meterRegistry: MeterRegistry,
) {
    private val queueDepthSupplier = AtomicReference<() -> Number>({ 0 })

    @Volatile
    private var queueDepthRegistered = false

    /** `readmates_aigen_jobs_total` — counter, no tags. */
    fun recordJobStarted() {
        Counter
            .builder(NAME_JOBS)
            .description("Total AI generation jobs accepted by the orchestrator")
            .tags(aigenMeter())
            .register(meterRegistry)
            .increment()
    }

    /** Commit recovery failures — counter, no tags to keep cardinality bounded. */
    fun recordCommitRecoveryFailure() {
        Counter
            .builder(NAME_COMMIT_RECOVERY_FAILURES)
            .description("AI generation commit recovery attempts that failed")
            .tags(aigenMeter())
            .register(meterRegistry)
            .increment()
    }

    /**
     * `readmates_aigen_jobs_completed_total{status,provider,model,kind}` — counter.
     * Emitted on terminal status transitions (SUCCEEDED / FAILED / CANCELLED).
     */
    fun recordJobCompleted(
        status: JobStatus,
        provider: Provider,
        model: ModelId,
        kind: JobKind,
    ) {
        Counter
            .builder(NAME_JOBS_COMPLETED)
            .description("AI generation jobs that reached a terminal status")
            .tags(
                aigenMeter(
                    MetricLabel.STATUS to status.name,
                    MetricLabel.PROVIDER to provider.name,
                    MetricLabel.MODEL to model.name,
                    MetricLabel.KIND to kind.name,
                ),
            ).register(meterRegistry)
            .increment()
    }

    /** `readmates_aigen_latency_seconds{provider,model,kind}` — histogram (Timer). */
    fun recordLatency(
        provider: Provider,
        model: ModelId,
        kind: JobKind,
        duration: Duration,
    ) {
        Timer
            .builder(NAME_LATENCY)
            .description("Wall-clock latency of an AI generation call")
            .publishPercentileHistogram()
            .tags(
                aigenMeter(
                    MetricLabel.PROVIDER to provider.name,
                    MetricLabel.MODEL to model.name,
                    MetricLabel.KIND to kind.name,
                ),
            ).register(meterRegistry)
            .record(duration)
    }

    /**
     * `readmates_aigen_tokens_total{provider,model,direction}` — counter.
     * `direction` is one of the four bounded billing-channel values.
     */
    fun recordTokens(
        provider: Provider,
        model: ModelId,
        direction: TokenDirection,
        count: Long,
    ) {
        Counter
            .builder(NAME_TOKENS)
            .description("Tokens consumed by AI generation calls, by direction")
            .tags(
                aigenMeter(
                    MetricLabel.PROVIDER to provider.name,
                    MetricLabel.MODEL to model.name,
                    MetricLabel.DIRECTION to direction.tagValue,
                ),
            ).register(meterRegistry)
            .increment(count.toDouble())
    }

    /** `readmates_aigen_cost_usd_total{provider,model}` — counter, value is USD. */
    fun recordCost(
        provider: Provider,
        model: ModelId,
        amountUsd: BigDecimal,
    ) {
        Counter
            .builder(NAME_COST_USD)
            .description("Accumulated USD cost of AI generation calls")
            .baseUnit("usd")
            .tags(
                aigenMeter(
                    MetricLabel.PROVIDER to provider.name,
                    MetricLabel.MODEL to model.name,
                ),
            ).register(meterRegistry)
            .increment(amountUsd.toDouble())
    }

    /**
     * `readmates_aigen_validation_failures_total{reason}` — counter.
     * Callers should pass only validation-subset [ErrorCode] values
     * (SCHEMA_INVALID, AUTHOR_NAME_MISMATCH, HIGHLIGHTS_OUT_OF_RANGE,
     * ONE_LINE_REVIEWS_DUPLICATE, FEEDBACK_TEMPLATE_INVALID).
     */
    fun recordValidationFailure(reason: ErrorCode) {
        Counter
            .builder(NAME_VALIDATION_FAILURES)
            .description("AI generation outputs that failed validation")
            .tags(aigenMeter(MetricLabel.REASON to reason.name))
            .register(meterRegistry)
            .increment()
    }

    fun recordGroundingValidationFailure(reasons: Set<GroundingFailureReason>) {
        reasons.forEach { reason ->
            Counter
                .builder(NAME_VALIDATION_FAILURES)
                .description("AI generation outputs that failed validation")
                .tags(aigenMeter(MetricLabel.REASON to reason.name))
                .register(meterRegistry)
                .increment()
        }
    }

    /** Repair outcome counter used to observe the bounded single-repair success rate. */
    fun recordGroundingRepairOutcome(outcome: GroundingRepairOutcome) {
        Counter
            .builder(NAME_GROUNDING_REPAIRS)
            .description("Grounded generation section repair outcomes")
            .tags(aigenMeter(MetricLabel.STATUS to outcome.name))
            .register(meterRegistry)
            .increment()
    }

    fun recordProviderCall(
        provider: Provider,
        outcome: ProviderCircuitOutcome,
        duration: Duration,
    ) {
        val tags =
            aigenMeter(
                MetricLabel.PROVIDER to provider.name,
                MetricLabel.STATUS to outcome.name,
            )
        Counter
            .builder(NAME_PROVIDER_CALLS)
            .description("AI provider calls by bounded circuit outcome")
            .tags(tags)
            .register(meterRegistry)
            .increment()
        Timer
            .builder(NAME_PROVIDER_CALL_LATENCY)
            .description("AI provider call latency by bounded circuit outcome")
            .publishPercentileHistogram()
            .tags(tags)
            .register(meterRegistry)
            .record(duration)
    }

    fun recordProviderGateRejection(
        provider: Provider,
        reason: ProviderGateRejection,
    ) {
        Counter
            .builder(NAME_PROVIDER_GATE_REJECTIONS)
            .description("AI provider calls rejected before a physical request")
            .tags(
                aigenMeter(
                    MetricLabel.PROVIDER to provider.name,
                    MetricLabel.REASON to reason.name,
                ),
            ).register(meterRegistry)
            .increment()
    }

    fun recordProviderCircuitTransition(
        provider: Provider,
        state: ProviderCircuitState,
    ) {
        Counter
            .builder(NAME_PROVIDER_CIRCUIT_TRANSITIONS)
            .description("AI provider circuit state transitions")
            .tags(
                aigenMeter(
                    MetricLabel.PROVIDER to provider.name,
                    MetricLabel.STATUS to state.name,
                ),
            ).register(meterRegistry)
            .increment()
    }

    /** `readmates_aigen_cap_denials_total{reason}` — counter. */
    fun recordCapDenial(reason: CapDenialReason) {
        Counter
            .builder(NAME_CAP_DENIALS)
            .description("Cap-guard denials before invoking an AI provider")
            .tags(aigenMeter(MetricLabel.REASON to reason.name))
            .register(meterRegistry)
            .increment()
    }

    /**
     * `readmates_aigen_queue_depth` — gauge bound to [supplier].
     *
     * Calling this multiple times replaces the active supplier; the gauge itself
     * is registered exactly once with Micrometer so Prometheus retains a stable
     * time series identity. `AiGenerationQueueDepthGaugeBinder` wires this to the
     * Redis-backed active job count (`PENDING` + `RUNNING`). Kafka consumer group
     * lag is a separate operational signal and should not be described with this
     * metric name.
     */
    @Synchronized
    fun registerQueueDepthGauge(supplier: () -> Number) {
        queueDepthSupplier.set(supplier)
        if (!queueDepthRegistered) {
            Gauge
                .builder(NAME_QUEUE_DEPTH) { queueDepthSupplier.get().invoke().toDouble() }
                .description("Active AI generation jobs in Redis job store")
                .tags(aigenMeter())
                .register(meterRegistry)
            queueDepthRegistered = true
        }
    }

    /**
     * Sole entry point for translating typed [MetricLabel] enum keys into the
     * Micrometer [Tags] that get attached to a meter. Adding a tag without going
     * through this helper is impossible from outside the file (the helper is
     * `private`) — that is the compile-time half of the label allowlist policy.
     */
    private fun aigenMeter(vararg labels: Pair<MetricLabel, String>): Tags {
        if (labels.isEmpty()) return Tags.empty()
        return Tags.of(labels.map { (label, value) -> Tag.of(label.tagKey, value) })
    }

    private companion object {
        const val NAME_JOBS = "readmates.aigen.jobs"
        const val NAME_COMMIT_RECOVERY_FAILURES = "readmates.aigen.commit.recovery.failures"
        const val NAME_JOBS_COMPLETED = "readmates.aigen.jobs.completed"
        const val NAME_LATENCY = "readmates.aigen.latency"
        const val NAME_TOKENS = "readmates.aigen.tokens"
        const val NAME_COST_USD = "readmates.aigen.cost.usd"
        const val NAME_VALIDATION_FAILURES = "readmates.aigen.validation.failures"
        const val NAME_GROUNDING_REPAIRS = "readmates.aigen.grounding.repairs"
        const val NAME_CAP_DENIALS = "readmates.aigen.cap.denials"
        const val NAME_QUEUE_DEPTH = "readmates.aigen.queue.depth"
        const val NAME_PROVIDER_CALLS = "readmates.aigen.provider.calls"
        const val NAME_PROVIDER_CALL_LATENCY = "readmates.aigen.provider.call.latency"
        const val NAME_PROVIDER_GATE_REJECTIONS = "readmates.aigen.provider.gate.rejections"
        const val NAME_PROVIDER_CIRCUIT_TRANSITIONS = "readmates.aigen.provider.circuit.state.transitions"
    }
}

enum class GroundingRepairOutcome { SUCCEEDED, FAILED }

enum class ProviderCircuitState {
    CLOSED,
    OPEN,
    HALF_OPEN,
    DISABLED,
    FORCED_OPEN,
    METRICS_ONLY,
}

/**
 * The 6 enum-valued Prometheus tag keys permitted on any `readmates.aigen.*` meter
 * (spec §11.1). High-cardinality identifiers (transcript, hostId, sessionId,
 * clubId, email) are explicitly forbidden — for row-level audit use the
 * `ai_generation_audit_log` table instead.
 */
enum class MetricLabel(
    val tagKey: String,
) {
    PROVIDER("provider"),
    MODEL("model"),
    KIND("kind"),
    STATUS("status"),
    REASON("reason"),
    DIRECTION("direction"),
}

/**
 * Direction tag values for `readmates_aigen_tokens_total`. Emitted lowercase
 * (input / cache_write_input / cache_read_input / output) per spec §11.1.
 */
enum class TokenDirection(
    val tagValue: String,
) {
    INPUT("input"),
    CACHE_WRITE_INPUT("cache_write_input"),
    CACHE_READ_INPUT("cache_read_input"),
    OUTPUT("output"),
}

/**
 * Reason tag values for `readmates_aigen_cap_denials_total`. Maps to the three
 * cap surfaces in the spec: host daily call count, club monthly cost, and
 * host per-minute call rate (the last enforced by the shared rate-limit port).
 */
enum class CapDenialReason {
    HOST_DAILY,
    CLUB_MONTHLY,
    HOST_PER_MINUTE,
}
