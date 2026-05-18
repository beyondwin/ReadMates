package com.readmates.sessionimport.application.service

import com.readmates.auth.domain.MembershipRole
import com.readmates.notification.application.port.`in`.RecordNotificationEventUseCase
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.sessionimport.application.model.SessionImportAttendee
import com.readmates.sessionimport.application.model.SessionImportCommand
import com.readmates.sessionimport.application.model.SessionImportFeedbackDocumentCommand
import com.readmates.sessionimport.application.model.SessionImportPublicationCommand
import com.readmates.sessionimport.application.model.SessionImportRecordCommand
import com.readmates.sessionimport.application.model.SessionImportSessionCommand
import com.readmates.sessionimport.application.model.SessionImportTarget
import com.readmates.sessionimport.application.port.`in`.CommitValidatedSessionImportUseCase
import com.readmates.sessionimport.application.port.`in`.ValidatedSessionImportInput
import com.readmates.sessionimport.application.port.out.SessionImportRecordReplacement
import com.readmates.sessionimport.application.port.out.SessionImportStoredFeedbackDocument
import com.readmates.sessionimport.application.port.out.SessionImportWritePort
import com.readmates.shared.cache.ReadCacheInvalidationPort
import com.readmates.shared.security.CurrentMember
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import java.time.LocalDate
import java.util.UUID

private const val FEEDBACK_MARKDOWN = """<!-- readmates-feedback:v1 -->

# 독서모임 7951차 피드백

Import Test Book · 2026.05.14

## 메타

- 일시: 2026.05.14 (목) · 20:00
- 소요시간: 2시간
- 책: Import Test Book · Import Author
- 참여자: Import Host, Import Member

## 관찰자 노트

Import notes.

## 참여자별 피드백

### 01. Import Host

역할: 진행자

#### 참여 스타일

Steady.

#### 실질 기여

- Framed the central question.

#### 문제점과 자기모순

##### 1. Scope was broad

- 핵심: Broad.
- 근거: Multiple.
- 해석: Narrow next time.

#### 실천 과제

1. State the boundary.

#### 드러난 한 문장

> A question needs a boundary.

맥락: Closing the session

주석: Host role.
"""

@Tag("unit")
class SessionImportServiceCommitValidatedTest {
    @Test
    @Suppress("LongMethod")
    fun `commitValidated returns same sessionId and triggers cache eviction`() {
        val clubId = UUID.randomUUID()
        val sessionId = UUID.randomUUID()
        val hostMembershipId = UUID.randomUUID()
        val host = currentMember(clubId = clubId, membershipId = hostMembershipId)
        val target =
            SessionImportTarget(
                sessionId = sessionId,
                clubId = clubId,
                sessionNumber = 7951,
                bookTitle = "Import Test Book",
                meetingDate = LocalDate.of(2026, 5, 14),
                attendees =
                    listOf(
                        SessionImportAttendee(
                            membershipId = hostMembershipId,
                            displayName = "Import Host",
                            active = true,
                        ),
                    ),
            )
        val writePort = RecordingWritePort(target)
        val cache = RecordingCacheInvalidation()
        val notificationEvents = RecordingNotificationEvents()
        val service =
            SessionImportService(
                writePort = writePort,
                recordNotificationEventUseCase = notificationEvents,
                cacheInvalidation = cache,
            )

        val command =
            SessionImportCommand(
                host = host,
                sessionId = sessionId,
                recordVisibility = SessionRecordVisibility.MEMBER,
                format = "readmates-session-import:v1",
                session =
                    SessionImportSessionCommand(
                        number = 7951,
                        bookTitle = "Import Test Book",
                        meetingDate = LocalDate.of(2026, 5, 14),
                    ),
                publication = SessionImportPublicationCommand(summary = "Import summary."),
                highlights =
                    listOf(
                        SessionImportRecordCommand(
                            authorName = "Import Host",
                            text = "Host highlight.",
                        ),
                    ),
                oneLineReviews =
                    listOf(
                        SessionImportRecordCommand(
                            authorName = "Import Host",
                            text = "Host one line.",
                        ),
                    ),
                feedbackDocument =
                    SessionImportFeedbackDocumentCommand(
                        fileName = "session-7951-import.md",
                        markdown = FEEDBACK_MARKDOWN,
                    ),
            )

        // Assigning to the interface type pins the contract: SessionImportService MUST
        // implement CommitValidatedSessionImportUseCase. A compile error here is a regression.
        val useCase: CommitValidatedSessionImportUseCase = service
        val result = useCase.commitValidated(ValidatedSessionImportInput(command))

        assertEquals(sessionId.toString(), result.sessionId)
        assertEquals("Import summary.", result.publication.summary)
        assertEquals(1, result.highlights.size)
        assertEquals(1, result.oneLineReviews.size)
        assertTrue(result.feedbackDocument.uploaded)
        assertEquals(1, writePort.replaceCallCount, "replaceRecords must be invoked exactly once")
        assertEquals(1, cache.evictCount, "cache eviction must be invoked exactly once")
        assertEquals(clubId, cache.lastClubId)

        assertEquals(1, notificationEvents.feedbackEvents.size)
        val event = notificationEvents.feedbackEvents.single()
        assertEquals(clubId, event.clubId)
        assertEquals(sessionId, event.sessionId)
        assertEquals(7951, event.sessionNumber)
        assertEquals("Import Test Book", event.bookTitle)
        assertEquals(2, event.documentVersion)
    }

    private fun currentMember(
        clubId: UUID,
        membershipId: UUID,
    ): CurrentMember =
        CurrentMember(
            userId = UUID.randomUUID(),
            membershipId = membershipId,
            clubId = clubId,
            clubSlug = "test-club",
            email = "host@example.test",
            displayName = "Import Host",
            accountName = "host",
            role = MembershipRole.HOST,
        )
}

private class RecordingWritePort(
    private val target: SessionImportTarget,
) : SessionImportWritePort {
    var replaceCallCount: Int = 0
    var lastReplacement: SessionImportRecordReplacement? = null

    override fun loadTarget(
        host: CurrentMember,
        sessionId: UUID,
    ): SessionImportTarget = target

    override fun replaceRecords(command: SessionImportRecordReplacement): SessionImportStoredFeedbackDocument {
        replaceCallCount += 1
        lastReplacement = command
        return SessionImportStoredFeedbackDocument(
            fileName = command.feedbackDocument.fileName,
            title = command.feedbackTitle,
            uploadedAt = "2026-05-16T00:00:00Z",
            version = 2,
        )
    }
}

private data class RecordedFeedbackEvent(
    val clubId: UUID,
    val sessionId: UUID,
    val sessionNumber: Int,
    val bookTitle: String,
    val documentVersion: Int,
)

private class RecordingNotificationEvents : RecordNotificationEventUseCase {
    val feedbackEvents = mutableListOf<RecordedFeedbackEvent>()

    override fun recordFeedbackDocumentPublished(
        clubId: UUID,
        sessionId: UUID,
        sessionNumber: Int,
        bookTitle: String,
        documentVersion: Int,
    ) {
        feedbackEvents += RecordedFeedbackEvent(clubId, sessionId, sessionNumber, bookTitle, documentVersion)
    }

    override fun recordNextBookPublished(
        clubId: UUID,
        sessionId: UUID,
        sessionNumber: Int,
        bookTitle: String,
    ) = Unit

    override fun recordReviewPublished(
        clubId: UUID,
        sessionId: UUID,
        sessionNumber: Int,
        bookTitle: String,
        authorMembershipId: UUID,
    ) = Unit

    override fun recordSessionReminderDue(targetDate: LocalDate) = Unit

    override fun recordAiGenerationReady(
        jobId: UUID,
        sessionId: UUID,
        clubId: UUID,
        hostUserId: UUID,
    ) = Unit
}

private class RecordingCacheInvalidation : ReadCacheInvalidationPort {
    var evictCount: Int = 0
    var lastClubId: UUID? = null

    override fun evictClubContent(clubId: UUID) {
        evictCount += 1
        lastClubId = clubId
    }

    override fun evictClubContentAfterCommit(clubId: UUID) {
        // Bypass transaction synchronization for tests — invoke directly.
        evictClubContent(clubId)
    }
}
