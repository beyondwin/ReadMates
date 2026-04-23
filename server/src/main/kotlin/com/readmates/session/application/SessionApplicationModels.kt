package com.readmates.session.application

import com.fasterxml.jackson.annotation.JsonProperty
import com.readmates.session.domain.SessionParticipationStatus

data class CurrentSessionPayload(
    val currentSession: CurrentSessionDetail?,
)

data class CurrentSessionDetail(
    val sessionId: String,
    val sessionNumber: Int,
    val title: String,
    val bookTitle: String,
    val bookAuthor: String,
    val bookLink: String?,
    val bookImageUrl: String?,
    val date: String,
    val startTime: String,
    val endTime: String,
    val locationLabel: String,
    val meetingUrl: String?,
    val meetingPasscode: String?,
    val questionDeadlineAt: String,
    val myRsvpStatus: String,
    val attendees: List<SessionAttendee>,
    val myCheckin: CurrentSessionCheckin?,
    val myQuestions: List<CurrentSessionQuestion>,
    val myOneLineReview: CurrentSessionOneLineReview?,
    val myLongReview: CurrentSessionLongReview?,
    val board: CurrentSessionBoard,
)

data class SessionAttendee(
    val membershipId: String,
    val displayName: String,
    val shortName: String,
    val role: String,
    val rsvpStatus: String,
    val attendanceStatus: String,
)

data class CurrentSessionCheckin(
    val readingProgress: Int,
)

data class CurrentSessionQuestion(
    val priority: Int,
    val text: String,
    val draftThought: String?,
    val authorName: String,
    val authorShortName: String,
)

data class CurrentSessionOneLineReview(
    val text: String,
)

data class CurrentSessionLongReview(
    val body: String,
)

data class CurrentSessionBoard(
    val questions: List<CurrentSessionQuestion>,
    val oneLineReviews: List<BoardOneLineReview>,
    val highlights: List<BoardHighlight>,
)

data class BoardOneLineReview(
    val authorName: String,
    val authorShortName: String,
    val text: String,
)

data class BoardHighlight(
    val text: String,
    val sortOrder: Int,
)

data class CreatedSessionResponse(
    val sessionId: String,
    val sessionNumber: Int,
    val title: String,
    val bookTitle: String,
    val bookAuthor: String,
    val bookLink: String?,
    val bookImageUrl: String?,
    val date: String,
    val startTime: String,
    val endTime: String,
    val questionDeadlineAt: String,
    val locationLabel: String,
    val meetingUrl: String?,
    val meetingPasscode: String?,
    val state: String,
)

data class HostSessionDetailResponse(
    val sessionId: String,
    val sessionNumber: Int,
    val title: String,
    val bookTitle: String,
    val bookAuthor: String,
    val bookLink: String?,
    val bookImageUrl: String?,
    val date: String,
    val startTime: String,
    val endTime: String,
    val questionDeadlineAt: String,
    val locationLabel: String,
    val meetingUrl: String?,
    val meetingPasscode: String?,
    val publication: HostSessionPublication?,
    val state: String,
    val attendees: List<HostSessionAttendee>,
    val feedbackDocument: HostSessionFeedbackDocument,
)

data class HostSessionAttendee(
    val membershipId: String,
    val displayName: String,
    val shortName: String,
    val rsvpStatus: String,
    val attendanceStatus: String,
    val participationStatus: SessionParticipationStatus = SessionParticipationStatus.ACTIVE,
)

data class HostSessionFeedbackDocument(
    val uploaded: Boolean,
    val fileName: String?,
    val uploadedAt: String?,
)

data class HostSessionPublication(
    val publicSummary: String,
    @get:JsonProperty("isPublic")
    val isPublic: Boolean,
)

data class HostSessionDeletionPreviewResponse(
    val sessionId: String,
    val sessionNumber: Int,
    val title: String,
    val state: String,
    val canDelete: Boolean,
    val counts: HostSessionDeletionCounts,
)

data class HostSessionDeletionResponse(
    val sessionId: String,
    val sessionNumber: Int,
    val deleted: Boolean,
    val counts: HostSessionDeletionCounts,
)

data class HostSessionDeletionCounts(
    val participants: Int,
    val rsvpResponses: Int,
    val questions: Int,
    val checkins: Int,
    val oneLineReviews: Int,
    val longReviews: Int,
    val highlights: Int,
    val publications: Int,
    val feedbackReports: Int,
    val feedbackDocuments: Int,
)

data class HostAttendanceResponse(
    val sessionId: String,
    val count: Int,
)

data class HostPublicationResponse(
    val sessionId: String,
    val publicSummary: String,
    @get:JsonProperty("isPublic")
    val isPublic: Boolean,
    val published: Boolean = isPublic,
)
