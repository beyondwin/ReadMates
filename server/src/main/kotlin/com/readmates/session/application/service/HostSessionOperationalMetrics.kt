package com.readmates.session.application.service

import com.readmates.session.application.model.HostSessionDeletionBlocker
import com.readmates.session.application.model.HostSessionLifecycleAction
import io.micrometer.core.instrument.MeterRegistry
import org.springframework.stereotype.Component

@Component
class HostSessionOperationalMetrics(
    private val registry: MeterRegistry,
) {
    fun lifecycle(
        action: HostSessionLifecycleAction,
        outcome: String,
    ) = registry.counter("session.lifecycle.transition", "action", action.name, "outcome", outcome).increment()

    fun legacyReason() = registry.counter("session.lifecycle.legacy.reason").increment()

    fun deletionBlocked(blockers: List<HostSessionDeletionBlocker>) =
        blockers.forEach {
            registry.counter("session.deletion.blocked", "blocker", it.code.name).increment()
        }
}
