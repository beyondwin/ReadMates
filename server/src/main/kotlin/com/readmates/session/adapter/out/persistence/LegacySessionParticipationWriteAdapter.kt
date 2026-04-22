package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.SessionParticipationRepository
import com.readmates.session.application.model.CheckinResult
import com.readmates.session.application.model.LongReviewResult
import com.readmates.session.application.model.OneLineReviewResult
import com.readmates.session.application.model.QuestionResult
import com.readmates.session.application.model.ReplaceQuestionsCommand
import com.readmates.session.application.model.ReplaceQuestionsResult
import com.readmates.session.application.model.RsvpResult
import com.readmates.session.application.model.SaveCheckinCommand
import com.readmates.session.application.model.SaveLongReviewCommand
import com.readmates.session.application.model.SaveOneLineReviewCommand
import com.readmates.session.application.model.SaveQuestionCommand
import com.readmates.session.application.model.UpdateRsvpCommand
import com.readmates.session.application.port.out.SessionParticipationWritePort
import org.springframework.stereotype.Component

// Temporary bridge for this vertical slice; remove in Phase 7 cleanup after session participation
// persistence is moved fully into adapters.
@Component
class LegacySessionParticipationWriteAdapter(
    private val repository: SessionParticipationRepository,
) : SessionParticipationWritePort {
    override fun updateRsvp(command: UpdateRsvpCommand): RsvpResult {
        val result = repository.updateRsvp(command.member, command.status)
        return RsvpResult(status = result.getValue("status"))
    }

    override fun saveCheckin(command: SaveCheckinCommand): CheckinResult {
        val result = repository.saveCheckin(command.member, command.readingProgress, command.note)
        return CheckinResult(
            readingProgress = result.getValue("readingProgress") as Int,
            note = result.getValue("note") as String,
        )
    }

    override fun saveQuestion(command: SaveQuestionCommand): QuestionResult {
        val result = repository.saveQuestion(command.member, command.priority, command.text, command.draftThought)
        return QuestionResult(
            priority = result.getValue("priority") as Int,
            text = result.getValue("text") as String,
            draftThought = result["draftThought"] as String?,
        )
    }

    override fun replaceQuestions(command: ReplaceQuestionsCommand): ReplaceQuestionsResult {
        repository.replaceQuestions(command.member, command.texts)
        return ReplaceQuestionsResult(
            questions = command.texts.mapIndexed { index, text ->
                QuestionResult(priority = index + 1, text = text.trim(), draftThought = null)
            },
        )
    }

    override fun saveOneLineReview(command: SaveOneLineReviewCommand): OneLineReviewResult {
        val result = repository.saveOneLineReview(command.member, command.text)
        return OneLineReviewResult(text = result.getValue("text"))
    }

    override fun saveLongReview(command: SaveLongReviewCommand): LongReviewResult {
        val result = repository.saveLongReview(command.member, command.body)
        return LongReviewResult(body = result.getValue("body"))
    }
}
