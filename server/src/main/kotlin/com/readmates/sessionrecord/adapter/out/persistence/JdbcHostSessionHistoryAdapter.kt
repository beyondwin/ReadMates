package com.readmates.sessionrecord.adapter.out.persistence

import com.readmates.sessionrecord.application.model.HostSessionHistoryAttendanceTransition
import com.readmates.sessionrecord.application.model.HostSessionHistoryCursor
import com.readmates.sessionrecord.application.model.HostSessionHistoryItem
import com.readmates.sessionrecord.application.model.HostSessionHistoryRecovery
import com.readmates.sessionrecord.application.model.HostSessionHistoryType
import com.readmates.sessionrecord.application.model.SessionRecordSource
import com.readmates.sessionrecord.application.port.out.HostSessionHistoryPort
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.security.CurrentMember
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import tools.jackson.core.type.TypeReference
import tools.jackson.databind.ObjectMapper
import java.sql.ResultSet
import java.util.UUID

@Repository
class JdbcHostSessionHistoryAdapter(
    private val jdbcTemplate: JdbcTemplate,
    private val objectMapper: ObjectMapper,
) : HostSessionHistoryPort {
    override fun loadAuditHistory(
        host: CurrentMember,
        sessionId: UUID,
        cursor: HostSessionHistoryCursor?,
        limit: Int,
    ): List<HostSessionHistoryItem> =
        queryHistory(
            """
            select id, action_type, changed_fields_json, actor_membership_id, created_at,
                   before_snapshot_json, after_snapshot_json,
                   case action_type when 'ATTENDANCE_UPDATED' then 20 else 10 end as type_sort
            from host_session_change_audit
            where club_id = ? and session_id = ?
            """.trimIndent(),
            host,
            sessionId,
            cursor,
            limit,
        ) { rs -> rs.toAuditHistory(objectMapper) }

    override fun loadRevisionHistory(
        host: CurrentMember,
        sessionId: UUID,
        cursor: HostSessionHistoryCursor?,
        limit: Int,
    ): List<HostSessionHistoryItem> =
        queryHistory(
            """
            select id, version, source, restored_from_revision_id, applied_by_membership_id,
                   applied_at as created_at,
                   case source when 'RESTORED' then 40 else 30 end as type_sort
            from session_record_revisions
            where club_id = ? and session_id = ? and source <> 'BASELINE'
            """.trimIndent(),
            host,
            sessionId,
            cursor,
            limit,
        ) { rs -> rs.toRevisionHistory() }

    override fun loadNotificationHistory(
        host: CurrentMember,
        sessionId: UUID,
        cursor: HostSessionHistoryCursor?,
        limit: Int,
    ): List<HostSessionHistoryItem> =
        queryHistory(
            """
            select id, decision, host_membership_id, event_id, created_at,
                   case decision when 'SKIP' then 60 else 50 end as type_sort
            from host_action_notification_decisions
            where club_id = ? and session_id = ?
            """.trimIndent(),
            host,
            sessionId,
            cursor,
            limit,
        ) { rs -> rs.toNotificationHistory() }

    override fun loadLifecycleHistory(
        host: CurrentMember,
        sessionId: UUID,
        cursor: HostSessionHistoryCursor?,
        limit: Int,
    ): List<HostSessionHistoryItem> =
        queryHistory(
            """
            select id, action_type, from_state, to_state, reason_code, reason_note,
                   actor_membership_id, created_at,
                   (
                     select state
                     from active_sessions sessions
                     where sessions.id = host_session_lifecycle_audit.session_id
                       and sessions.club_id = host_session_lifecycle_audit.club_id
                   ) as current_state,
                   case action_type
                     when 'OPENED' then 70
                     when 'CLOSED' then 80
                     when 'PUBLISHED' then 90
                     when 'REOPENED' then 100
                     when 'UNPUBLISHED' then 110
                     when 'RETURNED_TO_DRAFT' then 120
                     when 'DELETED' then 130
                   end as type_sort
            from host_session_lifecycle_audit
            where club_id = ? and session_id = ?
            """.trimIndent(),
            host,
            sessionId,
            cursor,
            limit,
        ) { rs -> rs.toLifecycleHistory() }

    private fun queryHistory(
        baseSql: String,
        host: CurrentMember,
        sessionId: UUID,
        cursor: HostSessionHistoryCursor?,
        limit: Int,
        mapper: (ResultSet) -> HostSessionHistoryItem,
    ): List<HostSessionHistoryItem> {
        val parameters = mutableListOf<Any>(host.clubId.dbString(), sessionId.dbString())
        val cursorCondition =
            if (cursor == null) {
                ""
            } else {
                parameters += cursor.createdAt.toUtcLocalDateTime()
                parameters += cursor.createdAt.toUtcLocalDateTime()
                parameters += cursor.typeSort
                parameters += cursor.createdAt.toUtcLocalDateTime()
                parameters += cursor.typeSort
                parameters += cursor.id.dbString()
                """
                and (
                  created_at < ?
                  or (created_at = ? and type_sort < ?)
                  or (created_at = ? and type_sort = ? and id < ?)
                )
                """.trimIndent()
            }
        parameters += limit
        return jdbcTemplate.query(
            """
            select *
            from (
              $baseSql
            ) history_source
            where 1 = 1
              $cursorCondition
            order by created_at desc, type_sort desc, id desc
            limit ?
            """.trimIndent(),
            { rs, _ -> mapper(rs) },
            *parameters.toTypedArray(),
        )
    }
}

private fun ResultSet.toAuditHistory(objectMapper: ObjectMapper): HostSessionHistoryItem {
    val type = HostSessionHistoryType.valueOf(getString("action_type"))
    val json = getString("changed_fields_json")
    val completeSnapshots =
        !getString("before_snapshot_json").isNullOrBlank() &&
            !getString("after_snapshot_json").isNullOrBlank()
    return HostSessionHistoryItem(
        id = UUID.fromString(getString("id")),
        type = type,
        createdAt = utcOffsetDateTime("created_at"),
        actorMembershipId = UUID.fromString(getString("actor_membership_id")),
        changedFields =
            if (type == HostSessionHistoryType.BASIC_INFO_UPDATED) {
                objectMapper.readValue(json, object : TypeReference<List<String>>() {})
            } else {
                emptyList()
            },
        attendanceTransitions =
            if (type == HostSessionHistoryType.ATTENDANCE_UPDATED) {
                objectMapper
                    .readValue(json, object : TypeReference<List<AuditTransitionJson>>() {})
                    .map { HostSessionHistoryAttendanceTransition(UUID.fromString(it.membershipId), it.from, it.to) }
            } else {
                emptyList()
            },
        recovery = restoreChangeRecovery(completeSnapshots),
    )
}

private fun ResultSet.toRevisionHistory(): HostSessionHistoryItem {
    val source = SessionRecordSource.valueOf(getString("source"))
    return HostSessionHistoryItem(
        id = UUID.fromString(getString("id")),
        type =
            if (source == SessionRecordSource.RESTORED) {
                HostSessionHistoryType.RECORD_REVISION_RESTORED
            } else {
                HostSessionHistoryType.RECORD_REVISION_APPLIED
            },
        createdAt = utcOffsetDateTime("created_at"),
        actorMembershipId = UUID.fromString(getString("applied_by_membership_id")),
        revisionId = UUID.fromString(getString("id")),
        revisionVersion = getLong("version"),
        revisionSource = source,
        restoredFromRevisionId = getString("restored_from_revision_id")?.let(UUID::fromString),
        recovery = HostSessionHistoryRecovery(action = "RESTORE_RECORD_DRAFT", availability = "AVAILABLE"),
    )
}

private fun ResultSet.toNotificationHistory(): HostSessionHistoryItem {
    val sent = getString("decision") == "SEND"
    return HostSessionHistoryItem(
        id = UUID.fromString(getString("id")),
        type =
            if (sent) {
                HostSessionHistoryType.NOTIFICATION_SENT
            } else {
                HostSessionHistoryType.NOTIFICATION_SKIPPED
            },
        createdAt = utcOffsetDateTime("created_at"),
        actorMembershipId = UUID.fromString(getString("host_membership_id")),
        notificationEventId = getString("event_id")?.let(UUID::fromString),
        recovery = HostSessionHistoryRecovery(action = "NONE", availability = "UNAVAILABLE"),
    )
}

private fun ResultSet.toLifecycleHistory(): HostSessionHistoryItem {
    val actionType = getString("action_type")
    return HostSessionHistoryItem(
        id = UUID.fromString(getString("id")),
        type = lifecycleHistoryType(actionType),
        createdAt = utcOffsetDateTime("created_at"),
        actorMembershipId = UUID.fromString(getString("actor_membership_id")),
        fromState = getString("from_state"),
        toState = getString("to_state"),
        reasonCode = getString("reason_code"),
        reasonNote = getString("reason_note"),
        recovery = reverseLifecycleRecovery(actionType, getString("current_state")),
    )
}

private fun lifecycleHistoryType(actionType: String): HostSessionHistoryType =
    when (actionType) {
        "OPENED" -> HostSessionHistoryType.SESSION_OPENED
        "CLOSED" -> HostSessionHistoryType.SESSION_CLOSED
        "PUBLISHED" -> HostSessionHistoryType.SESSION_PUBLISHED
        "REOPENED" -> HostSessionHistoryType.SESSION_REOPENED
        "UNPUBLISHED" -> HostSessionHistoryType.SESSION_UNPUBLISHED
        "RETURNED_TO_DRAFT" -> HostSessionHistoryType.SESSION_RETURNED_TO_DRAFT
        "DELETED" -> HostSessionHistoryType.SESSION_DELETED
        else -> error("Unsupported lifecycle history action")
    }

private fun restoreChangeRecovery(completeSnapshots: Boolean) =
    HostSessionHistoryRecovery(
        action = "RESTORE_CHANGE",
        availability = if (completeSnapshots) "AVAILABLE" else "UNAVAILABLE",
        blockedReason = if (completeSnapshots) null else "SNAPSHOT_UNAVAILABLE",
    )

private fun reverseLifecycleRecovery(
    actionType: String,
    currentState: String?,
): HostSessionHistoryRecovery {
    val available = currentState != null && lifecycleInverseValid(actionType, currentState)
    return HostSessionHistoryRecovery(
        action = "REVERSE_LIFECYCLE",
        availability = if (available) "AVAILABLE" else "UNAVAILABLE",
        blockedReason = if (available) null else "LIFECYCLE_INVERSE_NOT_VALID",
    )
}

private fun lifecycleInverseValid(
    actionType: String,
    currentState: String,
): Boolean =
    when (actionType) {
        "OPENED", "REOPENED" -> currentState == "OPEN"
        "CLOSED", "UNPUBLISHED" -> currentState == "CLOSED"
        "PUBLISHED" -> currentState == "PUBLISHED"
        "RETURNED_TO_DRAFT" -> currentState == "DRAFT"
        else -> false
    }

private data class AuditTransitionJson(
    val membershipId: String,
    val from: String,
    val to: String,
)
