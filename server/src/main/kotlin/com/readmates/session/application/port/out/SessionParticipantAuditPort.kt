package com.readmates.session.application.port.out

import com.readmates.session.domain.SessionParticipationStatus
import java.util.UUID

data class SessionParticipantChangeAuditEntry(
    val actorMembershipId: UUID,
    val clubId: UUID,
    val sessionId: UUID,
    val membershipId: UUID,
    val beforeStatus: SessionParticipationStatus,
    val afterStatus: SessionParticipationStatus,
    val participantSetRevision: Long,
)

interface SessionParticipantAuditPort {
    fun record(entry: SessionParticipantChangeAuditEntry)

    class Noop : SessionParticipantAuditPort {
        override fun record(entry: SessionParticipantChangeAuditEntry) = Unit
    }
}
