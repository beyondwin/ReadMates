package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.CurrentSessionRepository
import com.readmates.session.application.port.out.LoadCurrentSessionPort
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Component

// Temporary bridge for this vertical slice; remove in Phase 7 cleanup after current
// session persistence is moved fully into adapters.
@Component
class LegacyCurrentSessionAdapter(
    private val currentSessionRepository: CurrentSessionRepository,
) : LoadCurrentSessionPort {
    override fun loadCurrentSession(member: CurrentMember) =
        currentSessionRepository.findCurrentSession(member)
}
