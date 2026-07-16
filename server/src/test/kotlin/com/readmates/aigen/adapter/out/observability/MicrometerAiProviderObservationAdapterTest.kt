package com.readmates.aigen.adapter.out.observability

import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationError
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.ProviderCallException
import com.readmates.aigen.application.model.ProviderCallMode
import com.readmates.aigen.application.port.out.AiProviderObservationContext
import io.micrometer.observation.Observation
import io.micrometer.observation.ObservationHandler
import io.micrometer.observation.ObservationRegistry
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.slf4j.MDC
import java.util.UUID

class MicrometerAiProviderObservationAdapterTest {
    @AfterEach
    fun clearMdc() {
        MDC.clear()
    }

    @Test
    fun `provider observation exposes only bounded metric and span attributes`() {
        val capture = CapturingObservationHandler()
        val registry = ObservationRegistry.create()
        registry.observationConfig().observationHandler(capture)
        val adapter = MicrometerAiProviderObservationAdapter(registry)
        val context = observationContext()
        MDC.put("traceId", "0123456789abcdef0123456789abcdef")
        MDC.put("spanId", "0123456789abcdef")
        MDC.put("provider", "worker-parent")

        val value =
            adapter.observe(context) {
                assertThat(MDC.getCopyOfContextMap())
                    .containsExactlyInAnyOrderEntriesOf(
                        mapOf(
                            "traceId" to "0123456789abcdef0123456789abcdef",
                            "spanId" to "0123456789abcdef",
                            "jobId" to context.jobId.toString(),
                            "provider" to "openai",
                            "stage" to "primary",
                            "attempt" to "2",
                        ),
                    )
                "ok"
            }

        assertThat(value).isEqualTo("ok")
        assertThat(MDC.getCopyOfContextMap())
            .containsExactlyInAnyOrderEntriesOf(
                mapOf(
                    "traceId" to "0123456789abcdef0123456789abcdef",
                    "spanId" to "0123456789abcdef",
                    "provider" to "worker-parent",
                ),
            )
        assertThat(capture.name).isEqualTo("readmates.aigen.provider.call")
        assertThat(capture.lowCardinality)
            .containsExactlyInAnyOrderEntriesOf(
                mapOf(
                    "provider" to "openai",
                    "model" to "gpt-5.4-mini",
                    "callMode" to "primary",
                    "outcome" to "success",
                    "errorCode" to "none",
                ),
            )
        assertThat(capture.highCardinality)
            .containsExactlyInAnyOrderEntriesOf(
                mapOf(
                    "jobId" to context.jobId.toString(),
                    "attempt" to "2",
                ),
            )
        assertThat(capture.lowCardinality).doesNotContainKeys("jobId", "traceId", "sessionId", "clubId", "hostUserId")
        assertThat(capture.allValues())
            .noneMatch { value -> FORBIDDEN_SYNTHETIC_VALUES.any(value::contains) }
        assertThat(capture.error).isNull()
    }

    @Test
    fun `provider failure records only safe classification without raw throwable content`() {
        val capture = CapturingObservationHandler()
        val registry = ObservationRegistry.create()
        registry.observationConfig().observationHandler(capture)
        val adapter = MicrometerAiProviderObservationAdapter(registry)
        val failure =
            ProviderCallException(
                error = GenerationError(ErrorCode.SCHEMA_INVALID, "Safe structured output failure"),
                cause = IllegalStateException(RAW_PROVIDER_FAILURE),
            )

        assertThatThrownBy {
            adapter.observe(observationContext()) { throw failure }
        }.isSameAs(failure)

        assertThat(capture.lowCardinality)
            .containsEntry("outcome", "failure")
            .containsEntry("errorCode", "schema_invalid")
        assertThat(capture.allValues()).noneMatch { it.contains(RAW_PROVIDER_FAILURE) }
        assertThat(capture.error).isNull()
        assertThat(MDC.getCopyOfContextMap()).isNullOrEmpty()
    }

    private fun observationContext() =
        AiProviderObservationContext(
            provider = Provider.OPENAI,
            model = ModelId(Provider.OPENAI, "gpt-5.4-mini"),
            mode = ProviderCallMode.PRIMARY,
            attemptOrdinal = 2,
            jobId = UUID.fromString("11111111-2222-4333-8444-555555555555"),
        )

    private class CapturingObservationHandler : ObservationHandler<Observation.Context> {
        var name: String? = null
        var lowCardinality: Map<String, String> = emptyMap()
        var highCardinality: Map<String, String> = emptyMap()
        var error: Throwable? = null

        override fun supportsContext(context: Observation.Context): Boolean = true

        override fun onStop(context: Observation.Context) {
            name = context.name
            lowCardinality = context.lowCardinalityKeyValues.associate { it.key to it.value }
            highCardinality = context.highCardinalityKeyValues.associate { it.key to it.value }
            error = context.error
        }

        fun allValues(): List<String> = lowCardinality.values + highCardinality.values
    }

    private companion object {
        const val RAW_PROVIDER_FAILURE = "raw-provider-response-secret@example.test"
        val FORBIDDEN_SYNTHETIC_VALUES =
            listOf(
                "synthetic prompt",
                "synthetic completion",
                "synthetic transcript",
                "synthetic schema",
                "synthetic evidence",
                "synthetic instructions",
                RAW_PROVIDER_FAILURE,
                "synthetic-api-key",
                "synthetic-session-id",
                "synthetic-club-id",
                "synthetic-user-id",
                "secret@example.test",
                "baggage",
            )
    }
}
