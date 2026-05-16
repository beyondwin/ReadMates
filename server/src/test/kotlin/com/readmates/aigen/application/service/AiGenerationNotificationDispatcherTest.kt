package com.readmates.aigen.application.service

import com.readmates.notification.application.port.`in`.RecordNotificationEventUseCase
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.LocalDate
import java.util.UUID

class AiGenerationNotificationDispatcherTest {
    @Test
    fun `notifyLongGeneration delegates to recordAiGenerationReady with the same four UUID arguments`() {
        val recorder = RecordingRecordNotificationEventUseCase()
        val dispatcher = AiGenerationNotificationDispatcher(recorder)
        val jobId = UUID.randomUUID()
        val sessionId = UUID.randomUUID()
        val clubId = UUID.randomUUID()
        val hostUserId = UUID.randomUUID()

        dispatcher.notifyLongGeneration(jobId, sessionId, clubId, hostUserId)

        val recorded = recorder.aiGenerationReadyCalls.single()
        assertThat(recorded.jobId).isEqualTo(jobId)
        assertThat(recorded.sessionId).isEqualTo(sessionId)
        assertThat(recorded.clubId).isEqualTo(clubId)
        assertThat(recorded.hostUserId).isEqualTo(hostUserId)
    }

    @Test
    fun `notifyLongGeneration does not call any other RecordNotificationEventUseCase method (PII invariant - no transcript path)`() {
        val recorder = RecordingRecordNotificationEventUseCase()
        val dispatcher = AiGenerationNotificationDispatcher(recorder)

        dispatcher.notifyLongGeneration(
            jobId = UUID.randomUUID(),
            sessionId = UUID.randomUUID(),
            clubId = UUID.randomUUID(),
            hostUserId = UUID.randomUUID(),
        )

        assertThat(recorder.feedbackCalls).isEmpty()
        assertThat(recorder.nextBookCalls).isEmpty()
        assertThat(recorder.reviewCalls).isEmpty()
        assertThat(recorder.sessionReminderCalls).isEmpty()
    }
}

private data class AiGenerationReadyCall(
    val jobId: UUID,
    val sessionId: UUID,
    val clubId: UUID,
    val hostUserId: UUID,
)

private class RecordingRecordNotificationEventUseCase : RecordNotificationEventUseCase {
    val aiGenerationReadyCalls = mutableListOf<AiGenerationReadyCall>()
    val feedbackCalls = mutableListOf<List<Any>>()
    val nextBookCalls = mutableListOf<List<Any>>()
    val reviewCalls = mutableListOf<List<Any>>()
    val sessionReminderCalls = mutableListOf<LocalDate>()

    override fun recordAiGenerationReady(
        jobId: UUID,
        sessionId: UUID,
        clubId: UUID,
        hostUserId: UUID,
    ) {
        aiGenerationReadyCalls += AiGenerationReadyCall(jobId, sessionId, clubId, hostUserId)
    }

    override fun recordFeedbackDocumentPublished(
        clubId: UUID,
        sessionId: UUID,
        sessionNumber: Int,
        bookTitle: String,
        documentVersion: Int,
    ) {
        feedbackCalls += listOf(clubId, sessionId, sessionNumber, bookTitle, documentVersion)
    }

    override fun recordNextBookPublished(
        clubId: UUID,
        sessionId: UUID,
        sessionNumber: Int,
        bookTitle: String,
    ) {
        nextBookCalls += listOf(clubId, sessionId, sessionNumber, bookTitle)
    }

    override fun recordReviewPublished(
        clubId: UUID,
        sessionId: UUID,
        sessionNumber: Int,
        bookTitle: String,
        authorMembershipId: UUID,
    ) {
        reviewCalls += listOf(clubId, sessionId, sessionNumber, bookTitle, authorMembershipId)
    }

    override fun recordSessionReminderDue(targetDate: LocalDate) {
        sessionReminderCalls += targetDate
    }
}
