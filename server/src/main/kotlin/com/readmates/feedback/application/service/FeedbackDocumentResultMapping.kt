package com.readmates.feedback.application.service

import com.readmates.feedback.application.FeedbackGroupFeedback
import com.readmates.feedback.application.FeedbackGroupPoint
import com.readmates.feedback.application.FeedbackHighlight
import com.readmates.feedback.application.FeedbackParticipant
import com.readmates.feedback.application.FeedbackTrend
import com.readmates.feedback.application.model.FeedbackAttendancePointResult
import com.readmates.feedback.application.model.FeedbackGroupFeedbackResult
import com.readmates.feedback.application.model.FeedbackGroupPointResult
import com.readmates.feedback.application.model.FeedbackHighlightLineResult
import com.readmates.feedback.application.model.FeedbackHighlightResult
import com.readmates.feedback.application.model.FeedbackJourneyStepResult
import com.readmates.feedback.application.model.FeedbackParticipantResult
import com.readmates.feedback.application.model.FeedbackProblemResult
import com.readmates.feedback.application.model.FeedbackRepeatedTaskResult
import com.readmates.feedback.application.model.FeedbackRevealingQuoteResult
import com.readmates.feedback.application.model.FeedbackSessionQuoteResult
import com.readmates.feedback.application.model.FeedbackSpeakingShareResult
import com.readmates.feedback.application.model.FeedbackTrendPhaseResult
import com.readmates.feedback.application.model.FeedbackTrendResult

internal fun FeedbackParticipant.toResult(): FeedbackParticipantResult =
    FeedbackParticipantResult(
        number = number,
        name = name,
        role = role,
        style = styleParagraphs,
        contributions = contributionBullets,
        problems =
            problems.map { problem ->
                FeedbackProblemResult(
                    title = problem.title,
                    core = problem.core,
                    evidence = problem.evidence,
                    interpretation = problem.interpretation,
                )
            },
        actionItems = actionItems,
        revealingQuote =
            FeedbackRevealingQuoteResult(
                quote = revealingQuote.quote,
                context = revealingQuote.context,
                note = revealingQuote.note,
            ),
        badges = badges,
        journey = journey.map { FeedbackJourneyStepResult(label = it.label, text = it.text) },
        achievements = achievements,
        baseline = baseline,
        sessionQuotes = sessionQuotes.map { FeedbackSessionQuoteResult(time = it.time, quote = it.quote, note = it.note) },
    )

internal fun FeedbackHighlight.toResult(): FeedbackHighlightResult =
    FeedbackHighlightResult(
        title = title,
        lines = lines.map { FeedbackHighlightLineResult(speaker = it.speaker, time = it.time, text = it.text) },
        why = why,
    )

internal fun FeedbackGroupFeedback.toResult(): FeedbackGroupFeedbackResult =
    FeedbackGroupFeedbackResult(
        strengths = strengths.map { it.toResult() },
        improvements = improvements.map { it.toResult() },
        speakingShares = speakingShares.map { FeedbackSpeakingShareResult(name = it.name, percent = it.percent) },
        speakingNote = speakingNote,
        nextSteps = nextSteps,
    )

private fun FeedbackGroupPoint.toResult(): FeedbackGroupPointResult =
    FeedbackGroupPointResult(title = title, evidence = evidence, interpretation = interpretation)

internal fun FeedbackTrend.toResult(): FeedbackTrendResult =
    FeedbackTrendResult(
        attendance = attendance.map { FeedbackAttendancePointResult(label = it.label, count = it.count) },
        phases = phases.map { FeedbackTrendPhaseResult(label = it.label, text = it.text) },
        repeatedTasks = repeatedTasks.map { FeedbackRepeatedTaskResult(task = it.task, detail = it.detail, status = it.status) },
    )
