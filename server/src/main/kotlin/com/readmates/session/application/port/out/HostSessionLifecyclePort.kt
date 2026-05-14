package com.readmates.session.application.port.out

import com.readmates.session.application.HostSessionDetailResponse
import com.readmates.session.application.model.HostSessionIdCommand

data class HostSessionTransitionResult(
    val detail: HostSessionDetailResponse,
    val changed: Boolean,
)

interface HostSessionLifecyclePort {
    fun open(command: HostSessionIdCommand): HostSessionTransitionResult

    fun close(command: HostSessionIdCommand): HostSessionTransitionResult

    fun publish(command: HostSessionIdCommand): HostSessionTransitionResult
}
