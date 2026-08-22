package com.readmates.session.application.model

import java.time.Instant
import java.util.UUID

data class SessionVersionVector(
    val sessionRevision: Long,
    val exposureRevision: Long,
    val participantSetRevision: Long,
    val recordDraftRevision: Long?,
    val liveRecordRevision: Long?,
    val publicationRevision: Long,
) {
    init {
        require(sessionRevision >= 0) { "sessionRevision must be non-negative" }
        require(exposureRevision >= 0) { "exposureRevision must be non-negative" }
        require(participantSetRevision >= 0) { "participantSetRevision must be non-negative" }
        require(recordDraftRevision == null || recordDraftRevision > 0) {
            "recordDraftRevision must be null or positive"
        }
        require(liveRecordRevision == null || liveRecordRevision > 0) {
            "liveRecordRevision must be null or positive"
        }
        require(publicationRevision >= 0) { "publicationRevision must be non-negative" }
    }

    fun snapshotIdentity(resourceId: UUID): ProjectionSnapshotIdentity =
        ProjectionSnapshotIdentity.from(
            resourceId,
            this,
        )

    companion object {
        val INITIAL =
            SessionVersionVector(
                sessionRevision = 0,
                exposureRevision = 0,
                participantSetRevision = 0,
                recordDraftRevision = null,
                liveRecordRevision = null,
                publicationRevision = 0,
            )
    }
}

data class PublicationVersionVector(
    val sessionRevision: Long,
    val liveRecordRevision: Long,
    val exposureRevision: Long,
    val publicationRevision: Long,
) {
    init {
        require(sessionRevision >= 0) { "sessionRevision must be non-negative" }
        require(liveRecordRevision >= 0) { "liveRecordRevision must be non-negative" }
        require(exposureRevision >= 0) { "exposureRevision must be non-negative" }
        require(publicationRevision >= 0) { "publicationRevision must be non-negative" }
    }
}

data class CorrectionPublicationVersionVector(
    val sessionRevision: Long,
    val recordDraftRevision: Long,
    val liveRecordRevision: Long,
    val exposureRevision: Long,
    val publicationRevision: Long,
) {
    init {
        require(sessionRevision >= 0) { "sessionRevision must be non-negative" }
        require(recordDraftRevision > 0) { "recordDraftRevision must be positive" }
        require(liveRecordRevision >= 0) { "liveRecordRevision must be non-negative" }
        require(exposureRevision >= 0) { "exposureRevision must be non-negative" }
        require(publicationRevision >= 0) { "publicationRevision must be non-negative" }
    }
}

data class ExpectedSessionRevision(
    val value: Long,
) {
    init {
        require(value >= 0) { "expectedSessionRevision must be non-negative" }
    }
}

data class RevisionConflictResult(
    val code: String = "REVISION_CONFLICT",
    val current: SessionVersionVector,
    val changedAt: Instant?,
    val changedByDisplay: String?,
)

data class AttendanceVersion(
    val membershipId: UUID,
    val attendanceRevision: Long,
) {
    init {
        require(attendanceRevision >= 0) { "attendanceRevision must be non-negative" }
    }
}

data class ProjectionSnapshotIdentity(
    val snapshotId: String,
) {
    init {
        require(snapshotId.isNotBlank()) { "snapshotId must not be blank" }
    }

    companion object {
        fun from(
            resourceId: UUID,
            versions: SessionVersionVector,
        ): ProjectionSnapshotIdentity {
            val draftToken = versions.recordDraftRevision?.toString() ?: "-"
            val liveToken = versions.liveRecordRevision?.toString() ?: "-"
            return ProjectionSnapshotIdentity(
                snapshotId =
                    "$resourceId:${versions.sessionRevision}:${versions.exposureRevision}:" +
                        "${versions.participantSetRevision}:$draftToken:$liveToken:${versions.publicationRevision}",
            )
        }
    }
}
