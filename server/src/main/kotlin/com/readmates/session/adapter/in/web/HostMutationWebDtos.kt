@file:Suppress("ktlint:standard:package-name")

package com.readmates.session.adapter.`in`.web

import com.fasterxml.jackson.annotation.JsonAnySetter
import com.readmates.session.application.InvalidSessionScheduleException
import com.readmates.session.application.model.AttendanceVersion
import com.readmates.session.application.model.ExpectedCloseRevisions
import com.readmates.session.application.model.ExpectedExposureRevision
import com.readmates.session.application.model.ExpectedPublicationRevision
import com.readmates.session.application.model.ExpectedSessionOnly
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotEmpty
import jakarta.validation.constraints.NotNull
import java.util.UUID

class HostCreateExpectedBody {
    @JsonAnySetter
    fun rejectUnknown(
        name: String,
        @Suppress("UNUSED_PARAMETER") value: Any?,
    ): Unit = throw InvalidSessionScheduleException()
}

data class ExpectedSessionOnlyBody(
    @field:NotNull @field:Min(0) val sessionRevision: Long? = null,
) {
    @JsonAnySetter
    fun rejectUnknown(
        name: String,
        @Suppress("UNUSED_PARAMETER") value: Any?,
    ): Unit = throw InvalidSessionScheduleException()

    fun toExpected(): ExpectedSessionOnly = ExpectedSessionOnly(sessionRevision ?: throw InvalidSessionScheduleException())
}

data class ExpectedAttendanceRowBody(
    @field:NotNull val membershipId: UUID? = null,
    @field:NotNull @field:Min(0) val attendanceRevision: Long? = null,
) {
    @JsonAnySetter
    fun rejectUnknown(
        name: String,
        @Suppress("UNUSED_PARAMETER") value: Any?,
    ): Unit = throw InvalidSessionScheduleException()

    fun toModel(): AttendanceVersion =
        AttendanceVersion(
            membershipId = membershipId ?: throw InvalidSessionScheduleException(),
            attendanceRevision = attendanceRevision ?: throw InvalidSessionScheduleException(),
        )
}

data class ExpectedAttendanceRowsBody(
    @field:NotEmpty val rows: List<ExpectedAttendanceRowBody>? = null,
    @field:Min(0) val participantSetRevision: Long? = null,
) {
    @JsonAnySetter
    fun rejectUnknown(
        name: String,
        @Suppress("UNUSED_PARAMETER") value: Any?,
    ): Unit = throw InvalidSessionScheduleException()
}

data class ExpectedCloseRevisionsBody(
    @field:NotNull @field:Min(0) val sessionRevision: Long? = null,
    @field:Min(0) val participantSetRevision: Long? = null,
    val attendanceSnapshotId: String? = null,
) {
    @JsonAnySetter
    fun rejectUnknown(
        name: String,
        @Suppress("UNUSED_PARAMETER") value: Any?,
    ): Unit = throw InvalidSessionScheduleException()

    fun toExpected(): ExpectedCloseRevisions =
        ExpectedCloseRevisions(
            sessionRevision = sessionRevision ?: throw InvalidSessionScheduleException(),
            participantSetRevision = participantSetRevision ?: throw InvalidSessionScheduleException(),
            attendanceSnapshotId = attendanceSnapshotId ?: throw InvalidSessionScheduleException(),
        )
}

data class ExpectedExposureRevisionBody(
    @field:NotNull @field:Min(0) val exposureRevision: Long? = null,
) {
    @JsonAnySetter
    fun rejectUnknown(
        name: String,
        @Suppress("UNUSED_PARAMETER") value: Any?,
    ): Unit = throw InvalidSessionScheduleException()

    fun toExpected(): ExpectedExposureRevision = ExpectedExposureRevision(exposureRevision ?: throw InvalidSessionScheduleException())
}

data class ExpectedPublicationRevisionBody(
    @field:NotNull @field:Min(0) val publicationRevision: Long? = null,
) {
    @JsonAnySetter
    fun rejectUnknown(
        name: String,
        @Suppress("UNUSED_PARAMETER") value: Any?,
    ): Unit = throw InvalidSessionScheduleException()

    fun toExpected(): ExpectedPublicationRevision =
        ExpectedPublicationRevision(publicationRevision ?: throw InvalidSessionScheduleException())
}

data class ExpectedPublishVectorBody(
    @field:NotNull @field:Min(0) val sessionRevision: Long? = null,
    @field:NotNull @field:Min(0) val liveRecordRevision: Long? = null,
    @field:NotNull @field:Min(0) val exposureRevision: Long? = null,
    @field:NotNull @field:Min(0) val publicationRevision: Long? = null,
) {
    @JsonAnySetter
    fun rejectUnknown(
        name: String,
        @Suppress("UNUSED_PARAMETER") value: Any?,
    ): Unit = throw InvalidSessionScheduleException()

    fun toExpected() =
        com.readmates.session.application.model.PublicationVersionVector(
            sessionRevision = sessionRevision ?: throw InvalidSessionScheduleException(),
            liveRecordRevision = liveRecordRevision ?: throw InvalidSessionScheduleException(),
            exposureRevision = exposureRevision ?: throw InvalidSessionScheduleException(),
            publicationRevision = publicationRevision ?: throw InvalidSessionScheduleException(),
        )
}

data class ExpectedCorrectionPublishVectorBody(
    @field:NotNull @field:Min(0) val sessionRevision: Long? = null,
    @field:NotNull @field:Min(1) val recordDraftRevision: Long? = null,
    @field:NotNull @field:Min(0) val liveRecordRevision: Long? = null,
    @field:NotNull @field:Min(0) val exposureRevision: Long? = null,
    @field:NotNull @field:Min(0) val publicationRevision: Long? = null,
) {
    @JsonAnySetter
    fun rejectUnknown(
        name: String,
        @Suppress("UNUSED_PARAMETER") value: Any?,
    ): Unit = throw InvalidSessionScheduleException()

    fun toExpected() =
        com.readmates.session.application.model.CorrectionPublicationVersionVector(
            sessionRevision = sessionRevision ?: throw InvalidSessionScheduleException(),
            recordDraftRevision = recordDraftRevision ?: throw InvalidSessionScheduleException(),
            liveRecordRevision = liveRecordRevision ?: throw InvalidSessionScheduleException(),
            exposureRevision = exposureRevision ?: throw InvalidSessionScheduleException(),
            publicationRevision = publicationRevision ?: throw InvalidSessionScheduleException(),
        )
}

data class HostAttendanceCommandBody(
    @field:NotEmpty val entries: List<AttendanceEntry>? = null,
)

data class HostLifecycleCommandBody(
    val reasonCode: String? = null,
    val reasonNote: String? = null,
)

data class HostRestoreCommandBody(
    @field:NotBlank val expectedCurrentHash: String? = null,
    val expectedSessionRevision: Long? = null,
    val expectedAttendanceRevision: Long? = null,
    val membershipId: String? = null,
)
