package com.readmates.archive.application.port.`in`

import com.readmates.archive.application.model.ArchiveSessionResult
import com.readmates.archive.application.model.MemberArchiveSessionDetailResult
import com.readmates.archive.application.model.MyArchiveQuestionResult
import com.readmates.archive.application.model.MyArchiveReviewResult
import com.readmates.archive.application.model.MyPageResult
import com.readmates.shared.security.CurrentMember
import java.util.UUID

interface ListArchiveSessionsUseCase {
    fun listArchiveSessions(currentMember: CurrentMember): List<ArchiveSessionResult>
}

interface GetArchiveSessionDetailUseCase {
    fun getArchiveSessionDetail(
        currentMember: CurrentMember,
        sessionId: UUID,
    ): MemberArchiveSessionDetailResult?
}

interface ListMyArchiveQuestionsUseCase {
    fun listMyQuestions(currentMember: CurrentMember): List<MyArchiveQuestionResult>
}

interface ListMyArchiveReviewsUseCase {
    fun listMyReviews(currentMember: CurrentMember): List<MyArchiveReviewResult>
}

interface GetMyPageSummaryUseCase {
    fun getMyPageSummary(currentMember: CurrentMember): MyPageResult
}
