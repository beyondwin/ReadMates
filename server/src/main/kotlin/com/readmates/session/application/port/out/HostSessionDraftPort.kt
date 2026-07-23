package com.readmates.session.application.port.out

import com.readmates.session.application.CreatedSessionResponse
import com.readmates.session.application.HostSessionDetailResponse
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.session.application.model.HostSessionCommand
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.UpdateHostSessionCommand
import com.readmates.session.application.model.UpdateHostSessionVisibilityCommand
import java.time.OffsetDateTime

interface HostSessionDraftPort {
    fun create(command: HostSessionCommand): CreatedSessionResponse

    fun update(command: UpdateHostSessionCommand): HostSessionDetailResponse

    fun lockVisibilitySnapshot(command: HostSessionIdCommand): HostSessionVisibilitySnapshot

    fun updateVisibility(command: UpdateHostSessionVisibilityCommand): HostSessionVisibilityUpdateResult
}

data class HostSessionVisibilitySnapshot(
    val detail: HostSessionDetailResponse,
    val contentUpdatedAt: OffsetDateTime,
)

data class HostSessionVisibilityUpdateResult(
    val previousVisibility: SessionRecordVisibility,
    val detail: HostSessionDetailResponse,
)
