package com.readmates.archive.application

import com.readmates.archive.application.model.ArchiveSessionResult
import com.readmates.archive.application.model.MemberArchiveSessionDetailResult
import com.readmates.archive.application.model.MyArchiveQuestionResult
import com.readmates.archive.application.model.MyArchiveReviewResult
import com.readmates.archive.application.model.MyPageResult
import com.readmates.note.api.NoteFeedItem
import com.readmates.note.api.NoteSessionItem
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class ArchiveRepository(
    private val archiveSessionQueryRepository: ArchiveSessionQueryRepository,
    private val myRecordsQueryRepository: MyRecordsQueryRepository,
    private val notesFeedQueryRepository: NotesFeedQueryRepository,
) {
    fun findArchiveSessions(currentMember: CurrentMember): List<ArchiveSessionResult> =
        archiveSessionQueryRepository.findArchiveSessions(currentMember)

    fun findArchiveSessionDetail(
        currentMember: CurrentMember,
        sessionId: UUID,
    ): MemberArchiveSessionDetailResult? =
        archiveSessionQueryRepository.findArchiveSessionDetail(currentMember, sessionId)

    fun findMyQuestions(currentMember: CurrentMember): List<MyArchiveQuestionResult> =
        myRecordsQueryRepository.findMyQuestions(currentMember)

    fun findMyReviews(currentMember: CurrentMember): List<MyArchiveReviewResult> =
        myRecordsQueryRepository.findMyReviews(currentMember)

    fun findMyPage(currentMember: CurrentMember): MyPageResult =
        myRecordsQueryRepository.findMyPage(currentMember)

    fun findNoteSessions(clubId: UUID): List<NoteSessionItem> =
        notesFeedQueryRepository.findNoteSessions(clubId)

    fun findNotesFeed(clubId: UUID): List<NoteFeedItem> =
        notesFeedQueryRepository.findNotesFeed(clubId)

    fun findNotesFeedForSession(clubId: UUID, sessionId: UUID): List<NoteFeedItem> =
        notesFeedQueryRepository.findNotesFeedForSession(clubId, sessionId)
}
