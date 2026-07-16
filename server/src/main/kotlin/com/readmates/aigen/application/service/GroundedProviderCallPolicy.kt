package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.ProviderCallMode
import com.readmates.aigen.config.AiGenerationProperties
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.stereotype.Component
import java.time.Duration
import java.util.concurrent.ThreadLocalRandom

private const val DEFAULT_JITTER_MIN = 0.5
private const val DEFAULT_JITTER_MAX = 1.5

fun interface JitterSource {
    fun factor(): Double

    data object Default : JitterSource {
        override fun factor(): Double = ThreadLocalRandom.current().nextDouble(DEFAULT_JITTER_MIN, DEFAULT_JITTER_MAX)
    }
}

data class GroundedProviderCallPlan(
    val ordinal: Int,
    val model: ModelId,
    val mode: ProviderCallMode,
    val section: GenerationItem? = null,
    val delay: Duration = Duration.ZERO,
)

sealed interface GroundedProviderCallOutcome {
    data object Valid : GroundedProviderCallOutcome

    data object SchemaOrParseFailure : GroundedProviderCallOutcome

    data class RepairableGrounding(
        val section: GenerationItem,
    ) : GroundedProviderCallOutcome

    data class TransientFailure(
        val retryAfter: Duration? = null,
    ) : GroundedProviderCallOutcome

    data class RateLimited(
        val retryAfter: Duration? = null,
    ) : GroundedProviderCallOutcome

    data object PreTransportRejection : GroundedProviderCallOutcome

    data object TerminalFailure : GroundedProviderCallOutcome
}

sealed interface GroundedProviderCallDecision {
    data class Next(
        val call: GroundedProviderCallPlan,
    ) : GroundedProviderCallDecision

    data object Complete : GroundedProviderCallDecision

    data object Failed : GroundedProviderCallDecision
}

/** Pure, application-owned maximum-three-physical-call state machine. */
@Component
class GroundedProviderCallPolicy private constructor(
    private val transientBackoffBase: Duration,
    private val transientBackoffMax: Duration,
    private val jitterSource: JitterSource,
    @Suppress("UnusedPrivateProperty") private val constructed: Boolean,
) {
    @Autowired
    constructor(properties: AiGenerationProperties) : this(
        properties.providerCalls.transientBackoffBase,
        properties.providerCalls.transientBackoffMax,
        JitterSource.Default,
        true,
    )

    internal constructor(
        transientBackoffBase: Duration,
        transientBackoffMax: Duration,
        jitterSource: JitterSource,
    ) : this(
        transientBackoffBase = transientBackoffBase,
        transientBackoffMax = transientBackoffMax,
        jitterSource = jitterSource,
        constructed = true,
    )

    fun first(
        model: ModelId,
        mode: ProviderCallMode = ProviderCallMode.PRIMARY,
        section: GenerationItem? = null,
    ): GroundedProviderCallPlan = GroundedProviderCallPlan(1, model, mode, section)

    @Suppress("ReturnCount")
    fun next(
        history: List<GroundedProviderCallPlan>,
        outcome: GroundedProviderCallOutcome,
        fallbackModel: ModelId?,
    ): GroundedProviderCallDecision {
        require(history.isNotEmpty()) { "provider call history must not be empty" }
        val current = history.last()
        if (outcome == GroundedProviderCallOutcome.Valid) return GroundedProviderCallDecision.Complete
        if (outcome == GroundedProviderCallOutcome.PreTransportRejection) {
            return fallback(history, fallbackModel, current.ordinal, Duration.ZERO)
        }
        if (current.ordinal >= MAX_PHYSICAL_CALLS) return GroundedProviderCallDecision.Failed
        if (current.mode == ProviderCallMode.SCHEMA_CORRECTION || current.mode == ProviderCallMode.SECTION_REPAIR) {
            return GroundedProviderCallDecision.Failed
        }
        if (current.ordinal == 2 && outcome !is GroundedProviderCallOutcome.RepairableGrounding) {
            return GroundedProviderCallDecision.Failed
        }

        val nextOrdinal = current.ordinal + 1
        return when (outcome) {
            GroundedProviderCallOutcome.SchemaOrParseFailure ->
                nextUnlessUsed(history, ProviderCallMode.SCHEMA_CORRECTION) {
                    GroundedProviderCallPlan(nextOrdinal, current.model, ProviderCallMode.SCHEMA_CORRECTION)
                }
            is GroundedProviderCallOutcome.RepairableGrounding ->
                nextUnlessUsed(history, ProviderCallMode.SECTION_REPAIR) {
                    GroundedProviderCallPlan(
                        nextOrdinal,
                        current.model,
                        ProviderCallMode.SECTION_REPAIR,
                        outcome.section,
                    )
                }
            is GroundedProviderCallOutcome.TransientFailure ->
                fallback(history, fallbackModel, nextOrdinal, transientDelay(outcome.retryAfter))
            is GroundedProviderCallOutcome.RateLimited ->
                fallback(history, fallbackModel, nextOrdinal, capped(outcome.retryAfter ?: transientBackoffBase))
            GroundedProviderCallOutcome.PreTransportRejection,
            GroundedProviderCallOutcome.TerminalFailure,
            GroundedProviderCallOutcome.Valid,
            -> GroundedProviderCallDecision.Failed
        }
    }

    private fun fallback(
        history: List<GroundedProviderCallPlan>,
        fallbackModel: ModelId?,
        ordinal: Int,
        delay: Duration,
    ): GroundedProviderCallDecision {
        if (fallbackModel == null || history.any { it.mode == ProviderCallMode.FALLBACK }) {
            return GroundedProviderCallDecision.Failed
        }
        return GroundedProviderCallDecision.Next(
            GroundedProviderCallPlan(ordinal, fallbackModel, ProviderCallMode.FALLBACK, delay = delay),
        )
    }

    private inline fun nextUnlessUsed(
        history: List<GroundedProviderCallPlan>,
        mode: ProviderCallMode,
        plan: () -> GroundedProviderCallPlan,
    ): GroundedProviderCallDecision =
        if (history.any { it.mode == mode }) {
            GroundedProviderCallDecision.Failed
        } else {
            GroundedProviderCallDecision.Next(plan())
        }

    private fun transientDelay(retryAfter: Duration?): Duration {
        if (retryAfter != null) return capped(retryAfter)
        val factor = jitterSource.factor().coerceIn(0.0, MAX_JITTER_FACTOR)
        val jitteredNanos = (transientBackoffBase.toNanos().toDouble() * factor).toLong()
        return capped(Duration.ofNanos(jitteredNanos))
    }

    private fun capped(delay: Duration): Duration = delay.coerceAtMost(transientBackoffMax)

    private companion object {
        const val MAX_PHYSICAL_CALLS = 3
        const val MAX_JITTER_FACTOR = 2.0
    }
}
