package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostSessionDeletionRepository
import com.readmates.session.application.HostSessionRepository
import com.readmates.session.application.model.ConfirmAttendanceCommand
import com.readmates.session.application.model.HostSessionCommand
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.UpdateHostSessionCommand
import com.readmates.session.application.model.UpsertPublicationCommand
import com.readmates.session.application.port.out.HostSessionWritePort
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Component

// Temporary bridge for this vertical slice; remove in Phase 7 cleanup after host session
// persistence is moved fully into adapters.
@Component
class LegacyHostSessionWriteAdapter(
    private val hostSessionRepository: HostSessionRepository,
    private val hostSessionDeletionRepository: HostSessionDeletionRepository,
) : HostSessionWritePort {
    override fun create(command: HostSessionCommand) =
        hostSessionRepository.createOpenSession(command.host, command)

    override fun detail(command: HostSessionIdCommand) =
        hostSessionRepository.findHostSession(command.host, command.sessionId)

    override fun update(command: UpdateHostSessionCommand) =
        hostSessionRepository.updateHostSession(command.host, command.sessionId, command.session)

    override fun deletionPreview(command: HostSessionIdCommand) =
        hostSessionDeletionRepository.previewOpenSessionDeletion(command.host, command.sessionId)

    override fun delete(command: HostSessionIdCommand) =
        hostSessionDeletionRepository.deleteOpenHostSession(command.host, command.sessionId)

    override fun confirmAttendance(command: ConfirmAttendanceCommand) =
        hostSessionRepository.confirmAttendance(command)

    override fun upsertPublication(command: UpsertPublicationCommand) =
        hostSessionRepository.upsertPublication(command)

    override fun dashboard(host: CurrentMember) =
        hostSessionRepository.hostDashboard(host)
}
