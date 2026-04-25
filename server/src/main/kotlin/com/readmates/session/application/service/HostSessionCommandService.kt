package com.readmates.session.application.service

import com.readmates.session.application.model.ConfirmAttendanceCommand
import com.readmates.session.application.model.HostSessionCommand
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.UpdateHostSessionCommand
import com.readmates.session.application.model.UpdateHostSessionVisibilityCommand
import com.readmates.session.application.model.UpsertPublicationCommand
import com.readmates.session.application.port.`in`.ConfirmAttendanceUseCase
import com.readmates.session.application.port.`in`.GetHostDashboardUseCase
import com.readmates.session.application.port.`in`.ListUpcomingSessionsUseCase
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
    ListUpcomingSessionsUseCase,
    GetHostDashboardUseCase {
    override fun list(host: CurrentMember) = port.list(host)

    @Transactional
    override fun create(command: HostSessionCommand) = port.create(command)

    override fun detail(command: HostSessionIdCommand) = port.detail(command)

    @Transactional
    override fun update(command: UpdateHostSessionCommand) = port.update(command)

    @Transactional
    override fun updateVisibility(command: UpdateHostSessionVisibilityCommand) = port.updateVisibility(command)

    @Transactional
    override fun open(command: HostSessionIdCommand) = port.open(command)

    @Transactional
    override fun close(command: HostSessionIdCommand) = port.close(command)

    @Transactional
    override fun publish(command: HostSessionIdCommand) = port.publish(command)

    override fun deletionPreview(command: HostSessionIdCommand) = port.deletionPreview(command)

    @Transactional
    override fun delete(command: HostSessionIdCommand) = port.delete(command)

    @Transactional
    override fun confirmAttendance(command: ConfirmAttendanceCommand) = port.confirmAttendance(command)

    @Transactional
    override fun upsertPublication(command: UpsertPublicationCommand) = port.upsertPublication(command)

    override fun dashboard(host: CurrentMember) = port.dashboard(host)

    override fun upcoming(member: CurrentMember) = port.upcoming(member)
}
