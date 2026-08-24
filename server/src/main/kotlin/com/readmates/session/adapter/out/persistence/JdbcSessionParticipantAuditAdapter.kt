package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.port.out.SessionParticipantAuditPort
import com.readmates.session.application.port.out.SessionParticipantChangeAuditEntry
import com.readmates.shared.db.dbString
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class JdbcSessionParticipantAuditAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : SessionParticipantAuditPort {
    override fun record(entry: SessionParticipantChangeAuditEntry) {
        jdbcTemplate.update(
            """
            insert into session_participant_change_audit (
              id,
              actor_membership_id,
              club_id,
              session_id,
              membership_id,
              before_status,
              after_status,
              participant_set_revision
            )
            values (?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            UUID.randomUUID().dbString(),
            entry.actorMembershipId.dbString(),
            entry.clubId.dbString(),
            entry.sessionId.dbString(),
            entry.membershipId.dbString(),
            entry.beforeStatus.name,
            entry.afterStatus.name,
            entry.participantSetRevision,
        )
    }
}
