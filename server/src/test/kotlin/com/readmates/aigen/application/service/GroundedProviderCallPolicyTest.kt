package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.ProviderCallMode
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Duration

class GroundedProviderCallPolicyTest {
    private val primary = ModelId(Provider.CLAUDE, "claude-grounded")
    private val fallback = ModelId(Provider.OPENAI, "openai-grounded")
    private val policy =
        GroundedProviderCallPolicy(
            transientBackoffBase = Duration.ofSeconds(2),
            transientBackoffMax = Duration.ofSeconds(5),
            jitterSource = JitterSource { 2.0 },
        )

    @Test
    fun `policy table drives every approved transition`() {
        val primaryCall = policy.first(primary)

        assertThat(policy.next(listOf(primaryCall), GroundedProviderCallOutcome.Valid, fallback))
            .isEqualTo(GroundedProviderCallDecision.Complete)
        assertNext(
            policy.next(listOf(primaryCall), GroundedProviderCallOutcome.SchemaOrParseFailure, fallback),
            2,
            ProviderCallMode.SCHEMA_CORRECTION,
            primary,
        )
        assertNext(
            policy.next(
                listOf(primaryCall),
                GroundedProviderCallOutcome.RepairableGrounding(GenerationItem.SUMMARY),
                fallback,
            ),
            2,
            ProviderCallMode.SECTION_REPAIR,
            primary,
        )
        val fallbackCall =
            assertNext(
                policy.next(listOf(primaryCall), GroundedProviderCallOutcome.TransientFailure(), fallback),
                2,
                ProviderCallMode.FALLBACK,
                fallback,
            )
        assertThat(fallbackCall.delay).isEqualTo(Duration.ofSeconds(4))

        assertNext(
            policy.next(
                listOf(primaryCall, fallbackCall),
                GroundedProviderCallOutcome.RepairableGrounding(GenerationItem.HIGHLIGHTS),
                fallback,
            ),
            3,
            ProviderCallMode.SECTION_REPAIR,
            fallback,
        )
        ALL_FAILURES.forEach { outcome ->
            assertThat(policy.next(listOf(primaryCall, fallbackCall), outcome, fallback))
                .isEqualTo(GroundedProviderCallDecision.Failed)
        }

        val repairCall =
            assertNext(
                policy.next(
                    listOf(primaryCall, fallbackCall),
                    GroundedProviderCallOutcome.RepairableGrounding(GenerationItem.SUMMARY),
                    fallback,
                ),
                3,
                ProviderCallMode.SECTION_REPAIR,
                fallback,
            )
        OUTCOMES.filterNot { it == GroundedProviderCallOutcome.Valid }.forEach { outcome ->
            assertThat(policy.next(listOf(primaryCall, fallbackCall, repairCall), outcome, fallback))
                .isEqualTo(GroundedProviderCallDecision.Failed)
        }
    }

    @Test
    fun `rate limit retry-after and transient jitter are capped`() {
        val first = policy.first(primary)

        val rateLimited =
            assertNext(
                policy.next(
                    listOf(first),
                    GroundedProviderCallOutcome.RateLimited(Duration.ofMinutes(3)),
                    fallback,
                ),
                2,
                ProviderCallMode.FALLBACK,
                fallback,
            )
        val transient =
            assertNext(
                policy.next(listOf(first), GroundedProviderCallOutcome.TransientFailure(), fallback),
                2,
                ProviderCallMode.FALLBACK,
                fallback,
            )

        assertThat(rateLimited.delay).isEqualTo(Duration.ofSeconds(5))
        assertThat(transient.delay).isEqualTo(Duration.ofSeconds(4))
    }

    @Test
    fun `pre-transport gate rejection selects one fallback without consuming an ordinal`() {
        val first = policy.first(primary)

        val fallbackCall =
            assertNext(
                policy.next(listOf(first), GroundedProviderCallOutcome.PreTransportRejection, fallback),
                1,
                ProviderCallMode.FALLBACK,
                fallback,
            )

        assertThat(policy.next(listOf(fallbackCall), GroundedProviderCallOutcome.PreTransportRejection, primary))
            .isEqualTo(GroundedProviderCallDecision.Failed)
    }

    @Test
    fun `all generated outcome sequences preserve the global branch bounds`() {
        var explored = 0

        fun assertSequence(sequence: List<GroundedProviderCallOutcome>) {
            var history = listOf(policy.first(primary))
            for (outcome in sequence) {
                when (val decision = policy.next(history, outcome, fallback)) {
                    is GroundedProviderCallDecision.Next -> history = history + decision.call
                    GroundedProviderCallDecision.Complete,
                    GroundedProviderCallDecision.Failed,
                    -> break
                }
            }
            assertThat(history.maxOfOrNull { it.ordinal } ?: 0).isLessThanOrEqualTo(3)
            assertThat(history.count { it.mode == ProviderCallMode.SCHEMA_CORRECTION }).isLessThanOrEqualTo(1)
            assertThat(history.count { it.mode == ProviderCallMode.SECTION_REPAIR }).isLessThanOrEqualTo(1)
            assertThat(history.count { it.mode == ProviderCallMode.FALLBACK }).isLessThanOrEqualTo(1)
        }

        fun generate(
            prefix: List<GroundedProviderCallOutcome>,
            remaining: Int,
        ) {
            if (prefix.isNotEmpty()) {
                explored += 1
                assertSequence(prefix)
            }
            if (remaining == 0) return
            OUTCOMES.forEach { outcome -> generate(prefix + outcome, remaining - 1) }
        }

        generate(emptyList(), 6)

        assertThat(explored).isGreaterThan(50_000)
    }

    private fun assertNext(
        decision: GroundedProviderCallDecision,
        ordinal: Int,
        mode: ProviderCallMode,
        model: ModelId,
    ): GroundedProviderCallPlan {
        assertThat(decision).isInstanceOf(GroundedProviderCallDecision.Next::class.java)
        return (decision as GroundedProviderCallDecision.Next).call.also { call ->
            assertThat(call.ordinal).isEqualTo(ordinal)
            assertThat(call.mode).isEqualTo(mode)
            assertThat(call.model).isEqualTo(model)
        }
    }

    private companion object {
        val ALL_FAILURES =
            listOf(
                GroundedProviderCallOutcome.SchemaOrParseFailure,
                GroundedProviderCallOutcome.TransientFailure(),
                GroundedProviderCallOutcome.RateLimited(),
                GroundedProviderCallOutcome.PreTransportRejection,
                GroundedProviderCallOutcome.TerminalFailure,
            )
        val OUTCOMES =
            listOf(
                GroundedProviderCallOutcome.Valid,
                GroundedProviderCallOutcome.SchemaOrParseFailure,
                GroundedProviderCallOutcome.RepairableGrounding(GenerationItem.SUMMARY),
                GroundedProviderCallOutcome.TransientFailure(),
                GroundedProviderCallOutcome.RateLimited(),
                GroundedProviderCallOutcome.TerminalFailure,
            )
    }
}
