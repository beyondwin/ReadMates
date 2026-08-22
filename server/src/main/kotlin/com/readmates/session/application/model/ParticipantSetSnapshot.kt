package com.readmates.session.application.model

import java.util.UUID

data class ParticipantSetSnapshot(
    val sessionId: UUID,
    val revision: Long,
    val activeMembershipIds: Set<UUID>,
)
