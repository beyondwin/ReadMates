package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.model.HostOperatingRoomCandidate
import com.readmates.session.application.model.HostOperatingRoomCandidateState
import com.readmates.session.application.port.out.HostOperatingRoomCandidateQueryPort
import com.readmates.shared.db.dbString
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.util.UUID

@Repository
class HostOperatingRoomCandidateQueries(
    private val jdbcTemplate: JdbcTemplate,
) : HostOperatingRoomCandidateQueryPort {
    override fun loadHostOperatingRoomCandidates(
        clubId: UUID,
        evaluatedAt: LocalDateTime,
    ): List<HostOperatingRoomCandidate> =
        jdbcTemplate.query(
            LOAD_CANDIDATES_SQL,
            { resultSet, _ ->
                HostOperatingRoomCandidate(
                    sessionId = resultSet.uuid("id"),
                    state = HostOperatingRoomCandidateState.valueOf(resultSet.getString("state")),
                    meetingDate = resultSet.getObject("session_date", LocalDate::class.java),
                    startTime = resultSet.getObject("start_time", LocalTime::class.java),
                    sessionNumber = resultSet.getInt("number"),
                    scheduleSeenAvailable = resultSet.getBoolean("schedule_seen_available"),
                )
            },
            clubId.dbString(),
            evaluatedAt.toLocalDate(),
            evaluatedAt.toLocalDate(),
            evaluatedAt.toLocalTime(),
        )

    private companion object {
        val LOAD_CANDIDATES_SQL =
            """
            select
              sessions.id,
              sessions.state,
              sessions.session_date,
              sessions.start_time,
              sessions.number,
              case
                when (
                  sessions.state = 'OPEN'
                  or (
                    sessions.state = 'DRAFT'
                    and sessions.access_scope = 'GUEST_READABLE'
                    and sessions.participant_set_revision > 0
                  )
                ) and exists (
                  select 1
                  from session_participants
                  where session_participants.club_id = sessions.club_id
                    and session_participants.session_id = sessions.id
                    and session_participants.participation_status = 'ACTIVE'
                ) then true
                else false
              end as schedule_seen_available,
              case sessions.state
                when 'OPEN' then 0
                when 'DRAFT' then 1
                else 2
              end as candidate_rank
            from active_sessions sessions
            where sessions.club_id = ?
              and (
                sessions.state = 'OPEN'
                or sessions.state = 'CLOSED'
                or (
                  sessions.state = 'DRAFT'
                  and (
                    sessions.session_date > ?
                    or (sessions.session_date = ? and sessions.start_time >= ?)
                  )
                )
              )
            order by
              candidate_rank asc,
              case when sessions.state = 'OPEN' then sessions.number end desc,
              case when sessions.state = 'DRAFT' then sessions.session_date end asc,
              case when sessions.state = 'DRAFT' then sessions.start_time end asc,
              case when sessions.state = 'DRAFT' then sessions.number end asc,
              case when sessions.state = 'DRAFT' then sessions.id end asc,
              case when sessions.state = 'CLOSED' then sessions.session_date end desc,
              case when sessions.state = 'CLOSED' then sessions.start_time end desc,
              case when sessions.state = 'CLOSED' then sessions.number end desc,
              case when sessions.state = 'CLOSED' then sessions.id end desc
            """.trimIndent()
    }
}
