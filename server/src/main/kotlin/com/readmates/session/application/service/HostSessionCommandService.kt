package com.readmates.session.application.service

import com.readmates.session.application.model.ConfirmAttendanceCommand
import com.readmates.session.application.model.HostSessionCommand
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.UpdateHostSessionCommand
import com.readmates.session.application.model.UpsertPublicationCommand
import com.readmates.session.application.port.`in`.ConfirmAttendanceUseCase
import com.readmates.session.application.port.`in`.GetHostDashboardUseCase
import com.readmates.session.application.port.`in`.ManageHostSessionUseCase
import com.readmates.session.application.port.`in`.UpsertPublicationUseCase
import com.readmates.session.application.port.out.HostSessionWritePort
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class HostSessionCommandService(
    private val port: HostSessionWritePort,
) : ManageHostSessionUseCase,
    ConfirmAttendanceUseCase,
    UpsertPublicationUseCase,
    GetHostDashboardUseCase {
    @Transactional
    override fun create(command: HostSessionCommand) = port.create(command)

    override fun detail(command: HostSessionIdCommand) = port.detail(command)

    @Transactional
    override fun update(command: UpdateHostSessionCommand) = port.update(command)

    override fun deletionPreview(command: HostSessionIdCommand) = port.deletionPreview(command)

    @Transactional
    override fun delete(command: HostSessionIdCommand) = port.delete(command)

    @Transactional
    override fun confirmAttendance(command: ConfirmAttendanceCommand) = port.confirmAttendance(command)

    @Transactional
    override fun upsertPublication(command: UpsertPublicationCommand) = port.upsertPublication(command)

    override fun dashboard(host: CurrentMember) = port.dashboard(host)
}
