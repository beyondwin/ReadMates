package com.readmates.session.application.port.out

import com.readmates.session.application.CreatedSessionResponse
import com.readmates.session.application.HostSessionDetailResponse
import com.readmates.session.application.model.HostSessionCommand
import com.readmates.session.application.model.UpdateHostSessionCommand
import com.readmates.session.application.model.UpdateHostSessionVisibilityCommand

interface HostSessionDraftPort {
    fun create(command: HostSessionCommand): CreatedSessionResponse
    fun update(command: UpdateHostSessionCommand): HostSessionDetailResponse
    fun updateVisibility(command: UpdateHostSessionVisibilityCommand): HostSessionDetailResponse
}
