package com.readmates.aigen.config

import com.readmates.aigen.adapter.`in`.messaging.AiGenerationConsumerRecordRecoverer
import com.readmates.aigen.adapter.`in`.messaging.AiGenerationRoutingMismatchException
import com.readmates.aigen.application.model.AiGenerationRecoveryResult
import com.readmates.aigen.application.port.`in`.RecordUnroutableAiGenerationRecordUseCase
import com.readmates.aigen.application.port.`in`.RecoverExhaustedAiGenerationJobUseCase
import com.readmates.aigen.application.service.ProviderCallStillInFlightException
import org.apache.kafka.clients.consumer.ConsumerRecord
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.kafka.listener.DefaultErrorHandler
import org.springframework.kafka.listener.ExceptionClassifier
import org.springframework.kafka.support.ExceptionMatcher
import org.springframework.kafka.support.serializer.DeserializationException
import org.springframework.util.backoff.BackOff
import org.springframework.util.backoff.FixedBackOff
import java.time.Duration
import java.util.UUID
import java.util.function.BiFunction

private typealias ErrorHandlerBackOffFunction = BiFunction<ConsumerRecord<*, *>, Exception, BackOff?>

class AiGenerationKafkaErrorHandlerTest {
    @Test
    fun `generic exhaustion uses exactly ten total attempts and explicit safe recovery`() {
        val recoverer = explicitRecoverer()
        val handler = handler(recoverer)
        val backOff = handler.configuredBackOff()

        assertThat(backOff.interval).isEqualTo(5_000L)
        assertThat(backOff.maxAttempts).isEqualTo(9L)
        assertThat(handler.isAckAfterHandle).isTrue()
        assertThat(handler.resetStateOnRecoveryFailure()).isTrue()
        assertThat(handler.configuredRecovererDelegate()).isSameAs(recoverer)
    }

    @Test
    fun `deserialization and identity mismatch consume the bounded retry budget explicitly`() {
        val matcher = handler().exceptionMatcher()

        assertThat(matcher.match(DeserializationException("invalid", byteArrayOf(1, 2), false, RuntimeException())))
            .isTrue()
        assertThat(matcher.match(AiGenerationRoutingMismatchException())).isTrue()
    }

    @Test
    fun `only provider live listener failures select timeout sized unlimited backoff`() {
        val handler = handler()
        val record = ConsumerRecord<String, Any>("jobs", 0, 0L, "club", Any())

        val providerBackOff =
            handler.configuredBackOffFunction().apply(
                record,
                ProviderCallStillInFlightException(),
            ) as FixedBackOff
        val genericBackOff = handler.configuredBackOffFunction().apply(record, RuntimeException("retry"))

        assertThat(providerBackOff.interval).isEqualTo(750L)
        assertThat(providerBackOff.maxAttempts).isEqualTo(FixedBackOff.UNLIMITED_ATTEMPTS)
        assertThat(genericBackOff).isNull()
    }

    private fun handler(recoverer: AiGenerationConsumerRecordRecoverer = explicitRecoverer()): DefaultErrorHandler =
        AiGenerationKafkaConfig().aiGenerationKafkaErrorHandler(
            AiGenerationKafkaProperties(
                bootstrapServers = listOf("kafka-a:9092"),
                consumerRetryDelay = Duration.ofSeconds(5),
                consumerMaxAttempts = 10,
            ),
            AiGenerationProperties(
                providerCalls =
                    AiGenerationProperties.ProviderCalls(
                        requestTimeout = Duration.ofMillis(750),
                    ),
            ),
            recoverer,
        ) as DefaultErrorHandler

    private fun explicitRecoverer(): AiGenerationConsumerRecordRecoverer {
        val recovery =
            object : RecoverExhaustedAiGenerationJobUseCase {
                override fun recoverExhausted(
                    jobId: UUID,
                    source: com.readmates.aigen.application.model.AiGenerationRecoverySource,
                ): AiGenerationRecoveryResult = AiGenerationRecoveryResult.RECOVERED_PENDING
            }
        val unroutable =
            object : RecordUnroutableAiGenerationRecordUseCase {
                override fun recordUnroutableKafkaRecord() = Unit
            }
        return AiGenerationConsumerRecordRecoverer(recovery, unroutable)
    }
}

private fun DefaultErrorHandler.exceptionMatcher(): ExceptionMatcher {
    val method = ExceptionClassifier::class.java.getDeclaredMethod("getExceptionMatcher")
    method.isAccessible = true
    return method.invoke(this) as ExceptionMatcher
}

private fun DefaultErrorHandler.failureTracker(): Any {
    val field =
        org.springframework.kafka.listener.FailedRecordProcessor::class.java
            .getDeclaredField("failureTracker")
    field.isAccessible = true
    return field.get(this)
}

private fun DefaultErrorHandler.configuredBackOff(): FixedBackOff {
    val tracker = failureTracker()
    val field = tracker.javaClass.getDeclaredField("backOff")
    field.isAccessible = true
    return field.get(tracker) as FixedBackOff
}

private fun DefaultErrorHandler.configuredRecovererDelegate(): Any {
    val tracker = failureTracker()
    val method = tracker.javaClass.getDeclaredMethod("getRecoverer")
    method.isAccessible = true
    val configured = method.invoke(tracker)
    val delegateField =
        configured.javaClass.declaredFields.single { field ->
            java.util.function.BiConsumer::class.java.isAssignableFrom(field.type)
        }
    delegateField.isAccessible = true
    return delegateField.get(configured)
}

private fun DefaultErrorHandler.resetStateOnRecoveryFailure(): Boolean {
    val tracker = failureTracker()
    val field = tracker.javaClass.getDeclaredField("resetStateOnRecoveryFailure")
    field.isAccessible = true
    return field.getBoolean(tracker)
}

private fun DefaultErrorHandler.configuredBackOffFunction(): ErrorHandlerBackOffFunction {
    val field =
        org.springframework.kafka.listener.FailedRecordProcessor::class.java
            .getDeclaredField("userBackOffFunction")
    field.isAccessible = true
    val function = field.get(this)
    val apply = function.javaClass.getMethod("apply", Any::class.java, Any::class.java)
    return BiFunction { record, failure ->
        apply.invoke(function, record, failure) as BackOff?
    }
}
