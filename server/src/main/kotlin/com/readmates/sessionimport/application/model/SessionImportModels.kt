package com.readmates.sessionimport.application.model

import com.readmates.session.application.SessionRecordVisibility
import com.readmates.shared.security.AuthenticatedClubActor
import java.time.LocalDate
import java.util.UUID

const val SESSION_IMPORT_FORMAT = "readmates-session-import:v1"

data class SessionImportCommand(
    val host: AuthenticatedClubActor,
    val sessionId: UUID,
    val recordVisibility: SessionRecordVisibility,
    val format: String,
    val session: SessionImportSessionCommand,
    val publication: SessionImportPublicationCommand,
    val highlights: List<SessionImportRecordCommand>,
    val oneLineReviews: List<SessionImportRecordCommand>,
    val feedbackDocument: SessionImportFeedbackDocumentCommand,
    val expectedDraftRevision: Long? = null,
)

data class SessionImportSessionCommand(
    val number: Int,
    val bookTitle: String,
    val meetingDate: LocalDate,
)

data class SessionImportPublicationCommand(
    val summary: String,
)

data class SessionImportRecordCommand(
    val authorName: String,
    val text: String,
)

data class SessionImportFeedbackDocumentCommand(
    val fileName: String,
    val markdown: String,
)

data class SessionImportTarget(
    val sessionId: UUID,
    val clubId: UUID,
    val sessionNumber: Int,
    val bookTitle: String,
    val meetingDate: LocalDate,
    val attendees: List<SessionImportAttendee>,
)

data class SessionImportAttendee(
    val membershipId: UUID,
    val displayName: String,
    val active: Boolean,
)

data class SessionImportIssue(
    val code: String,
    val message: String,
)

data class SessionImportPreviewResult(
    val valid: Boolean,
    val session: SessionImportSessionPreview,
    val publication: SessionImportPublicationPreview,
    val highlights: List<SessionImportRecordPreview>,
    val oneLineReviews: List<SessionImportRecordPreview>,
    val feedbackDocument: SessionImportFeedbackDocumentPreview,
    val issues: List<SessionImportIssue>,
)

data class SessionImportSessionPreview(
    val sessionNumber: Int?,
    val bookTitle: String?,
    val meetingDate: String?,
)

data class SessionImportPublicationPreview(
    val summary: String,
)

data class SessionImportRecordPreview(
    val authorName: String,
    val text: String,
    val authorMatched: Boolean,
    val membershipId: String?,
)

data class SessionImportFeedbackDocumentPreview(
    val fileName: String,
    val title: String?,
    val valid: Boolean,
)

data class SessionImportCommitResult(
    val sessionId: String,
    val publication: SessionImportPublicationPreview,
    val highlights: List<SessionImportRecordPreview>,
    val oneLineReviews: List<SessionImportRecordPreview>,
    val feedbackDocument: SessionImportCommittedFeedbackDocument,
)

data class SessionImportDraftResult(
    val sessionId: String,
    val draftRevision: Long,
    val baseLiveRevision: Long,
    val liveApplied: Boolean = false,
)

data class SessionImportCommittedFeedbackDocument(
    val uploaded: Boolean,
    val fileName: String,
    val title: String,
    val uploadedAt: String?,
)
