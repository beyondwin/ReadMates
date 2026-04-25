package com.readmates.session.application.port.`in`

import com.readmates.session.application.CreatedSessionResponse
import com.readmates.session.application.HostAttendanceResponse
import com.readmates.session.application.HostPublicationResponse
import com.readmates.session.application.HostSessionDeletionPreviewResponse
import com.readmates.session.application.HostSessionDeletionResponse
import com.readmates.session.application.HostSessionDetailResponse
import com.readmates.session.application.HostSessionListItem
import com.readmates.session.application.UpcomingSessionItem
import com.readmates.session.application.model.ConfirmAttendanceCommand
import com.readmates.session.application.model.HostDashboardResult
import com.readmates.session.application.model.HostSessionCommand
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.UpdateHostSessionCommand
import com.readmates.session.application.model.UpdateHostSessionVisibilityCommand
import com.readmates.session.application.model.UpsertPublicationCommand
import com.readmates.shared.security.CurrentMember

interface ManageHostSessionUseCase {
    fun list(host: CurrentMember): List<HostSessionListItem>
    fun create(command: HostSessionCommand): CreatedSessionResponse
    fun detail(command: HostSessionIdCommand): HostSessionDetailResponse
    fun update(command: UpdateHostSessionCommand): HostSessionDetailResponse
    fun updateVisibility(command: UpdateHostSessionVisibilityCommand): HostSessionDetailResponse
    fun open(command: HostSessionIdCommand): HostSessionDetailResponse
    fun close(command: HostSessionIdCommand): HostSessionDetailResponse
    fun deletionPreview(command: HostSessionIdCommand): HostSessionDeletionPreviewResponse
    fun delete(command: HostSessionIdCommand): HostSessionDeletionResponse
}

interface ListUpcomingSessionsUseCase {
    fun upcoming(member: CurrentMember): List<UpcomingSessionItem>
}

interface ConfirmAttendanceUseCase {
    fun confirmAttendance(command: ConfirmAttendanceCommand): HostAttendanceResponse
}

interface UpsertPublicationUseCase {
    fun upsertPublication(command: UpsertPublicationCommand): HostPublicationResponse
}

interface GetHostDashboardUseCase {
    fun dashboard(host: CurrentMember): HostDashboardResult
}
