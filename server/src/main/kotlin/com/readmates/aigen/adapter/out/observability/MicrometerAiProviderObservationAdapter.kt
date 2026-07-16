package com.readmates.aigen.adapter.out.observability

import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.ProviderCallException
import com.readmates.aigen.application.port.out.AiProviderObservationContext
import com.readmates.aigen.application.port.out.AiProviderObservationPort
import io.micrometer.observation.Observation
import io.micrometer.observation.ObservationRegistry
import org.slf4j.MDC
import org.springframework.stereotype.Component
import java.util.Locale

@Component
class MicrometerAiProviderObservationAdapter(
    private val registry: ObservationRegistry,
) : AiProviderObservationPort {
    @Suppress("TooGenericExceptionCaught")
    override fun <T> observe(
        context: AiProviderObservationContext,
        block: () -> T,
    ): T {
        val observation =
            Observation
                .createNotStarted(OBSERVATION_NAME, registry)
                .lowCardinalityKeyValue("provider", context.provider.safeValue())
                .lowCardinalityKeyValue("model", context.model.name)
                .lowCardinalityKeyValue("callMode", context.mode.safeValue())
                .highCardinalityKeyValue("jobId", context.jobId.toString())
                .highCardinalityKeyValue("attempt", context.attemptOrdinal.toString())
                .start()
        try {
            val value = observation.openScope().use { withMdc(context, block) }
            observation
                .lowCardinalityKeyValue("outcome", OUTCOME_SUCCESS)
                .lowCardinalityKeyValue("errorCode", NO_ERROR)
            return value
        } catch (failure: RuntimeException) {
            observation
                .lowCardinalityKeyValue("outcome", OUTCOME_FAILURE)
                .lowCardinalityKeyValue("errorCode", failure.safeErrorCode())
            throw failure
        } finally {
            observation.stop()
        }
    }

    private fun <T> withMdc(
        context: AiProviderObservationContext,
        block: () -> T,
    ): T =
        withMdcValue("jobId", context.jobId.toString()) {
            withMdcValue("provider", context.provider.safeValue()) {
                withMdcValue("stage", context.mode.safeValue()) {
                    withMdcValue("attempt", context.attemptOrdinal.toString()) {
                        block()
                    }
                }
            }
        }

    private fun <T> withMdcValue(
        key: String,
        value: String,
        block: () -> T,
    ): T {
        val previous = MDC.get(key)
        val closeable = MDC.putCloseable(key, value)
        try {
            return block()
        } finally {
            closeable.close()
            previous?.let { MDC.put(key, it) }
        }
    }

    private fun RuntimeException.safeErrorCode(): String =
        when (this) {
            is ProviderCallException -> error.code.safeValue()
            else -> ErrorCode.PROVIDER_UNAVAILABLE.safeValue()
        }

    private fun Enum<*>.safeValue(): String = name.lowercase(Locale.ROOT)

    private companion object {
        const val OBSERVATION_NAME = "readmates.aigen.provider.call"
        const val OUTCOME_SUCCESS = "success"
        const val OUTCOME_FAILURE = "failure"
        const val NO_ERROR = "none"
    }
}
