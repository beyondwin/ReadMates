package com.readmates.archive.adapter.out.persistence

import com.readmates.archive.application.model.ArchiveSessionDetailHeader
import com.readmates.archive.application.model.ArchiveSessionResult
import com.readmates.archive.application.model.MyArchiveQuestionResult
import com.readmates.archive.application.model.MyArchiveReviewResult
import com.readmates.archive.application.model.MyPageResult
import com.readmates.archive.application.port.out.LoadArchiveDataPort
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class JdbcArchiveQueryAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : LoadArchiveDataPort {
    private val detailQueries = ArchiveDetailQueries()
    private val listQueries = ArchiveListQueries()

    override fun loadArchiveSessions(
        currentMember: CurrentMember,
        pageRequest: PageRequest,
    ): CursorPage<ArchiveSessionResult> {
        return listQueries.loadArchiveSessions(jdbcTemplate, currentMember, pageRequest)
    }

    override fun loadArchiveSessionDetail(
        currentMember: CurrentMember,
        sessionId: UUID,
    ): ArchiveSessionDetailHeader? {
        return detailQueries.loadArchiveSessionDetail(jdbcTemplate, currentMember, sessionId)
    }

    override fun loadMyQuestions(
        currentMember: CurrentMember,
        pageRequest: PageRequest,
    ): CursorPage<MyArchiveQuestionResult> {
        return listQueries.loadMyQuestions(jdbcTemplate, currentMember, pageRequest)
    }

    override fun loadMyReviews(
        currentMember: CurrentMember,
        pageRequest: PageRequest,
    ): CursorPage<MyArchiveReviewResult> {
        return listQueries.loadMyReviews(jdbcTemplate, currentMember, pageRequest)
    }

    override fun loadMyPage(currentMember: CurrentMember): MyPageResult {
        return listQueries.loadMyPage(jdbcTemplate, currentMember)
    }
}
