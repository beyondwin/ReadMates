package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.model.HostSessionLifecycleAuditEntry
import com.readmates.session.application.port.out.HostSessionLifecycleAuditPort
import com.readmates.shared.db.dbString
import com.readmates.shared.observability.RequestIdFilter
import org.slf4j.MDC
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class JdbcHostSessionLifecycleAuditAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : HostSessionLifecycleAuditPort {
    override fun record(entry: HostSessionLifecycleAuditEntry) {
        jdbcTemplate.update(
            """
            insert into host_session_lifecycle_audit (
              id, club_id, session_id, actor_membership_id, action_type,
              from_state, to_state, reason_code, reason_note, request_id
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            UUID.randomUUID().dbString(),
            entry.host.clubId.dbString(),
            entry.sessionId.dbString(),
            entry.host.membershipId.dbString(),
            entry.action.name,
            entry.fromState,
            entry.toState,
            entry.reasonCode?.name,
            entry.reasonNote,
            MDC.get(RequestIdFilter.MDC_KEY)?.takeIf(String::isNotBlank) ?: UUID.randomUUID().toString(),
        )
    }
}
