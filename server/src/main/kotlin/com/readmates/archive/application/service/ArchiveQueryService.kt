package com.readmates.archive.application.service

import com.readmates.archive.application.ArchiveApplicationError
import com.readmates.archive.application.ArchiveApplicationException
import com.readmates.archive.application.model.MemberArchiveSessionDetailResult
import com.readmates.archive.application.port.`in`.GetArchiveSessionDetailUseCase
import com.readmates.archive.application.port.`in`.GetMyPageSummaryUseCase
import com.readmates.archive.application.port.`in`.ListArchiveSessionsUseCase
import com.readmates.archive.application.port.`in`.ListMyArchiveQuestionsUseCase
import com.readmates.archive.application.port.`in`.ListMyArchiveReviewsUseCase
import com.readmates.archive.application.port.out.ArchiveDetailBatchReadPort
import com.readmates.archive.application.port.out.LoadArchiveDataPort
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class ArchiveQueryService(
    private val loadArchiveDataPort: LoadArchiveDataPort,
    private val archiveDetailBatchReadPort: ArchiveDetailBatchReadPort,
) : ListArchiveSessionsUseCase,
    GetArchiveSessionDetailUseCase,
    ListMyArchiveQuestionsUseCase,
    ListMyArchiveReviewsUseCase,
    GetMyPageSummaryUseCase {
    override fun listArchiveSessions(
        currentMember: CurrentMember,
        pageRequest: PageRequest,
    ) = withMemberAppAccess(currentMember) { loadArchiveDataPort.loadArchiveSessions(currentMember, pageRequest) }

    override fun getArchiveSessionDetail(
        currentMember: CurrentMember,
        sessionId: UUID,
    ): MemberArchiveSessionDetailResult? =
        withMemberAppAccess(currentMember) {
            val header = loadArchiveDataPort.loadArchiveSessionDetail(currentMember, sessionId) ?: return@withMemberAppAccess null
            val fragments =
                archiveDetailBatchReadPort.loadDetail(
                    currentMember = currentMember,
                    sessionId = sessionId,
                    sessionNumber = header.sessionNumber,
                    myAttendanceStatus = header.myAttendanceStatus,
                )
            MemberArchiveSessionDetailResult(
                sessionId = header.sessionId,
                sessionNumber = header.sessionNumber,
                title = header.title,
                bookTitle = header.bookTitle,
                bookAuthor = header.bookAuthor,
                bookImageUrl = header.bookImageUrl,
                date = header.date,
                locationLabel = header.locationLabel,
                attendance = header.attendance,
                total = header.total,
                state = header.state,
                myAttendanceStatus = header.myAttendanceStatus,
                isHost = header.isHost,
                publicSummary = header.publicSummary,
                publicHighlights = fragments.publicHighlights,
                clubQuestions = fragments.clubQuestions,
                clubOneLiners = fragments.clubOneLiners,
                publicOneLiners = fragments.publicOneLiners,
                myQuestions = fragments.myQuestions,
                myCheckin = fragments.myCheckin,
                myOneLineReview = fragments.myOneLineReview,
                myLongReview = fragments.myLongReview,
                feedbackDocument = fragments.feedbackDocument,
            )
        }

    override fun listMyQuestions(
        currentMember: CurrentMember,
        pageRequest: PageRequest,
    ) = withMemberAppAccess(currentMember) { loadArchiveDataPort.loadMyQuestions(currentMember, pageRequest) }

    override fun listMyReviews(
        currentMember: CurrentMember,
        pageRequest: PageRequest,
    ) = withMemberAppAccess(currentMember) { loadArchiveDataPort.loadMyReviews(currentMember, pageRequest) }

    override fun getMyPageSummary(currentMember: CurrentMember) = loadArchiveDataPort.loadMyPage(currentMember)

    private fun <T> withMemberAppAccess(
        currentMember: CurrentMember,
        block: () -> T,
    ): T {
        if (!currentMember.canBrowseMemberContent) {
            throw ArchiveApplicationException(
                ArchiveApplicationError.MEMBER_APP_ACCESS_REQUIRED,
                "Member app access required",
            )
        }
        return block()
    }
}
