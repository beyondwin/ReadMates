package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.port.out.HostScheduleSeenWorkSourceQuery
import com.readmates.session.application.port.out.HostScheduleSeenWorkSourceQueryPort
import com.readmates.session.application.port.out.HostScheduleSeenWorkSourceQueryResult
import com.readmates.session.application.port.out.HostScheduleSeenWorkSourceRow
import com.readmates.shared.db.dbString
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository

@Repository
class JdbcHostScheduleSeenWorkSourceAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : HostScheduleSeenWorkSourceQueryPort {
    override fun load(query: HostScheduleSeenWorkSourceQuery): HostScheduleSeenWorkSourceQueryResult =
        HostScheduleSeenWorkSourceQueryResult.Available(
            jdbcTemplate.query(
                """
                select s.id, s.schedule_revision,
                       count(sp.id) eligible_count,
                       sum(case when sp.seen_schedule_revision = s.schedule_revision then 1 else 0 end) exact_seen_count,
                       case when count(sp.id) > 0 and
                                      sum(case when sp.seen_schedule_revision = s.schedule_revision then 1 else 0 end) = count(sp.id)
                            then max(case when sp.seen_schedule_revision = s.schedule_revision then sp.seen_schedule_at end)
                       end exact_resolved_at,
                       timestamp(s.session_date, s.start_time) due_at
                from active_sessions s
                join session_participants sp on sp.club_id = s.club_id and sp.session_id = s.id
                  and sp.participation_status = 'ACTIVE'
                where s.club_id = ? and s.state in ('DRAFT', 'OPEN')
                group by s.id, s.schedule_revision, s.session_date, s.start_time
                """.trimIndent(),
                { rs, _ ->
                    HostScheduleSeenWorkSourceRow(
                        sessionId = rs.uuid("id"),
                        scheduleRevision = rs.getLong("schedule_revision"),
                        eligibleCount = rs.getInt("eligible_count"),
                        exactRevisionSeenCount = rs.getInt("exact_seen_count"),
                        exactRevisionResolvedAt =
                            rs
                                .getTimestamp("exact_resolved_at")
                                ?.toLocalDateTime()
                                ?.atOffset(java.time.ZoneOffset.UTC),
                        dueAt = rs.utcOffsetDateTime("due_at"),
                        dispatchId = null,
                        dispatchStatus = null,
                        dispatchTargetCount = null,
                        dispatchDeliveryCount = null,
                    )
                },
                query.clubId.dbString(),
            ),
        )
}
