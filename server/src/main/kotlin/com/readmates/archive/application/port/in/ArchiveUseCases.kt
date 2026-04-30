package com.readmates.archive.application.port.`in`

import com.readmates.archive.application.model.ArchiveSessionResult
import com.readmates.archive.application.model.MemberArchiveSessionDetailResult
import com.readmates.archive.application.model.MyArchiveQuestionResult
import com.readmates.archive.application.model.MyArchiveReviewResult
import com.readmates.archive.application.model.MyPageResult
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import java.util.UUID

interface ListArchiveSessionsUseCase {
    fun listArchiveSessions(currentMember: CurrentMember, pageRequest: PageRequest): CursorPage<ArchiveSessionResult>
}

interface GetArchiveSessionDetailUseCase {
    fun getArchiveSessionDetail(
        currentMember: CurrentMember,
        sessionId: UUID,
    ): MemberArchiveSessionDetailResult?
}

interface ListMyArchiveQuestionsUseCase {
    fun listMyQuestions(currentMember: CurrentMember, pageRequest: PageRequest): CursorPage<MyArchiveQuestionResult>
}

interface ListMyArchiveReviewsUseCase {
    fun listMyReviews(currentMember: CurrentMember, pageRequest: PageRequest): CursorPage<MyArchiveReviewResult>
}

interface GetMyPageSummaryUseCase {
    fun getMyPageSummary(currentMember: CurrentMember): MyPageResult
}
