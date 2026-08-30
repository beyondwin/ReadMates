package com.readmates.sessionclosing.adapter.out.persistence

import com.readmates.sessionclosing.application.port.out.HostRecordClosingWorkSourceQuery
import com.readmates.sessionclosing.application.port.out.HostRecordClosingWorkSourceQueryPort
import com.readmates.sessionclosing.application.port.out.HostRecordClosingWorkSourceQueryResult
import com.readmates.sessionclosing.application.port.out.HostRecordClosingWorkSourceRow
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class JdbcHostRecordClosingWorkSourceAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : HostRecordClosingWorkSourceQueryPort {
    override fun load(query: HostRecordClosingWorkSourceQuery): HostRecordClosingWorkSourceQueryResult =
        HostRecordClosingWorkSourceQueryResult.Available(
            jdbcTemplate.query(
                """
                select s.id,
                       sha2(concat_ws(':', s.session_revision, s.participant_set_revision, s.schedule_revision,
                         coalesce((select max(r.version) from session_record_revisions r where r.club_id=s.club_id and r.session_id=s.id), 0),
                         coalesce(p.updated_at, '1970-01-01 00:00:00.000000'), coalesce(p.site_visibility, 'HIDDEN')), 256) source_generation,
                       case when s.state = 'CLOSED' then true else false end actionable,
                       timestamp(s.session_date, s.end_time) due_at,
                       case when s.state = 'PUBLISHED' then coalesce(p.published_at, s.updated_at) end resolved_at,
                       (select ar.id from session_record_apply_receipts ar where ar.club_id=s.club_id and ar.session_id=s.id order by ar.created_at desc limit 1) receipt_id,
                       case when s.state = 'PUBLISHED' then 'PUBLISHED' end receipt_state
                from active_sessions s
                left join public_session_publications p on p.club_id=s.club_id and p.session_id=s.id
                where s.club_id = ? and s.state in ('CLOSED','PUBLISHED')
                  and (s.state='CLOSED' or coalesce(p.published_at, s.updated_at) >= ?)
                order by s.number, s.id
                """.trimIndent(),
                { rs, _ ->
                    HostRecordClosingWorkSourceRow(
                        rs.uuid("id"),
                        rs.getString("source_generation"),
                        rs.getBoolean("actionable"),
                        rs.utcOffsetDateTime("due_at"),
                        rs
                            .getTimestamp("resolved_at")
                            ?.toLocalDateTime()
                            ?.atOffset(java.time.ZoneOffset.UTC),
                        rs.getString("receipt_id")?.let(UUID::fromString),
                        rs.getString("receipt_state"),
                        rs.getString("receipt_state")?.let { "기록 공개 완료" },
                    )
                },
                query.clubId.dbString(),
                query.completedSince.toUtcLocalDateTime(),
            ),
        )
}
