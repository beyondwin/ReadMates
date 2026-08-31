package com.readmates.auth.adapter.out.persistence

import com.readmates.auth.application.port.out.HostInvitationExpiryWorkSourceQuery
import com.readmates.auth.application.port.out.HostInvitationExpiryWorkSourceQueryPort
import com.readmates.auth.application.port.out.HostInvitationExpiryWorkSourceQueryResult
import com.readmates.auth.application.port.out.HostInvitationExpiryWorkSourceRow
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.time.OffsetDateTime

@Repository
class JdbcHostInvitationExpiryWorkSourceAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : HostInvitationExpiryWorkSourceQueryPort {
    override fun load(query: HostInvitationExpiryWorkSourceQuery): HostInvitationExpiryWorkSourceQueryResult =
        HostInvitationExpiryWorkSourceQueryResult.Available(
            loadCurrentRevision(query) + loadResolvedRevisions(query),
        )

    private fun loadCurrentRevision(query: HostInvitationExpiryWorkSourceQuery) =
        jdbcTemplate.query(
            """
            select l.id, l.revision, l.status, l.used_count, l.max_uses, l.expires_at,
                   case when l.expires_at <= ? then l.expires_at end audit_at,
                   case when l.expires_at <= ? then 'EXPIRED' end receipt_action
            from host_invitation_links l
            where l.club_id = ?
              and l.status = 'ACTIVE' and l.used_count < l.max_uses
              and l.expires_at <= ?
            order by l.expires_at, l.id
            """.trimIndent(),
            { rs, _ ->
                row(
                    rs.uuid("id"),
                    rs.getLong("revision"),
                    rs.getString("status"),
                    rs.getInt("used_count"),
                    rs.getInt("max_uses"),
                    rs.utcOffsetDateTime("expires_at"),
                    rs
                        .getTimestamp("audit_at")
                        ?.toLocalDateTime()
                        ?.atOffset(java.time.ZoneOffset.UTC),
                    rs.getString("receipt_action"),
                )
            },
            query.evaluatedAt.toUtcLocalDateTime(),
            query.evaluatedAt.toUtcLocalDateTime(),
            query.clubId.dbString(),
            query.evaluatedAt.plusDays(EXPIRY_WINDOW_DAYS).toUtcLocalDateTime(),
        )

    private fun loadResolvedRevisions(query: HostInvitationExpiryWorkSourceQuery) =
        jdbcTemplate.query(
            """
            select e.link_id, e.revision - 1 old_revision,
                   json_unquote(json_extract(e.before_settings_json, '$.status')) old_status,
                   coalesce(json_unquote(json_extract(e.before_settings_json, '$.usedCount')), l.used_count) old_used_count,
                   json_unquote(json_extract(e.before_settings_json, '$.maxUses')) old_max_uses,
                   json_unquote(json_extract(e.before_settings_json, '$.expiresAt')) old_expires_at,
                   e.occurred_at audit_at, e.action receipt_action
            from host_invitation_link_events e
            join host_invitation_links l on l.id = e.link_id and l.club_id = e.club_id
            where e.club_id = ? and e.revision > 0 and e.occurred_at >= ?
              and json_unquote(json_extract(e.before_settings_json, '$.status')) = 'ACTIVE'
              and (
                json_unquote(json_extract(e.after_settings_json, '$.status')) <> 'ACTIVE'
                or json_unquote(json_extract(e.after_settings_json, '$.expiresAt')) <>
                   json_unquote(json_extract(e.before_settings_json, '$.expiresAt'))
              )
            order by e.occurred_at, e.id
            """.trimIndent(),
            { rs, _ ->
                row(
                    rs.uuid("link_id"),
                    rs.getLong("old_revision"),
                    rs.getString("old_status"),
                    rs.getInt("old_used_count"),
                    rs.getInt("old_max_uses"),
                    OffsetDateTime.parse(rs.getString("old_expires_at")),
                    rs.utcOffsetDateTime("audit_at"),
                    rs.getString("receipt_action"),
                )
            },
            query.clubId.dbString(),
            query.completedSince.toUtcLocalDateTime(),
        )

    private fun row(
        linkId: java.util.UUID,
        revision: Long,
        status: String,
        usedCount: Int,
        maxUses: Int,
        expiresAt: OffsetDateTime,
        auditAt: OffsetDateTime?,
        receiptAction: String?,
    ) = HostInvitationExpiryWorkSourceRow(
        linkId,
        revision,
        status,
        usedCount,
        maxUses,
        expiresAt,
        auditAt,
        receiptAction,
    )

    private companion object {
        const val EXPIRY_WINDOW_DAYS = 7L
    }
}
