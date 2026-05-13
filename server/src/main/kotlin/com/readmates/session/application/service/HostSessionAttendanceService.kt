package com.readmates.session.application.service

import com.readmates.session.application.model.ConfirmAttendanceCommand
import com.readmates.session.application.port.`in`.ConfirmAttendanceUseCase
import com.readmates.session.application.port.out.HostSessionAttendancePort
import com.readmates.shared.cache.ReadCacheInvalidationPort
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class HostSessionAttendanceService(
    private val attendancePort: HostSessionAttendancePort,
    private val cacheInvalidation: ReadCacheInvalidationPort = ReadCacheInvalidationPort.Noop(),
) : ConfirmAttendanceUseCase {
    @Transactional
    override fun confirmAttendance(command: ConfirmAttendanceCommand) =
        attendancePort.confirmAttendance(command).also { cacheInvalidation.evictClubContentAfterCommit(command.host.clubId) }
}
