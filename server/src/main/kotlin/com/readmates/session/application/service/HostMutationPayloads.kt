package com.readmates.session.application.service

import com.readmates.session.application.model.ConfirmAttendanceCommand
import com.readmates.session.application.model.CorrectionPublicationVersionVector
import com.readmates.session.application.model.HostSessionCommand
import com.readmates.session.application.model.HostSessionReverseCommand
import com.readmates.session.application.model.UpdateHostSessionVisibilityCommand
import com.readmates.session.application.model.UpsertPublicationCommand
import com.readmates.shared.mutation.application.model.CanonicalMutationPayload
import com.readmates.shared.mutation.application.model.HostMutationOperation
import java.util.UUID

internal object HostMutationPayloads {
    const val CREATE_SLOT = "create"

    fun sessionFields(
        operation: HostMutationOperation,
        command: HostSessionCommand,
    ): CanonicalMutationPayload.SessionFields =
        CanonicalMutationPayload.SessionFields.applyDefaults(
            operation = operation,
            title = command.title,
            bookTitle = command.bookTitle,
            bookAuthor = command.bookAuthor,
            date = command.date,
            bookLink = command.bookLink,
            bookImageUrl = command.bookImageUrl,
            startTime = command.startTime,
            endTime = command.endTime,
            questionDeadlineAt = command.questionDeadlineAt,
            locationLabel = command.locationLabel,
            meetingUrl = command.meetingUrl,
            meetingPasscode = command.meetingPasscode,
            accessScope = command.accessScope?.name,
        )

    fun attendance(command: ConfirmAttendanceCommand): CanonicalMutationPayload.Attendance {
        val operation =
            if (command.entries.size > 1) {
                HostMutationOperation.SESSION_ATTENDANCE_BULK
            } else {
                HostMutationOperation.SESSION_ATTENDANCE_SINGLE
            }
        return CanonicalMutationPayload.Attendance(
            operation = operation,
            rows =
                command.entries.map { entry ->
                    CanonicalMutationPayload.AttendanceRow(
                        membershipId = UUID.fromString(entry.membershipId),
                        status = entry.attendanceStatus,
                        expectedAttendanceRevision = entry.expectedAttendanceRevision,
                    )
                },
            expectedParticipantSetRevision = command.expectedParticipantSetRevision,
        )
    }

    fun resourceOnly(operation: HostMutationOperation): CanonicalMutationPayload.ResourceOnly =
        CanonicalMutationPayload.ResourceOnly(operation)

    fun correction(vector: CorrectionPublicationVersionVector): CanonicalMutationPayload.CorrectionPublish =
        CanonicalMutationPayload.CorrectionPublish(
            expectedSessionRevision = vector.sessionRevision,
            expectedDraftRevision = vector.recordDraftRevision,
            expectedLiveRevision = vector.liveRecordRevision,
            expectedExposureRevision = vector.exposureRevision,
            expectedPublicationRevision = vector.publicationRevision,
        )

    fun reverse(command: HostSessionReverseCommand): CanonicalMutationPayload.Reverse =
        CanonicalMutationPayload.Reverse(
            reasonCode = command.reasonCode?.name,
            reasonNote = command.reasonNote,
        )

    fun exposure(command: UpdateHostSessionVisibilityCommand): CanonicalMutationPayload.Exposure =
        CanonicalMutationPayload.Exposure(
            accessScope = command.accessScope?.name ?: command.visibility.name,
            expectedExposureRevision = command.expectedExposureRevision,
        )

    fun publication(command: UpsertPublicationCommand): CanonicalMutationPayload.Publication =
        CanonicalMutationPayload.Publication(
            publicSummary = command.publicSummary,
            siteVisibility = command.siteVisibility?.name,
            accessScope = command.accessScope?.name,
            visibility = command.visibility.name,
            expectedPublicationRevision = command.expectedPublicationRevision,
            expectedExposureRevision = command.expectedExposureRevision,
        )
}
