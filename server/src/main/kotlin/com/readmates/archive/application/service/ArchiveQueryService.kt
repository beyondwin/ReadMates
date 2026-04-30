package com.readmates.archive.application.service

import com.readmates.archive.application.port.`in`.GetArchiveSessionDetailUseCase
import com.readmates.archive.application.port.`in`.GetMyPageSummaryUseCase
import com.readmates.archive.application.port.`in`.ListArchiveSessionsUseCase
import com.readmates.archive.application.port.`in`.ListMyArchiveQuestionsUseCase
import com.readmates.archive.application.port.`in`.ListMyArchiveReviewsUseCase
import com.readmates.archive.application.port.out.LoadArchiveDataPort
import com.readmates.shared.paging.PageRequest
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
    override fun listArchiveSessions(currentMember: CurrentMember, pageRequest: PageRequest) =
        withMemberAppAccess(currentMember) { loadArchiveDataPort.loadArchiveSessions(currentMember, pageRequest) }

    override fun getArchiveSessionDetail(
        currentMember: CurrentMember,
        sessionId: UUID,
    ) = withMemberAppAccess(currentMember) {
        loadArchiveDataPort.loadArchiveSessionDetail(currentMember, sessionId)
    }

    override fun listMyQuestions(currentMember: CurrentMember, pageRequest: PageRequest) =
        withMemberAppAccess(currentMember) { loadArchiveDataPort.loadMyQuestions(currentMember, pageRequest) }

    override fun listMyReviews(currentMember: CurrentMember, pageRequest: PageRequest) =
        withMemberAppAccess(currentMember) { loadArchiveDataPort.loadMyReviews(currentMember, pageRequest) }

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
