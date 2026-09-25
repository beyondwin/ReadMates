package com.readmates.feedback.adapter.`in`.web

import com.readmates.feedback.application.model.FeedbackDocumentListItemResult
import com.readmates.feedback.application.model.FeedbackDocumentResult
import com.readmates.feedback.application.model.FeedbackDocumentStatusResult
import com.readmates.feedback.application.model.FeedbackGroupFeedbackResult
import com.readmates.feedback.application.model.FeedbackGroupPointResult
import com.readmates.feedback.application.model.FeedbackMetadataItemResult
import com.readmates.feedback.application.model.FeedbackParticipantResult
import com.readmates.feedback.application.model.FeedbackProblemResult
import com.readmates.feedback.application.model.FeedbackRevealingQuoteResult
import com.readmates.feedback.application.model.FeedbackTrendResult
import com.readmates.shared.paging.CursorPage

fun CursorPage<FeedbackDocumentListItemResult>.toWebDto(): FeedbackDocumentListPage =
    FeedbackDocumentListPage(
        items = items.map { it.toWebDto() },
        nextCursor = nextCursor,
    )

fun FeedbackDocumentListItemResult.toWebDto(): FeedbackDocumentListItem =
    FeedbackDocumentListItem(
        sessionId = sessionId,
        sessionNumber = sessionNumber,
        title = title,
        bookTitle = bookTitle,
        date = date,
        fileName = fileName,
        uploadedAt = uploadedAt,
    )

fun FeedbackDocumentResult.toWebDto(): FeedbackDocumentResponse =
    FeedbackDocumentResponse(
        sessionId = sessionId,
        sessionNumber = sessionNumber,
        title = title,
        subtitle = subtitle,
        bookTitle = bookTitle,
        date = date,
        fileName = fileName,
        uploadedAt = uploadedAt,
        metadata = metadata.map { it.toWebDto() },
        observerNotes = observerNotes,
        participants = participants.map { it.toWebDto() },
        templateVersion = templateVersion,
        overview = overview.map { it.toWebDto() },
        highlights =
            highlights.map { highlight ->
                FeedbackHighlight(
                    title = highlight.title,
                    lines = highlight.lines.map { FeedbackHighlightLine(speaker = it.speaker, time = it.time, text = it.text) },
                    why = highlight.why,
                )
            },
        groupFeedback = groupFeedback?.toWebDto(),
        trend = trend?.toWebDto(),
        followUpQuestions = followUpQuestions,
    )

fun FeedbackDocumentStatusResult.toWebDto(): FeedbackDocumentStatus =
    FeedbackDocumentStatus(
        uploaded = uploaded,
        fileName = fileName,
        uploadedAt = uploadedAt,
    )

private fun FeedbackMetadataItemResult.toWebDto(): FeedbackMetadataItem =
    FeedbackMetadataItem(
        label = label,
        value = value,
    )

private fun FeedbackParticipantResult.toWebDto(): FeedbackParticipant =
    FeedbackParticipant(
        number = number,
        name = name,
        role = role,
        style = style,
        contributions = contributions,
        problems = problems.map { it.toWebDto() },
        actionItems = actionItems,
        revealingQuote = revealingQuote.toWebDto(),
        badges = badges,
        journey = journey.map { FeedbackJourneyStep(label = it.label, text = it.text) },
        achievements = achievements,
        baseline = baseline,
        sessionQuotes = sessionQuotes.map { FeedbackSessionQuote(time = it.time, quote = it.quote, note = it.note) },
    )

private fun FeedbackGroupFeedbackResult.toWebDto(): FeedbackGroupFeedback =
    FeedbackGroupFeedback(
        strengths = strengths.map { it.toWebDto() },
        improvements = improvements.map { it.toWebDto() },
        speakingShares = speakingShares.map { FeedbackSpeakingShare(name = it.name, percent = it.percent) },
        speakingNote = speakingNote,
        nextSteps = nextSteps,
    )

private fun FeedbackGroupPointResult.toWebDto(): FeedbackGroupPoint =
    FeedbackGroupPoint(title = title, evidence = evidence, interpretation = interpretation)

private fun FeedbackTrendResult.toWebDto(): FeedbackTrend =
    FeedbackTrend(
        attendance = attendance.map { FeedbackAttendancePoint(label = it.label, count = it.count) },
        phases = phases.map { FeedbackTrendPhase(label = it.label, text = it.text) },
        repeatedTasks = repeatedTasks.map { FeedbackRepeatedTask(task = it.task, detail = it.detail, status = it.status) },
    )

private fun FeedbackProblemResult.toWebDto(): FeedbackProblem =
    FeedbackProblem(
        title = title,
        core = core,
        evidence = evidence,
        interpretation = interpretation,
    )

private fun FeedbackRevealingQuoteResult.toWebDto(): FeedbackRevealingQuote =
    FeedbackRevealingQuote(
        quote = quote,
        context = context,
        note = note,
    )
