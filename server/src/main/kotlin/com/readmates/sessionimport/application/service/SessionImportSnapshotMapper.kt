package com.readmates.sessionimport.application.service

import com.readmates.sessionimport.application.model.SessionImportCommand
import com.readmates.sessionimport.application.model.SessionImportPreviewResult
import com.readmates.sessionimport.application.model.SessionImportRecordPreview
import com.readmates.sessionrecord.application.model.SessionRecordEntry
import com.readmates.sessionrecord.application.model.SessionRecordFeedbackDocument
import com.readmates.sessionrecord.application.model.SessionRecordSnapshot
import java.util.UUID

internal fun SessionImportCommand.toCanonicalSnapshot(preview: SessionImportPreviewResult) =
    SessionRecordSnapshot(
        visibility = recordVisibility,
        publicationSummary = preview.publication.summary,
        highlights = preview.highlights.map(::toCanonicalEntry),
        oneLineReviews = preview.oneLineReviews.map(::toCanonicalEntry),
        feedbackDocument =
            SessionRecordFeedbackDocument(
                fileName = feedbackDocument.fileName.trim(),
                title = requireNotNull(preview.feedbackDocument.title),
                markdown = feedbackDocument.markdown,
            ),
    )

private fun toCanonicalEntry(record: SessionImportRecordPreview) =
    SessionRecordEntry(
        membershipId = UUID.fromString(requireNotNull(record.membershipId)),
        authorDisplayName = record.authorName,
        text = record.text,
    )
