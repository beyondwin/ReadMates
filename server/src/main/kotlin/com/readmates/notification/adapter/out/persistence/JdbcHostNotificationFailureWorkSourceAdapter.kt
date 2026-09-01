package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.port.out.HostNotificationFailureWorkSourceQuery
import com.readmates.notification.application.port.out.HostNotificationFailureWorkSourceQueryPort
import com.readmates.notification.application.port.out.HostNotificationFailureWorkSourceQueryResult
import com.readmates.notification.application.port.out.HostNotificationFailureWorkSourceRow
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository

@Repository
class JdbcHostNotificationFailureWorkSourceAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : HostNotificationFailureWorkSourceQueryPort {
    override fun load(query: HostNotificationFailureWorkSourceQuery): HostNotificationFailureWorkSourceQueryResult =
        HostNotificationFailureWorkSourceQueryResult.Available(
            jdbcTemplate.query(
                """
                select d.id, d.attempt_count, e.event_type, d.channel, d.status, d.next_attempt_at,
                       d.updated_at failure_at,
                       case when d.status in ('SENT','SKIPPED') then d.updated_at end resolved_at,
                       case when d.status in ('FAILED','DEAD') then 'DELIVERY_FAILED' end safe_error_code
                from notification_deliveries d
                join notification_event_outbox e on e.id=d.event_id and e.club_id=d.club_id
                where d.club_id = ? and d.attempt_count > 0
                  and (d.status in ('FAILED','DEAD') or (d.status in ('SENT','SKIPPED') and d.updated_at >= ?))
                order by d.updated_at, d.id
                """.trimIndent(),
                { rs, _ ->
                    HostNotificationFailureWorkSourceRow(
                        rs.uuid("id"),
                        rs.getInt("attempt_count"),
                        rs.getString("event_type"),
                        rs.getString("channel"),
                        rs.getString("status"),
                        rs.utcOffsetDateTime("next_attempt_at"),
                        rs.utcOffsetDateTime("failure_at"),
                        rs
                            .getTimestamp("resolved_at")
                            ?.toLocalDateTime()
                            ?.atOffset(java.time.ZoneOffset.UTC),
                        rs.getString("safe_error_code"),
                    )
                },
                query.clubId.dbString(),
                query.completedSince.toUtcLocalDateTime(),
            ),
        )
}
