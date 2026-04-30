package com.readmates.archive.application.port.out

import com.readmates.archive.application.model.ArchiveSessionResult
import com.readmates.archive.application.model.MemberArchiveSessionDetailResult
import com.readmates.archive.application.model.MyArchiveQuestionResult
import com.readmates.archive.application.model.MyArchiveReviewResult
import com.readmates.archive.application.model.MyPageResult
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import java.util.UUID

interface LoadArchiveDataPort {
    fun loadArchiveSessions(currentMember: CurrentMember, pageRequest: PageRequest): CursorPage<ArchiveSessionResult>

    fun loadArchiveSessionDetail(
        currentMember: CurrentMember,
        sessionId: UUID,
    ): MemberArchiveSessionDetailResult?

    fun loadMyQuestions(currentMember: CurrentMember, pageRequest: PageRequest): CursorPage<MyArchiveQuestionResult>

    fun loadMyReviews(currentMember: CurrentMember, pageRequest: PageRequest): CursorPage<MyArchiveReviewResult>

    fun loadMyPage(currentMember: CurrentMember): MyPageResult
}
