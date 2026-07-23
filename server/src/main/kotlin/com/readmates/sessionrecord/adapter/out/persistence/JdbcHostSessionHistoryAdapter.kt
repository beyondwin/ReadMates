package com.readmates.sessionrecord.adapter.out.persistence

import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import com.readmates.sessionrecord.application.model.HostSessionHistoryAttendanceTransition
import com.readmates.sessionrecord.application.model.HostSessionHistoryCursor
import com.readmates.sessionrecord.application.model.HostSessionHistoryItem
import com.readmates.sessionrecord.application.model.HostSessionHistoryType
import com.readmates.sessionrecord.application.model.SessionRecordSource
import com.readmates.sessionrecord.application.port.out.HostSessionHistoryPort
import com.readmates.sessionrecord.application.service.typeSort
import com.readmates.shared.db.dbString
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.security.CurrentMember
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
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
                parameters += cursor.createdAt
                parameters += cursor.createdAt
                parameters += cursor.typeSort
                parameters += cursor.createdAt
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
    )
}

private data class AuditTransitionJson(
    val membershipId: String,
    val from: String,
    val to: String,
)
