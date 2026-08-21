package com.readmates.archive.application.service

import com.readmates.archive.application.ArchiveApplicationError
import com.readmates.archive.application.ArchiveApplicationException
import com.readmates.archive.application.port.`in`.SaveMemberArchiveLongReviewCommand
import com.readmates.archive.application.port.`in`.SaveMemberArchiveLongReviewResult
import com.readmates.archive.application.port.out.MemberArchiveReviewWritePort
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.notification.application.NotificationApplicationError
import com.readmates.notification.application.NotificationApplicationException
import com.readmates.notification.application.port.`in`.RecordNotificationEventUseCase
import com.readmates.shared.security.CurrentMember
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.LocalDate
import java.util.UUID

class MemberArchiveReviewServiceTest {
    @Test
    fun `maps missing notification session to archive session not found`() {
        val service =
            MemberArchiveReviewService(
                writePort =
                    object : MemberArchiveReviewWritePort {
                        override fun saveLongReview(command: SaveMemberArchiveLongReviewCommand) =
                            SaveMemberArchiveLongReviewResult(
                                sessionId = command.sessionId,
                                sessionNumber = 4,
                                bookTitle = "테스트 책",
                                body = command.body,
                                newlyPublic = true,
                            )
                    },
                recordNotificationEventUseCase = MissingSessionEvents(),
            )

        assertThatThrownBy { service.save(command()) }
            .isInstanceOf(ArchiveApplicationException::class.java)
            .extracting("error")
            .isEqualTo(ArchiveApplicationError.SESSION_NOT_FOUND)
    }

    private fun command() =
        SaveMemberArchiveLongReviewCommand(
            member =
                CurrentMember(
                    userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
                    membershipId = UUID.fromString("00000000-0000-0000-0000-000000000201"),
                    clubId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
                    clubSlug = "reading-sai",
                    email = "member@example.com",
                    displayName = "Member",
                    accountName = "Member",
                    role = MembershipRole.MEMBER,
                    membershipStatus = MembershipStatus.ACTIVE,
                ),
            sessionId = UUID.fromString("00000000-0000-0000-0000-000000000306"),
            body = "공개 서평입니다.",
        )

    private class MissingSessionEvents : RecordNotificationEventUseCase {
        override fun recordFeedbackDocumentPublished(
            clubId: UUID,
            sessionId: UUID,
            sessionNumber: Int,
            bookTitle: String,
            documentVersion: Int,
        ) = Unit

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
        ) = throw NotificationApplicationException(
            NotificationApplicationError.NOTIFICATION_NOT_FOUND,
            "Notification session is missing",
        )

        override fun recordSessionReminderDue(targetDate: LocalDate) = Unit

        override fun recordAiGenerationReady(
            jobId: UUID,
            sessionId: UUID,
            clubId: UUID,
            hostUserId: UUID,
        ) = Unit
    }
}
