package com.readmates.archive.application

import com.readmates.archive.api.ArchiveSessionItem
import com.readmates.archive.api.MemberArchiveSessionDetailResponse
import com.readmates.archive.api.MyArchiveQuestionItem
import com.readmates.archive.api.MyArchiveReviewItem
import com.readmates.archive.api.MyPageResponse
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
    fun findArchiveSessions(clubId: UUID): List<ArchiveSessionItem> =
        archiveSessionQueryRepository.findArchiveSessions(clubId)

    fun findArchiveSessionDetail(
        currentMember: CurrentMember,
        sessionId: UUID,
    ): MemberArchiveSessionDetailResponse? =
        archiveSessionQueryRepository.findArchiveSessionDetail(currentMember, sessionId)

    fun findMyQuestions(currentMember: CurrentMember): List<MyArchiveQuestionItem> =
        myRecordsQueryRepository.findMyQuestions(currentMember)

    fun findMyReviews(currentMember: CurrentMember): List<MyArchiveReviewItem> =
        myRecordsQueryRepository.findMyReviews(currentMember)

    fun findMyPage(currentMember: CurrentMember): MyPageResponse =
        myRecordsQueryRepository.findMyPage(currentMember)

    fun findNoteSessions(clubId: UUID): List<NoteSessionItem> =
        notesFeedQueryRepository.findNoteSessions(clubId)

    fun findNotesFeed(clubId: UUID): List<NoteFeedItem> =
        notesFeedQueryRepository.findNotesFeed(clubId)

    fun findNotesFeedForSession(clubId: UUID, sessionId: UUID): List<NoteFeedItem> =
        notesFeedQueryRepository.findNotesFeedForSession(clubId, sessionId)
}
