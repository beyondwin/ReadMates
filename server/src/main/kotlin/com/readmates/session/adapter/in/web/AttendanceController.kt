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
    @field:NotBlank val membershipId: String? = null,
    @field:NotBlank @field:Pattern(regexp = "ATTENDED|ABSENT|UNKNOWN") val attendanceStatus: String? = null,
    @field:NotNull @field:Min(0) val expectedAttendanceRevision: Long? = null,
)

fun AttendanceEntry.toCommand(): AttendanceEntryCommand =
    AttendanceEntryCommand(
        membershipId = membershipId ?: throw InvalidSessionScheduleException(),
        attendanceStatus = attendanceStatus ?: throw InvalidSessionScheduleException(),
        expectedAttendanceRevision = expectedAttendanceRevision ?: throw InvalidSessionScheduleException(),
    )

@Suppress("ThrowsCount")
private fun bindExpectedAttendanceRows(
    commandEntries: List<AttendanceEntry>,
    expectedRows: List<ExpectedAttendanceRowBody>?,
    envelope: Boolean,
): List<AttendanceEntryCommand> {
    if (!envelope || expectedRows.isNullOrEmpty()) {
        return commandEntries.map { it.toCommand() }
    }
    val expectedByMembership =
        expectedRows.associate { row ->
            val membershipId = row.membershipId ?: throw InvalidSessionScheduleException()
            val revision = row.attendanceRevision ?: throw InvalidSessionScheduleException()
            membershipId to revision
        }
    val commandIds =
        commandEntries.map { entry ->
            runCatching { java.util.UUID.fromString(entry.membershipId) }
                .getOrElse { throw InvalidSessionScheduleException() }
        }
    if (commandIds.toSet() != expectedByMembership.keys || commandIds.size != expectedByMembership.size) {
        throw InvalidSessionScheduleException()
    }
    return commandEntries.map { entry ->
        val command = entry.toCommand()
        val membershipId = java.util.UUID.fromString(command.membershipId)
        val expectedRevision = expectedByMembership.getValue(membershipId)
        if (command.expectedAttendanceRevision != expectedRevision) {
            throw InvalidSessionScheduleException()
        }
        command.copy(expectedAttendanceRevision = expectedRevision)
    }
}

@RestController
@RequestMapping("/api/host/sessions/{sessionId}/attendance")
class AttendanceController(
    private val confirmAttendanceUseCase: ConfirmAttendanceUseCase,
    private val envelopes: HostMutationEnvelopeReader,
) {
    @PostMapping
    @Suppress("ThrowsCount")
    fun confirm(
        @PathVariable sessionId: String,
        @RequestParam(required = false) expectedParticipantSetRevision: Long?,
        @RequestBody body: JsonNode,
        member: CurrentMember,
    ): Any {
        val envelope = envelopes.attendance(body)
        val commandEntries = envelope.command.entries ?: throw InvalidSessionScheduleException()
        val participantSetRevision =
            envelope.expected.participantSetRevision ?: expectedParticipantSetRevision
        if (body.has("idempotencyKey")) {
            if (commandEntries.size == 1 && envelope.expected.participantSetRevision != null) {
                throw InvalidSessionScheduleException()
            }
            if (commandEntries.size > 1 && envelope.expected.participantSetRevision == null) {
                throw InvalidSessionScheduleException()
            }
        }
        val entries = bindExpectedAttendanceRows(commandEntries, envelope.expected.rows, body.has("idempotencyKey"))
        return confirmAttendanceUseCase.confirmAttendance(
            ConfirmAttendanceCommand(
                host = member,
                sessionId = parseHostSessionId(sessionId),
                entries = entries,
                expectedParticipantSetRevision = participantSetRevision,
                idempotencyKey = envelope.idempotencyKey,
            ),
        )
    }
}
