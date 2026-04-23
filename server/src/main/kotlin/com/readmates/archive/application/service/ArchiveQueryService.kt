package com.readmates.archive.application.service

import com.readmates.archive.application.port.`in`.GetArchiveSessionDetailUseCase
import com.readmates.archive.application.port.`in`.GetMyPageSummaryUseCase
import com.readmates.archive.application.port.`in`.ListArchiveSessionsUseCase
import com.readmates.archive.application.port.`in`.ListMyArchiveQuestionsUseCase
import com.readmates.archive.application.port.`in`.ListMyArchiveReviewsUseCase
import com.readmates.archive.application.port.out.LoadArchiveDataPort
import com.readmates.shared.security.CurrentMember
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

@Service
class ArchiveQueryService(
    private val loadArchiveDataPort: LoadArchiveDataPort,
) : ListArchiveSessionsUseCase,
    GetArchiveSessionDetailUseCase,
    ListMyArchiveQuestionsUseCase,
    ListMyArchiveReviewsUseCase,
    GetMyPageSummaryUseCase {
    override fun listArchiveSessions(currentMember: CurrentMember) =
        withMemberAppAccess(currentMember) { loadArchiveDataPort.loadArchiveSessions(currentMember) }

    override fun getArchiveSessionDetail(
        currentMember: CurrentMember,
        sessionId: UUID,
    ) = withMemberAppAccess(currentMember) {
        loadArchiveDataPort.loadArchiveSessionDetail(currentMember, sessionId)
    }

    override fun listMyQuestions(currentMember: CurrentMember) =
        withMemberAppAccess(currentMember) { loadArchiveDataPort.loadMyQuestions(currentMember) }

    override fun listMyReviews(currentMember: CurrentMember) =
        withMemberAppAccess(currentMember) { loadArchiveDataPort.loadMyReviews(currentMember) }

    override fun getMyPageSummary(currentMember: CurrentMember) =
        loadArchiveDataPort.loadMyPage(currentMember)

    private fun <T> withMemberAppAccess(
        currentMember: CurrentMember,
        block: () -> T,
    ): T {
        if (!currentMember.canBrowseMemberContent) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Member app access required")
        }
        return block()
    }
}
