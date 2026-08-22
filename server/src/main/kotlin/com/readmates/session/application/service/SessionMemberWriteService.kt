package com.readmates.session.application.service

import com.readmates.session.application.model.ReplaceQuestionsCommand
import com.readmates.session.application.model.SaveCheckinCommand
import com.readmates.session.application.model.SaveLongReviewCommand
import com.readmates.session.application.model.SaveOneLineReviewCommand
import com.readmates.session.application.model.SaveQuestionCommand
import com.readmates.session.application.model.UpdateRsvpCommand
import com.readmates.session.application.port.`in`.ReplaceQuestionsUseCase
import com.readmates.session.application.port.`in`.SaveCheckinUseCase
import com.readmates.session.application.port.`in`.SaveQuestionUseCase
import com.readmates.session.application.port.`in`.SaveReviewUseCase
import com.readmates.session.application.port.`in`.UpdateRsvpUseCase
import com.readmates.session.application.port.out.SessionParticipationWritePort
import com.readmates.shared.cache.ReadCacheInvalidationPort
import com.readmates.shared.listing.application.model.HostListEpochKind
import com.readmates.shared.listing.application.port.out.HostListEpochPort
import com.readmates.shared.listing.application.port.out.bump
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class SessionMemberWriteService(
    private val writePort: SessionParticipationWritePort,
    private val cacheInvalidation: ReadCacheInvalidationPort = ReadCacheInvalidationPort.Noop(),
    private val epochPort: HostListEpochPort = HostListEpochPort.Noop(),
) : UpdateRsvpUseCase,
    SaveCheckinUseCase,
    SaveQuestionUseCase,
    ReplaceQuestionsUseCase,
    SaveReviewUseCase {
    @Transactional
    override fun updateRsvp(command: UpdateRsvpCommand) =
        writePort.updateRsvp(command).also {
            epochPort.bump(command.member.clubId, HostListEpochKind.MEETING)
        }

    @Transactional
    override fun saveCheckin(command: SaveCheckinCommand) =
        writePort.saveCheckin(command).also {
            epochPort.bump(command.member.clubId, HostListEpochKind.MEETING)
        }

    @Transactional
    override fun saveQuestion(command: SaveQuestionCommand) =
        writePort.saveQuestion(command).also {
            epochPort.bump(command.member.clubId, HostListEpochKind.MEETING)
            cacheInvalidation.evictClubContentAfterCommit(command.member.clubId)
        }

    @Transactional
    override fun replaceQuestions(command: ReplaceQuestionsCommand) =
        writePort.replaceQuestions(command).also {
            epochPort.bump(command.member.clubId, HostListEpochKind.MEETING)
            cacheInvalidation.evictClubContentAfterCommit(command.member.clubId)
        }

    @Transactional
    override fun saveOneLineReview(command: SaveOneLineReviewCommand) =
        writePort.saveOneLineReview(command).also {
            epochPort.bump(command.member.clubId, HostListEpochKind.RECORD)
            cacheInvalidation.evictClubContentAfterCommit(command.member.clubId)
        }

    @Transactional
    override fun saveLongReview(command: SaveLongReviewCommand) =
        writePort.saveLongReview(command).also {
            epochPort.bump(command.member.clubId, HostListEpochKind.RECORD)
            cacheInvalidation.evictClubContentAfterCommit(command.member.clubId)
        }
}
