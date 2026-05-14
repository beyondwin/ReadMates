package com.readmates.session.application.port.out

import com.readmates.session.application.HostSessionDeletionPreviewResponse
import com.readmates.session.application.HostSessionDeletionResponse
import com.readmates.session.application.model.HostSessionIdCommand

interface HostSessionDeletionPort {
    fun deletionPreview(command: HostSessionIdCommand): HostSessionDeletionPreviewResponse

    fun delete(command: HostSessionIdCommand): HostSessionDeletionResponse
}
