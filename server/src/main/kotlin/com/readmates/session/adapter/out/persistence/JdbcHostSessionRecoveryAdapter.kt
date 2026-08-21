package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostSessionBasicAuditSnapshot
import com.readmates.session.application.port.out.HostSessionRecoverableChange
import com.readmates.session.application.port.out.HostSessionRecoveryPort
import com.readmates.session.application.port.out.HostSessionRestoreCurrentState
import com.readmates.session.application.port.out.HostSessionRestoreLock
import com.readmates.session.application.requireHost
import com.readmates.session.application.transitionMembershipIds
import com.readmates.shared.db.dbString
import com.readmates.shared.security.CurrentMember
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import tools.jackson.databind.ObjectMapper
import java.util.UUID

@Repository
class JdbcHostSessionRecoveryAdapter(
    private val jdbcTemplate: JdbcTemplate,
    private val objectMapper: ObjectMapper,
) : HostSessionRecoveryPort {
    override fun loadChange(
        host: CurrentMember,
        sessionId: UUID,
        changeId: UUID,
    ): HostSessionRecoverableChange? {
        requireHost(host)
        return loadChangeRow(host, sessionId, changeId, forUpdate = false)
    }

    override fun loadCurrentState(
        host: CurrentMember,
        sessionId: UUID,
        membershipIds: Set<UUID>,
    ): HostSessionRestoreCurrentState {
        requireHost(host)
        return HostSessionRestoreCurrentState(
            basic = loadBasicSnapshot(host, sessionId, forUpdate = false),
            attendance = loadAttendance(host, sessionId, membershipIds, forUpdate = false),
        )
    }

    override fun lockForRestore(
        host: CurrentMember,
        sessionId: UUID,
        changeId: UUID,
    ): HostSessionRestoreLock? {
        requireHost(host)
        val basic = loadBasicSnapshot(host, sessionId, forUpdate = true) ?: return null
        val change = loadChangeRow(host, sessionId, changeId, forUpdate = true) ?: return null
        val attendance = loadAttendance(host, sessionId, change.transitionMembershipIds(), forUpdate = true)
        return HostSessionRestoreLock(change, HostSessionRestoreCurrentState(basic, attendance))
    }

    private fun loadChangeRow(
        host: CurrentMember,
        sessionId: UUID,
        changeId: UUID,
        forUpdate: Boolean,
    ): HostSessionRecoverableChange? {
        val lock = if (forUpdate) " for update" else ""
        val row =
            jdbcTemplate
                .query(
                    """
                    select id, session_id, action_type, changed_fields_json,
                           before_snapshot_json, after_snapshot_json
                    from host_session_change_audit
                    where club_id = ? and session_id = ? and id = ?$lock
                    """.trimIndent(),
                    { rs, _ -> rs.toRecoverableChange(objectMapper) },
                    host.clubId.dbString(),
                    sessionId.dbString(),
                    changeId.dbString(),
                ).firstOrNull() ?: return null
        return row.copy(alreadyRestored = alreadyRestored(host, sessionId, changeId))
    }

    private fun alreadyRestored(
        host: CurrentMember,
        sessionId: UUID,
        changeId: UUID,
    ): Boolean =
        jdbcTemplate
            .query(
                """
                select 1
                from host_session_change_audit
                where club_id = ? and session_id = ? and restored_from_change_id = ?
                limit 1
                """.trimIndent(),
                { _, _ -> true },
                host.clubId.dbString(),
                sessionId.dbString(),
                changeId.dbString(),
            ).isNotEmpty()

    private fun loadBasicSnapshot(
        host: CurrentMember,
        sessionId: UUID,
        forUpdate: Boolean,
    ): HostSessionBasicAuditSnapshot? {
        val lock = if (forUpdate) " for update" else ""
        return jdbcTemplate
            .query(
                """
                select title, book_title, book_author, book_link, book_image_url,
                       session_date, start_time, end_time, question_deadline_at,
                       location_label, meeting_url, meeting_passcode
                from active_sessions sessions
                where club_id = ? and id = ?$lock
                """.trimIndent(),
                { rs, _ -> rs.toHostSessionBasicSnapshot() },
                host.clubId.dbString(),
                sessionId.dbString(),
            ).firstOrNull()
    }

    private fun loadAttendance(
        host: CurrentMember,
        sessionId: UUID,
        membershipIds: Set<UUID>,
        forUpdate: Boolean,
    ): Map<UUID, String> {
        if (membershipIds.isEmpty()) return emptyMap()
        val ordered = membershipIds.sortedBy { it.toString() }
        val placeholders = ordered.joinToString(",") { "?" }
        val lock = if (forUpdate) " for update" else ""
        val arguments = listOf(host.clubId.dbString(), sessionId.dbString()) + ordered.map(UUID::dbString)
        return jdbcTemplate
            .query(
                """
                select membership_id, attendance_status
                from session_participants
                where club_id = ?
                  and session_id = ?
                  and participation_status = 'ACTIVE'
                  and membership_id in ($placeholders)
                order by membership_id
                $lock
                """.trimIndent(),
                { rs, _ -> UUID.fromString(rs.getString("membership_id")) to rs.getString("attendance_status") },
                *arguments.toTypedArray(),
            ).toMap()
    }
}
