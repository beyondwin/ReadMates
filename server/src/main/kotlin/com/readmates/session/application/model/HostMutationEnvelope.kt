package com.readmates.session.application.model

import com.readmates.session.application.HostSessionDetailResponse
import com.readmates.session.application.HostSessionFeedbackDocument
import com.readmates.session.domain.PublicSiteVisibility
import com.readmates.session.domain.SessionAccessScope
import com.readmates.sessionrecord.application.model.SessionRecordVisibility
import java.util.UUID

data class HostMutationEnvelope<TCommand, TExpected : Any>(
    val idempotencyKey: String,
    val expected: TExpected,
    val command: TCommand,
)

data class HostMutationReceiptResult(
    val receiptId: String,
    val operation: String,
    val resourceId: String,
    val resultingVersions: SessionVersionVector,
    val notificationDecision: NotificationDecision,
    val projection: HostProjectionSnapshot,
)

data class HostProjectionSnapshot(
    val snapshotId: String,
    val sessionId: String,
    val sessionNumber: Int,
    val title: String,
    val bookTitle: String,
    val bookAuthor: String,
    val date: String,
    val startTime: String,
    val endTime: String,
    val locationLabel: String,
    val state: String,
    val versions: SessionVersionVector,
    val accessScope: SessionAccessScope,
    val siteVisibility: PublicSiteVisibility,
    val visibility: SessionRecordVisibility,
)

data class ExpectedSessionOnly(
    val sessionRevision: Long,
) {
    init {
        require(sessionRevision >= 0) { "sessionRevision must be non-negative" }
    }
}

data class ExpectedAttendanceRows(
    val rows: List<AttendanceVersion>,
    val participantSetRevision: Long? = null,
) {
    init {
        require(rows.isNotEmpty()) { "attendance expected rows must not be empty" }
        require(participantSetRevision == null || participantSetRevision >= 0) {
            "participantSetRevision must be null or non-negative"
        }
    }
}

data class ExpectedCloseRevisions(
    val sessionRevision: Long,
    val participantSetRevision: Long,
    val attendanceSnapshotId: String,
) {
    init {
        require(sessionRevision >= 0) { "sessionRevision must be non-negative" }
        require(participantSetRevision >= 0) { "participantSetRevision must be non-negative" }
        require(attendanceSnapshotId.isNotBlank()) { "attendanceSnapshotId must not be blank" }
    }
}

data class ExpectedExposureRevision(
    val exposureRevision: Long,
) {
    init {
        require(exposureRevision >= 0) { "exposureRevision must be non-negative" }
    }
}

data class ExpectedPublicationRevision(
    val publicationRevision: Long,
) {
    init {
        require(publicationRevision >= 0) { "publicationRevision must be non-negative" }
    }
}

class MutationPendingException : RuntimeException("MUTATION_PENDING")

class HostMutationNotAuthorizedException : RuntimeException("HOST_MUTATION_NOT_AUTHORIZED")

fun HostProjectionSnapshot.toDetail(sessionId: UUID = UUID.fromString(this.sessionId)) =
    HostSessionDetailResponse(
        sessionId = sessionId.toString(),
        sessionNumber = sessionNumber,
        title = title,
        bookTitle = bookTitle,
        bookAuthor = bookAuthor,
        bookLink = null,
        bookImageUrl = null,
        date = date,
        startTime = startTime,
        endTime = endTime,
        questionDeadlineAt = "",
        locationLabel = locationLabel,
        meetingUrl = null,
        meetingPasscode = null,
        publication = null,
        state = state,
        attendees = emptyList(),
        feedbackDocument = HostSessionFeedbackDocument(uploaded = false, fileName = null, uploadedAt = null),
        visibility = visibility,
        accessScope = accessScope,
        siteVisibility = siteVisibility,
    )
