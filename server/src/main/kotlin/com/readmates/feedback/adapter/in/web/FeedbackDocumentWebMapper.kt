package com.readmates.feedback.adapter.`in`.web

import com.readmates.feedback.application.model.FeedbackDocumentListItemResult
import com.readmates.feedback.application.model.FeedbackDocumentResult
import com.readmates.feedback.application.model.FeedbackDocumentStatusResult
import com.readmates.feedback.application.model.FeedbackMetadataItemResult
import com.readmates.feedback.application.model.FeedbackParticipantResult
import com.readmates.feedback.application.model.FeedbackProblemResult
import com.readmates.feedback.application.model.FeedbackRevealingQuoteResult

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
