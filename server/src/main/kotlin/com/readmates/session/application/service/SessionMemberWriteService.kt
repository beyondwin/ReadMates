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
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class SessionMemberWriteService(
    private val writePort: SessionParticipationWritePort,
    private val cacheInvalidation: ReadCacheInvalidationPort = ReadCacheInvalidationPort.Noop(),
) : UpdateRsvpUseCase,
    SaveCheckinUseCase,
    SaveQuestionUseCase,
    ReplaceQuestionsUseCase,
    SaveReviewUseCase {
    @Transactional
    override fun updateRsvp(command: UpdateRsvpCommand) =
        writePort.updateRsvp(command)

    @Transactional
    override fun saveCheckin(command: SaveCheckinCommand) =
        writePort.saveCheckin(command)

    @Transactional
    override fun saveQuestion(command: SaveQuestionCommand) =
        writePort.saveQuestion(command).also { cacheInvalidation.evictClubContentAfterCommit(command.member.clubId) }

    @Transactional
    override fun replaceQuestions(command: ReplaceQuestionsCommand) =
        writePort.replaceQuestions(command).also { cacheInvalidation.evictClubContentAfterCommit(command.member.clubId) }

    @Transactional
    override fun saveOneLineReview(command: SaveOneLineReviewCommand) =
        writePort.saveOneLineReview(command).also { cacheInvalidation.evictClubContentAfterCommit(command.member.clubId) }

    @Transactional
    override fun saveLongReview(command: SaveLongReviewCommand) =
        writePort.saveLongReview(command).also { cacheInvalidation.evictClubContentAfterCommit(command.member.clubId) }
}
