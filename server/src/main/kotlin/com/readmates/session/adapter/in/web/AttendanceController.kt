package com.readmates.session.adapter.`in`.web

import com.readmates.session.application.InvalidSessionScheduleException
import com.readmates.session.application.model.AttendanceEntryCommand
import com.readmates.session.application.model.ConfirmAttendanceCommand
import com.readmates.session.application.port.`in`.ConfirmAttendanceUseCase
import com.readmates.shared.security.CurrentMember
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotNull
import jakarta.validation.constraints.Pattern
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode

data class AttendanceEntry(
    @field:NotBlank val membershipId: String,
    @field:Pattern(regexp = "ATTENDED|ABSENT|UNKNOWN") val attendanceStatus: String,
    @field:NotNull @field:Min(0) val expectedAttendanceRevision: Long,
)

fun AttendanceEntry.toCommand(): AttendanceEntryCommand = AttendanceEntryCommand(membershipId, attendanceStatus, expectedAttendanceRevision)

@RestController
@RequestMapping("/api/host/sessions/{sessionId}/attendance")
class AttendanceController(
    private val confirmAttendanceUseCase: ConfirmAttendanceUseCase,
    private val envelopes: HostMutationEnvelopeReader,
) {
    @PostMapping
    fun confirm(
        @PathVariable sessionId: String,
        @RequestParam(required = false) expectedParticipantSetRevision: Long?,
        @RequestBody body: JsonNode,
        member: CurrentMember,
    ): Any {
        val envelope = envelopes.attendance(body)
        val entries = envelope.command.entries ?: throw InvalidSessionScheduleException()
        val participantSetRevision =
            envelope.expected.participantSetRevision ?: expectedParticipantSetRevision
        if (body.has("idempotencyKey")) {
            if (entries.size == 1 && envelope.expected.participantSetRevision != null) {
                throw InvalidSessionScheduleException()
            }
            if (entries.size > 1 && envelope.expected.participantSetRevision == null) {
                throw InvalidSessionScheduleException()
            }
        }
        return confirmAttendanceUseCase.confirmAttendance(
            ConfirmAttendanceCommand(
                host = member,
                sessionId = parseHostSessionId(sessionId),
                entries = entries.map { it.toCommand() },
                expectedParticipantSetRevision = participantSetRevision,
                idempotencyKey = envelope.idempotencyKey,
            ),
        )
    }
}
