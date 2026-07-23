package com.readmates.sessionimport.adapter.`in`.web

import com.readmates.session.application.SessionRecordVisibility
import com.readmates.sessionimport.application.model.SessionImportCommand
import com.readmates.sessionimport.application.model.SessionImportDraftResult
import com.readmates.sessionimport.application.model.SessionImportFeedbackDocumentCommand
import com.readmates.sessionimport.application.model.SessionImportPublicationCommand
import com.readmates.sessionimport.application.model.SessionImportRecordCommand
import com.readmates.sessionimport.application.model.SessionImportSessionCommand
import com.readmates.shared.security.CurrentMember
import java.time.LocalDate
import java.util.UUID

data class SessionImportRequest(
    val recordVisibility: SessionRecordVisibility,
    val format: String,
    val session: SessionImportSessionRequest,
    val publication: SessionImportPublicationRequest,
    val highlights: List<SessionImportRecordRequest> = emptyList(),
    val oneLineReviews: List<SessionImportRecordRequest> = emptyList(),
    val feedbackDocument: SessionImportFeedbackDocumentRequest,
    val expectedDraftRevision: Long? = null,
) {
    fun toCommand(
        host: CurrentMember,
        sessionId: UUID,
    ) = SessionImportCommand(
        host = host,
        sessionId = sessionId,
        recordVisibility = recordVisibility,
        format = format,
        session = SessionImportSessionCommand(session.number, session.bookTitle, LocalDate.parse(session.meetingDate)),
        publication = SessionImportPublicationCommand(publication.summary),
        highlights = highlights.map { SessionImportRecordCommand(it.authorName, it.text) },
        oneLineReviews = oneLineReviews.map { SessionImportRecordCommand(it.authorName, it.text) },
        feedbackDocument = SessionImportFeedbackDocumentCommand(feedbackDocument.fileName, feedbackDocument.markdown),
        expectedDraftRevision = expectedDraftRevision,
    )
}

data class SessionImportSessionRequest(
    val number: Int,
    val bookTitle: String,
    val meetingDate: String,
)

data class SessionImportPublicationRequest(
    val summary: String,
)

data class SessionImportRecordRequest(
    val authorName: String,
    val text: String,
)

data class SessionImportFeedbackDocumentRequest(
    val fileName: String,
    val markdown: String,
)

data class SessionImportDraftResponse(
    val sessionId: String,
    val draftRevision: Long,
    val baseLiveRevision: Long,
    val liveApplied: Boolean,
)

fun SessionImportDraftResult.toResponse() =
    SessionImportDraftResponse(
        sessionId = sessionId,
        draftRevision = draftRevision,
        baseLiveRevision = baseLiveRevision,
        liveApplied = liveApplied,
    )
