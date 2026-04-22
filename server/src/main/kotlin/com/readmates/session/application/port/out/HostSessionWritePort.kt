package com.readmates.session.application.port.out

import com.readmates.session.application.CreatedSessionResponse
import com.readmates.session.application.HostAttendanceResponse
import com.readmates.session.application.HostPublicationResponse
import com.readmates.session.application.HostSessionDeletionPreviewResponse
import com.readmates.session.application.HostSessionDeletionResponse
import com.readmates.session.application.HostSessionDetailResponse
import com.readmates.session.application.model.ConfirmAttendanceCommand
import com.readmates.session.application.model.HostDashboardResult
import com.readmates.session.application.model.HostSessionCommand
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.UpdateHostSessionCommand
import com.readmates.session.application.model.UpsertPublicationCommand
import com.readmates.shared.security.CurrentMember

interface HostSessionWritePort {
    fun create(command: HostSessionCommand): CreatedSessionResponse
    fun detail(command: HostSessionIdCommand): HostSessionDetailResponse
    fun update(command: UpdateHostSessionCommand): HostSessionDetailResponse
    fun deletionPreview(command: HostSessionIdCommand): HostSessionDeletionPreviewResponse
    fun delete(command: HostSessionIdCommand): HostSessionDeletionResponse
    fun confirmAttendance(command: ConfirmAttendanceCommand): HostAttendanceResponse
    fun upsertPublication(command: UpsertPublicationCommand): HostPublicationResponse
    fun dashboard(host: CurrentMember): HostDashboardResult
}
