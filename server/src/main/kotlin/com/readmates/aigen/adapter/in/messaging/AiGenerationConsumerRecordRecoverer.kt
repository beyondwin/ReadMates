@file:Suppress("ktlint:standard:package-name")

package com.readmates.aigen.adapter.`in`.messaging

import com.readmates.aigen.application.model.AI_GENERATION_JOB_ID_HEADER
import com.readmates.aigen.application.model.AiGenerationKafkaRoutingValue
import com.readmates.aigen.application.model.AiGenerationRecoveryResult
import com.readmates.aigen.application.model.AiGenerationRecoverySource
import com.readmates.aigen.application.port.`in`.RecordUnroutableAiGenerationRecordUseCase
import com.readmates.aigen.application.port.`in`.RecoverExhaustedAiGenerationJobUseCase
import org.apache.kafka.clients.consumer.ConsumerRecord
import org.springframework.kafka.listener.ConsumerRecordRecoverer
import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets
import java.util.UUID

class AiGenerationConsumerRecordRecoverer(
    private val recoverExhaustedJob: RecoverExhaustedAiGenerationJobUseCase,
    private val recordUnroutableRecord: RecordUnroutableAiGenerationRecordUseCase,
) : ConsumerRecordRecoverer {
    override fun accept(
        record: ConsumerRecord<*, *>,
        failure: Exception,
    ) {
        when (val route = record.aiGenerationRoute()) {
            is AiGenerationKafkaRoute.Routable -> recover(route.jobId)
            AiGenerationKafkaRoute.Unroutable -> recordUnroutableRecord.recordUnroutableKafkaRecord()
        }
    }

    private fun recover(jobId: UUID) {
        when (recoverExhaustedJob.recoverExhausted(jobId, AiGenerationRecoverySource.KAFKA)) {
            AiGenerationRecoveryResult.RECOVERED_PENDING,
            AiGenerationRecoveryResult.RECOVERED_PENDING_UNACCOUNTED,
            AiGenerationRecoveryResult.RECOVERED_RUNNING,
            AiGenerationRecoveryResult.ALREADY_TERMINAL,
            AiGenerationRecoveryResult.MISSING,
            -> Unit

            AiGenerationRecoveryResult.DEFERRED_IN_FLIGHT,
            AiGenerationRecoveryResult.DEFERRED_STATE_CHANGED,
            AiGenerationRecoveryResult.DEFERRED_NOT_STALE,
            AiGenerationRecoveryResult.CORRUPT,
            AiGenerationRecoveryResult.FAILED,
            AiGenerationRecoveryResult.UNROUTABLE_RECORD,
            -> throw AiGenerationRecoveryDeferredException()
        }
    }
}

class AiGenerationRoutingMismatchException :
    RuntimeException(
        "AI generation Kafka record has no unambiguous canonical job identity",
    )

class AiGenerationRecoveryDeferredException :
    RuntimeException(
        "AI generation Kafka recovery is not durably complete",
    )

internal sealed interface AiGenerationKafkaRoute {
    data class Routable(
        val jobId: UUID,
    ) : AiGenerationKafkaRoute

    data object Unroutable : AiGenerationKafkaRoute
}

internal fun ConsumerRecord<*, *>.aiGenerationRoute(): AiGenerationKafkaRoute {
    val valueJobId = (value() as? AiGenerationKafkaRoutingValue)?.jobId
    val headerJobId = canonicalJobIdHeader()
    return when {
        valueJobId != null && headerJobId == valueJobId -> AiGenerationKafkaRoute.Routable(valueJobId)
        value() == null && headerJobId != null -> AiGenerationKafkaRoute.Routable(headerJobId)
        else -> AiGenerationKafkaRoute.Unroutable
    }
}

private fun ConsumerRecord<*, *>.canonicalJobIdHeader(): UUID? {
    val bytes =
        headers()
            .headers(AI_GENERATION_JOB_ID_HEADER)
            .toList()
            .singleOrNull()
            ?.value()
    return bytes
        ?.takeIf { it.size == CANONICAL_UUID_LENGTH }
        ?.let(::parseCanonicalJobId)
}

private fun parseCanonicalJobId(bytes: ByteArray): UUID? =
    runCatching {
        StandardCharsets.US_ASCII
            .newDecoder()
            .decode(ByteBuffer.wrap(bytes))
            .toString()
    }.getOrNull()?.let { text ->
        runCatching { UUID.fromString(text) }
            .getOrNull()
            ?.takeIf { it.toString() == text }
    }

private const val CANONICAL_UUID_LENGTH = 36
