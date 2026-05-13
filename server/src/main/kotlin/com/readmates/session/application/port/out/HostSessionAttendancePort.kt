package com.readmates.session.application.port.out

import com.readmates.session.application.HostAttendanceResponse
import com.readmates.session.application.model.ConfirmAttendanceCommand

interface HostSessionAttendancePort {
    fun confirmAttendance(command: ConfirmAttendanceCommand): HostAttendanceResponse
}
