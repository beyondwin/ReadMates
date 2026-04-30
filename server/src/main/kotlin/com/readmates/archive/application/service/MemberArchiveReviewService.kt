package com.readmates.archive.application.service

import com.readmates.archive.application.ArchiveApplicationError
import com.readmates.archive.application.ArchiveApplicationException
import com.readmates.archive.application.port.`in`.SaveMemberArchiveLongReviewCommand
import com.readmates.archive.application.port.`in`.SaveMemberArchiveLongReviewResult
import com.readmates.archive.application.port.`in`.SaveMemberArchiveLongReviewUseCase
import com.readmates.archive.application.port.out.MemberArchiveReviewWritePort
import com.readmates.notification.application.port.`in`.RecordNotificationEventUseCase
import com.readmates.shared.cache.ReadCacheInvalidationPort
import com.readmates.shared.security.AccessDeniedException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class MemberArchiveReviewService(
    private val writePort: MemberArchiveReviewWritePort,
    private val recordNotificationEventUseCase: RecordNotificationEventUseCase,
    private val cacheInvalidation: ReadCacheInvalidationPort = ReadCacheInvalidationPort.Noop(),
) : SaveMemberArchiveLongReviewUseCase {
    @Transactional
    override fun save(command: SaveMemberArchiveLongReviewCommand): SaveMemberArchiveLongReviewResult {
        if (!command.member.isActive) {
            throw AccessDeniedException("Approved active membership is required")
        }
        if (command.body.isBlank()) {
            throw ArchiveApplicationException(ArchiveApplicationError.REVIEW_BODY_REQUIRED, "Review body is required")
        }

        val result = writePort.saveLongReview(command)
            ?: throw ArchiveApplicationException(ArchiveApplicationError.SESSION_NOT_FOUND, "Archive session not found")

        if (result.newlyPublic) {
            recordNotificationEventUseCase.recordReviewPublished(
                clubId = command.member.clubId,
                sessionId = command.sessionId,
                sessionNumber = result.sessionNumber,
                bookTitle = result.bookTitle,
                authorMembershipId = command.member.membershipId,
            )
        }
        cacheInvalidation.evictClubContentAfterCommit(command.member.clubId)
        return result
    }
}
