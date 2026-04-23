package com.readmates.archive.application.port.out

import com.readmates.archive.application.model.ArchiveSessionResult
import com.readmates.archive.application.model.MemberArchiveSessionDetailResult
import com.readmates.archive.application.model.MyArchiveQuestionResult
import com.readmates.archive.application.model.MyArchiveReviewResult
import com.readmates.archive.application.model.MyPageResult
import com.readmates.shared.security.CurrentMember
import java.util.UUID

interface LoadArchiveDataPort {
    fun loadArchiveSessions(currentMember: CurrentMember): List<ArchiveSessionResult>

    fun loadArchiveSessionDetail(
        currentMember: CurrentMember,
        sessionId: UUID,
    ): MemberArchiveSessionDetailResult?

    fun loadMyQuestions(currentMember: CurrentMember): List<MyArchiveQuestionResult>

    fun loadMyReviews(currentMember: CurrentMember): List<MyArchiveReviewResult>

    fun loadMyPage(currentMember: CurrentMember): MyPageResult
}
