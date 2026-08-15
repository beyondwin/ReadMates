@file:Suppress("ktlint:standard:package-name")

package com.readmates.aigen.adapter.`in`.messaging

import com.readmates.aigen.application.model.AI_GENERATION_JOB_ID_HEADER
import com.readmates.aigen.application.model.AiGenerationJobMessage
import com.readmates.aigen.application.model.AiGenerationRecoveryResult
import com.readmates.aigen.application.model.AiGenerationRecoverySource
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.`in`.ProcessAiGenerationJobUseCase
import com.readmates.aigen.application.port.`in`.RecordUnroutableAiGenerationRecordUseCase
import com.readmates.aigen.application.port.`in`.RecoverExhaustedAiGenerationJobUseCase
import com.readmates.aigen.application.port.out.JobKind
import org.apache.kafka.clients.consumer.ConsumerRecord
import org.apache.kafka.common.header.internals.RecordHeader
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.kafka.support.Acknowledgment
import java.nio.charset.StandardCharsets
import java.util.UUID

class AiGenerationKafkaRecordRoutingTest {
    @Test
    fun `listener accepts one canonical equal job header and invokes the input port before acknowledging`() {
        val worker = Mockito.mock(ProcessAiGenerationJobUseCase::class.java)
        val acknowledgment = Mockito.mock(Acknowledgment::class.java)
        val message = message(JOB_ID)
        val record = record(message, JOB_ID.toString())

        AiGenerationJobConsumer(worker).onMessage(record, acknowledgment)

        Mockito
            .inOrder(worker, acknowledgment)
            .apply {
                verify(worker).process(JOB_ID)
                verify(acknowledgment).acknowledge()
            }
    }

    @Test
    fun `listener rejects missing invalid duplicate and mismatched headers before the worker`() {
        val invalidHeaders =
            listOf(
                emptyList(),
                listOf("not-a-uuid"),
                listOf(JOB_ID.toString().uppercase()),
                listOf(OTHER_JOB_ID.toString()),
                listOf(JOB_ID.toString(), JOB_ID.toString()),
            )

        invalidHeaders.forEach { headers ->
            val worker = Mockito.mock(ProcessAiGenerationJobUseCase::class.java)
            val acknowledgment = Mockito.mock(Acknowledgment::class.java)
            val record = record(message(JOB_ID), *headers.toTypedArray())

            assertThatThrownBy { AiGenerationJobConsumer(worker).onMessage(record, acknowledgment) }
                .isInstanceOf(AiGenerationRoutingMismatchException::class.java)
                .hasMessage("AI generation Kafka record has no unambiguous canonical job identity")

            Mockito.verifyNoInteractions(worker, acknowledgment)
        }
    }

    @Test
    fun `listener rejects null payload without invoking or acknowledging`() {
        val worker = Mockito.mock(ProcessAiGenerationJobUseCase::class.java)
        val acknowledgment = Mockito.mock(Acknowledgment::class.java)

        assertThatThrownBy {
            AiGenerationJobConsumer(worker).onMessage(
                record(null, JOB_ID.toString()),
                acknowledgment,
            )
        }.isInstanceOf(AiGenerationRoutingMismatchException::class.java)
            .hasMessage("AI generation Kafka record has no unambiguous canonical job identity")

        Mockito.verifyNoInteractions(worker, acknowledgment)
    }

    @Test
    fun `recoverer routes equal values and null deserialization values only by canonical header`() {
        val recovery = RecordingRecovery(AiGenerationRecoveryResult.RECOVERED_PENDING)
        val unroutable = RecordingUnroutable()
        val recoverer = AiGenerationConsumerRecordRecoverer(recovery, unroutable)

        recoverer.accept(record(message(JOB_ID), JOB_ID.toString()), RuntimeException("safe"))
        recoverer.accept(record(null, OTHER_JOB_ID.toString()), RuntimeException("safe"))

        assertThat(recovery.calls).containsExactly(
            JOB_ID to AiGenerationRecoverySource.KAFKA,
            OTHER_JOB_ID to AiGenerationRecoverySource.KAFKA,
        )
        assertThat(unroutable.calls).isZero()
    }

    @Test
    fun `recoverer never chooses an ambiguous value or header identity`() {
        val recovery = RecordingRecovery(AiGenerationRecoveryResult.RECOVERED_PENDING)
        val unroutable = RecordingUnroutable()
        val recoverer = AiGenerationConsumerRecordRecoverer(recovery, unroutable)
        val records =
            listOf(
                record(message(JOB_ID)),
                record(message(JOB_ID), "not-a-uuid"),
                record(message(JOB_ID), OTHER_JOB_ID.toString()),
                record(message(JOB_ID), JOB_ID.toString(), JOB_ID.toString()),
                record(null),
                record(null, "not-a-uuid"),
            )

        records.forEach { recoverer.accept(it, RuntimeException("safe")) }

        assertThat(recovery.calls).isEmpty()
        assertThat(unroutable.calls).isEqualTo(records.size)
    }

    @Test
    fun `recoverer returns only after durable recovery and throws fixed deferred failure otherwise`() {
        val durable =
            listOf(
                AiGenerationRecoveryResult.RECOVERED_PENDING,
                AiGenerationRecoveryResult.RECOVERED_PENDING_UNACCOUNTED,
                AiGenerationRecoveryResult.RECOVERED_RUNNING,
                AiGenerationRecoveryResult.ALREADY_TERMINAL,
                AiGenerationRecoveryResult.MISSING,
            )
        durable.forEach { result ->
            AiGenerationConsumerRecordRecoverer(RecordingRecovery(result), RecordingUnroutable())
                .accept(record(message(JOB_ID), JOB_ID.toString()), RuntimeException("safe"))
        }

        val deferred =
            listOf(
                AiGenerationRecoveryResult.DEFERRED_IN_FLIGHT,
                AiGenerationRecoveryResult.DEFERRED_STATE_CHANGED,
                AiGenerationRecoveryResult.DEFERRED_NOT_STALE,
                AiGenerationRecoveryResult.CORRUPT,
                AiGenerationRecoveryResult.FAILED,
            )
        deferred.forEach { result ->
            assertThatThrownBy {
                AiGenerationConsumerRecordRecoverer(RecordingRecovery(result), RecordingUnroutable())
                    .accept(record(message(JOB_ID), JOB_ID.toString()), RuntimeException("raw provider body"))
            }.isInstanceOf(AiGenerationRecoveryDeferredException::class.java)
                .hasMessage("AI generation Kafka recovery is not durably complete")
                .hasNoCause()
        }
    }

    @Test
    fun `recoverer propagates persistence failure so the offset cannot be committed`() {
        val failure = IllegalStateException("redis unavailable")
        val recovery =
            object : RecoverExhaustedAiGenerationJobUseCase {
                override fun recoverExhausted(
                    jobId: UUID,
                    source: AiGenerationRecoverySource,
                ): AiGenerationRecoveryResult = throw failure
            }

        assertThatThrownBy {
            AiGenerationConsumerRecordRecoverer(recovery, RecordingUnroutable())
                .accept(record(message(JOB_ID), JOB_ID.toString()), RuntimeException("safe"))
        }.isSameAs(failure)
    }

    private fun message(jobId: UUID) =
        AiGenerationJobMessage(
            jobId = jobId,
            sessionId = UUID.fromString("00000000-0000-4000-8000-000000000003"),
            clubId = UUID.fromString("00000000-0000-4000-8000-000000000004"),
            hostUserId = UUID.fromString("00000000-0000-4000-8000-000000000005"),
            provider = Provider.OPENAI,
            model = "gpt-5.4-mini",
            kind = JobKind.FULL,
        )

    private fun record(
        value: AiGenerationJobMessage?,
        vararg headerValues: String,
    ): ConsumerRecord<String, AiGenerationJobMessage?> =
        ConsumerRecord("jobs", 0, 0L, "club", value).also { record ->
            headerValues.forEach { value ->
                record.headers().add(
                    RecordHeader(
                        AI_GENERATION_JOB_ID_HEADER,
                        value.toByteArray(StandardCharsets.US_ASCII),
                    ),
                )
            }
        }

    private class RecordingRecovery(
        private val result: AiGenerationRecoveryResult,
    ) : RecoverExhaustedAiGenerationJobUseCase {
        val calls = mutableListOf<Pair<UUID, AiGenerationRecoverySource>>()

        override fun recoverExhausted(
            jobId: UUID,
            source: AiGenerationRecoverySource,
        ): AiGenerationRecoveryResult {
            calls += jobId to source
            return result
        }
    }

    private class RecordingUnroutable : RecordUnroutableAiGenerationRecordUseCase {
        var calls = 0

        override fun recordUnroutableKafkaRecord() {
            calls += 1
        }
    }

    private companion object {
        val JOB_ID: UUID = UUID.fromString("abcdef00-0000-4000-8000-000000000001")
        val OTHER_JOB_ID: UUID = UUID.fromString("00000000-0000-4000-8000-000000000002")
    }
}
