package com.readmates.archive.adapter.out.persistence

import com.readmates.archive.application.ArchiveSessionQueryRepository
import com.readmates.archive.application.MyRecordsQueryRepository
import com.readmates.archive.application.port.out.LoadArchiveDataPort
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Component
import java.util.UUID

@Component
class LegacyArchiveQueryAdapter(
    private val archiveSessionQueryRepository: ArchiveSessionQueryRepository,
    private val myRecordsQueryRepository: MyRecordsQueryRepository,
) : LoadArchiveDataPort {
    override fun loadArchiveSessions(currentMember: CurrentMember) =
        archiveSessionQueryRepository.findArchiveSessions(currentMember)

    override fun loadArchiveSessionDetail(
        currentMember: CurrentMember,
        sessionId: UUID,
    ) = archiveSessionQueryRepository.findArchiveSessionDetail(currentMember, sessionId)

    override fun loadMyQuestions(currentMember: CurrentMember) =
        myRecordsQueryRepository.findMyQuestions(currentMember)

    override fun loadMyReviews(currentMember: CurrentMember) =
        myRecordsQueryRepository.findMyReviews(currentMember)

    override fun loadMyPage(currentMember: CurrentMember) =
        myRecordsQueryRepository.findMyPage(currentMember)
}
