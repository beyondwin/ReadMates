package com.readmates.session.adapter.`in`.web

import com.readmates.session.application.model.AttendanceEntryCommand
import com.readmates.session.application.model.ConfirmAttendanceCommand
import com.readmates.session.application.port.`in`.ConfirmAttendanceUseCase
import com.readmates.shared.security.CurrentMember
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotEmpty
import jakarta.validation.constraints.Pattern
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class AttendanceEntry(
    @field:NotBlank val membershipId: String,
    @field:Pattern(regexp = "ATTENDED|ABSENT") val attendanceStatus: String,
)

fun AttendanceEntry.toCommand(): AttendanceEntryCommand =
    AttendanceEntryCommand(membershipId, attendanceStatus)

@RestController
@RequestMapping("/api/host/sessions/{sessionId}/attendance")
class AttendanceController(
    private val confirmAttendanceUseCase: ConfirmAttendanceUseCase,
) {
    @PostMapping
    fun confirm(
        @PathVariable sessionId: String,
        @Valid @RequestBody @NotEmpty entries: List<@Valid AttendanceEntry>,
        member: CurrentMember,
    ) = confirmAttendanceUseCase.confirmAttendance(
        ConfirmAttendanceCommand(
            host = member,
            sessionId = parseHostSessionId(sessionId),
            entries = entries.map { it.toCommand() },
        ),
    )
}
