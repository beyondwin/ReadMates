package com.readmates.session.application.port.`in`

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

interface UpdateRsvpUseCase {
    fun updateRsvp(command: UpdateRsvpCommand): RsvpResult
}

interface SaveCheckinUseCase {
    fun saveCheckin(command: SaveCheckinCommand): CheckinResult
}

interface SaveQuestionUseCase {
    fun saveQuestion(command: SaveQuestionCommand): QuestionResult
}

interface ReplaceQuestionsUseCase {
    fun replaceQuestions(command: ReplaceQuestionsCommand): ReplaceQuestionsResult
}

interface SaveReviewUseCase {
    fun saveOneLineReview(command: SaveOneLineReviewCommand): OneLineReviewResult
    fun saveLongReview(command: SaveLongReviewCommand): LongReviewResult
}
