package com.readmates.aigen.adapter.messaging

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.readmates.aigen.adapter.`in`.messaging.AiGenerationJobConsumer
import com.readmates.aigen.adapter.out.messaging.AiGenerationJobMessage
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.out.JobKind
import com.readmates.aigen.application.service.AiGenerationWorker
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.mockito.Mockito.doThrow
import org.mockito.Mockito.mock
import org.slf4j.LoggerFactory
import org.slf4j.MDC
import org.springframework.kafka.support.Acknowledgment
import java.util.UUID

class AiGenerationJobConsumerLoggingTest {
    @AfterEach
    fun clearMdc() {
        MDC.clear()
    }

    @Test
    fun `worker failure log and MDC contain only safe correlation metadata`() {
        val worker = mock(AiGenerationWorker::class.java)
        val acknowledgment = mock(Acknowledgment::class.java)
        val message = message()
        val failure = IllegalStateException(RAW_FAILURE)
        doThrow(failure).`when`(worker).process(message.jobId)
        val logger = LoggerFactory.getLogger(AiGenerationJobConsumer::class.java) as Logger
        val appender = ListAppender<ILoggingEvent>().apply { start() }
        logger.addAppender(appender)
        try {
            assertThatThrownBy { AiGenerationJobConsumer(worker).onMessage(message, acknowledgment) }
                .isSameAs(failure)
        } finally {
            logger.detachAppender(appender)
            appender.stop()
        }

        assertThat(appender.list).hasSize(1)
        val event = appender.list.single()
        assertThat(event.level).isEqualTo(Level.ERROR)
        assertThat(event.formattedMessage)
            .isEqualTo("AI generation worker failed errorCode=UNKNOWN failureClass=INFRASTRUCTURE")
        assertThat(event.throwableProxy).isNull()
        assertThat(event.mdcPropertyMap)
            .containsExactlyInAnyOrderEntriesOf(
                mapOf(
                    "jobId" to message.jobId.toString(),
                    "provider" to "openai",
                    "stage" to "worker",
                ),
            )
        assertThat(event.formattedMessage)
            .doesNotContain(
                RAW_FAILURE,
                message.sessionId.toString(),
                message.clubId.toString(),
                message.hostUserId.toString(),
                "synthetic prompt",
                "secret@example.test",
                "baggage",
            )
        assertThat(MDC.getCopyOfContextMap()).isNullOrEmpty()
    }

    private fun message() =
        AiGenerationJobMessage(
            jobId = UUID.fromString("11111111-2222-4333-8444-555555555555"),
            sessionId = UUID.fromString("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"),
            clubId = UUID.fromString("aaaaaaaa-bbbb-4ccc-8ddd-ffffffffffff"),
            hostUserId = UUID.fromString("aaaaaaaa-bbbb-4ccc-8ddd-111111111111"),
            provider = Provider.OPENAI,
            model = "gpt-5.4-mini",
            kind = JobKind.FULL,
        )

    private companion object {
        const val RAW_FAILURE = "raw provider response contains synthetic prompt and secret@example.test"
    }
}
