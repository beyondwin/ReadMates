package com.readmates.session.application.port.out

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

interface SessionParticipationWritePort {
    fun updateRsvp(command: UpdateRsvpCommand): RsvpResult
    fun saveCheckin(command: SaveCheckinCommand): CheckinResult
    fun saveQuestion(command: SaveQuestionCommand): QuestionResult
    fun replaceQuestions(command: ReplaceQuestionsCommand): ReplaceQuestionsResult
    fun saveOneLineReview(command: SaveOneLineReviewCommand): OneLineReviewResult
    fun saveLongReview(command: SaveLongReviewCommand): LongReviewResult
}
