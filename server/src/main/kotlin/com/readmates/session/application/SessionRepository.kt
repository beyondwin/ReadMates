package com.readmates.session.application

import com.fasterxml.jackson.annotation.JsonProperty
import com.readmates.session.domain.SessionParticipationStatus
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.springframework.beans.factory.ObjectProvider
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.web.bind.annotation.ResponseStatus
import java.util.UUID

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
    val note: String,
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
    val checkins: List<BoardCheckin>,
    val highlights: List<BoardHighlight>,
)

data class BoardCheckin(
    val authorName: String,
    val authorShortName: String,
    val readingProgress: Int,
    val note: String,
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

@Repository
class SessionRepository(
    private val currentSessionRepository: CurrentSessionRepository,
    private val sessionParticipationRepository: SessionParticipationRepository,
) {
    fun findCurrentSession(member: CurrentMember): CurrentSessionPayload =
        currentSessionRepository.findCurrentSession(member)

    fun updateRsvp(member: CurrentMember, status: String): Map<String, String> =
        sessionParticipationRepository.updateRsvp(member, status)

    fun saveCheckin(member: CurrentMember, readingProgress: Int, note: String): Map<String, Any> =
        sessionParticipationRepository.saveCheckin(member, readingProgress, note)

    fun saveQuestion(member: CurrentMember, priority: Int, text: String, draftThought: String?): Map<String, Any?> =
        sessionParticipationRepository.saveQuestion(member, priority, text, draftThought)

    fun replaceQuestions(member: CurrentMember, texts: List<String>): Map<String, Any> =
        sessionParticipationRepository.replaceQuestions(member, texts)

    fun saveOneLineReview(member: CurrentMember, text: String): Map<String, String> =
        sessionParticipationRepository.saveOneLineReview(member, text)

    fun saveLongReview(member: CurrentMember, body: String): Map<String, String> =
        sessionParticipationRepository.saveLongReview(member, body)

    fun findOpenSessionId(clubId: UUID): UUID =
        currentSessionRepository.findOpenSessionId(clubId)
}

internal fun jdbcTemplateOrThrow(jdbcTemplateProvider: ObjectProvider<JdbcTemplate>): JdbcTemplate =
    jdbcTemplateProvider.ifAvailable ?: throw CurrentSessionNotOpenException()

internal fun requireHost(member: CurrentMember) {
    if (!member.isHost) {
        throw AccessDeniedException("Host role required")
    }
}

internal fun shortNameFor(displayName: String): String = when (displayName) {
    "김호스트" -> "호스트"
    "안멤버1" -> "멤버1"
    "최멤버2" -> "멤버2"
    "김멤버3" -> "멤버3"
    "송멤버4" -> "멤버4"
    "이멤버5" -> "멤버5"
    else -> displayName
}

@ResponseStatus(HttpStatus.CONFLICT)
class CurrentSessionNotOpenException : RuntimeException("No open current session")

@ResponseStatus(HttpStatus.CONFLICT)
class OpenSessionAlreadyExistsException : RuntimeException("Open session already exists")

@ResponseStatus(HttpStatus.NOT_FOUND)
class HostSessionNotFoundException : RuntimeException("Host session not found")

@ResponseStatus(HttpStatus.NOT_FOUND)
class HostSessionParticipantNotFoundException : RuntimeException("Host session participant not found")

@ResponseStatus(HttpStatus.CONFLICT)
class HostSessionDeletionNotAllowedException : RuntimeException("Only open sessions can be deleted")

@ResponseStatus(HttpStatus.BAD_REQUEST)
class InvalidMembershipIdException : RuntimeException("Invalid membership id")

@ResponseStatus(HttpStatus.BAD_REQUEST)
class InvalidSessionScheduleException : RuntimeException("Session end time must be after start time")

@ResponseStatus(HttpStatus.BAD_REQUEST)
class InvalidQuestionSetException : RuntimeException("Questions must include 2 to 5 non-empty items")
