package com.readmates.hostworkspace.adapter.out.persistence

import com.readmates.hostworkspace.application.model.HostPersonAttendanceItem
import com.readmates.hostworkspace.application.model.HostPersonAttendanceStatus
import com.readmates.hostworkspace.application.model.HostPersonAttendanceTuple
import com.readmates.hostworkspace.application.model.HostPersonDetailProjection
import com.readmates.hostworkspace.application.model.HostPersonDetailQuery
import com.readmates.hostworkspace.application.model.HostPersonInvalidCursorException
import com.readmates.hostworkspace.application.model.HostPersonMembershipRole
import com.readmates.hostworkspace.application.model.HostPersonMembershipStatus
import com.readmates.hostworkspace.application.model.HostPersonRsvpStatus
import com.readmates.hostworkspace.application.model.HostPersonSchedule
import com.readmates.hostworkspace.application.port.out.HostPersonDetailQueryPort
import com.readmates.shared.db.dbString
import com.readmates.shared.db.utcOffsetDateTimeOrNull
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.sql.ResultSet
import java.sql.Timestamp
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.util.HexFormat

@Repository
class JdbcHostPersonDetailAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : HostPersonDetailQueryPort {
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    override fun load(query: HostPersonDetailQuery): HostPersonDetailProjection? {
        val header =
            jdbcTemplate
                .query(
                    HEADER_SQL,
                    { resultSet, _ -> resultSet.toHeader() },
                    query.clubId.dbString(),
                    query.targetMembershipId.dbString(),
                ).firstOrNull() ?: return null
        val fingerprint = loadAttendanceHistoryFingerprint(query, header)
        if (query.expectedHistoryFingerprint?.let { it != fingerprint } == true) {
            throw HostPersonInvalidCursorException()
        }
        return header.copy(
            attendanceItems = loadAttendance(query),
            attendanceHistoryFingerprint = fingerprint,
        )
    }

    private fun loadAttendanceHistoryFingerprint(
        query: HostPersonDetailQuery,
        header: HostPersonDetailProjection,
    ): String {
        val digest = MessageDigest.getInstance("SHA-256")
        digest.append(FINGERPRINT_DOMAIN)
        digest.append(header.membershipId)
        digest.append(header.status)
        digest.append(header.role)
        jdbcTemplate.query(
            FINGERPRINT_SQL,
            { resultSet ->
                FINGERPRINT_COLUMNS.forEach { column -> digest.append(resultSet.getString(column)) }
            },
            query.clubId.dbString(),
            query.targetMembershipId.dbString(),
            Timestamp.from(query.evaluatedAt),
            Timestamp.from(query.evaluatedAt),
        )
        return HexFormat.of().formatHex(digest.digest())
    }

    private fun loadAttendance(query: HostPersonDetailQuery): List<HostPersonAttendanceItem> {
        val after = query.after
        val cursorPredicate =
            if (after == null) {
                ""
            } else {
                """
                and (
                  timestamp(s.session_date, s.start_time) < ?
                  or (timestamp(s.session_date, s.start_time) = ? and s.number < ?)
                  or (timestamp(s.session_date, s.start_time) = ? and s.number = ? and s.id < ?)
                )
                """.trimIndent()
            }
        val args =
            mutableListOf<Any>(
                query.clubId.dbString(),
                query.targetMembershipId.dbString(),
                Timestamp.from(query.evaluatedAt),
                Timestamp.from(query.evaluatedAt),
            )
        if (after != null) {
            val timestamp = Timestamp.valueOf(after.scheduledAt)
            args.addAll(
                listOf(
                    timestamp,
                    timestamp,
                    after.sessionNumber,
                    timestamp,
                    after.sessionNumber,
                    after.sessionId.dbString(),
                ),
            )
        }
        args.add(query.fetchLimit)
        return jdbcTemplate.query(
            """
            select s.id, s.number, s.session_date, s.start_time, sp.attendance_status
            from session_participants sp
            join active_sessions s on s.id = sp.session_id and s.club_id = sp.club_id
            where sp.club_id = ?
              and sp.membership_id = ?
              and sp.created_at <= ?
              and sp.participation_status = 'ACTIVE'
              and s.state in ('CLOSED', 'PUBLISHED')
              and s.created_at <= ?
              $cursorPredicate
            order by timestamp(s.session_date, s.start_time) desc, s.number desc, s.id desc
            limit ?
            """.trimIndent(),
            { resultSet, _ -> resultSet.toAttendance() },
            *args.toTypedArray(),
        )
    }

    private fun ResultSet.toHeader(): HostPersonDetailProjection {
        val status = HostPersonMembershipStatus.valueOf(getString("membership_status"))
        val scheduleDate = getObject("session_date", LocalDate::class.java)
        val scheduleTime = getObject("start_time", LocalTime::class.java)
        return HostPersonDetailProjection(
            membershipId = uuid("membership_id"),
            displayName = getString("display_name"),
            avatarKey = getString("avatar_key"),
            status = status,
            role = HostPersonMembershipRole.valueOf(getString("membership_role")),
            lastClubAccessAt = utcOffsetDateTimeOrNull("last_access_at")?.toInstant(),
            currentSchedule =
                if (scheduleDate == null || scheduleTime == null) {
                    null
                } else {
                    HostPersonSchedule(
                        state = getString("session_state"),
                        scheduleRevision = getLong("schedule_revision"),
                        scheduledAt = LocalDateTime.of(scheduleDate, scheduleTime),
                    )
                },
            currentRsvp = getString("rsvp_status")?.let(HostPersonRsvpStatus::valueOf),
            attendanceItems = emptyList(),
            attendanceHistoryFingerprint = "",
        )
    }

    private fun ResultSet.toAttendance(): HostPersonAttendanceItem {
        val tuple =
            HostPersonAttendanceTuple(
                scheduledAt =
                    LocalDateTime.of(
                        getObject("session_date", LocalDate::class.java),
                        getObject("start_time", LocalTime::class.java),
                    ),
                sessionNumber = getInt("number"),
                sessionId = uuid("id"),
            )
        return HostPersonAttendanceItem(
            sessionNumber = tuple.sessionNumber,
            scheduledAt = tuple.scheduledAt,
            attendanceStatus = HostPersonAttendanceStatus.valueOf(getString("attendance_status")),
            tuple = tuple,
        )
    }

    private companion object {
        const val FINGERPRINT_DOMAIN = "readmates:host-person-attendance-history:v1"
        val FINGERPRINT_COLUMNS =
            listOf(
                "session_id",
                "session_number",
                "session_state",
                "session_date",
                "start_time",
                "deleted_at",
                "session_revision",
                "schedule_revision",
                "participant_id",
                "participation_status",
                "attendance_status",
                "attendance_revision",
            )
        val FINGERPRINT_SQL =
            """
            select
              s.id session_id,
              s.number session_number,
              s.state session_state,
              s.session_date,
              s.start_time,
              s.deleted_at,
              s.session_revision,
              s.schedule_revision,
              sp.id participant_id,
              sp.participation_status,
              sp.attendance_status,
              sp.attendance_revision
            from active_sessions s
            join session_participants sp on sp.club_id = s.club_id and sp.session_id = s.id
            where s.club_id = ?
              and sp.membership_id = ?
              and s.created_at <= ?
              and sp.created_at <= ?
            order by s.id, sp.id
            """.trimIndent()
        val HEADER_SQL =
            """
            select
              m.id membership_id,
              coalesce(m.short_name, '멤버') display_name,
              m.avatar_key,
              m.status membership_status,
              m.role membership_role,
              a.last_access_at,
              current_session.state session_state,
              current_session.schedule_revision,
              current_session.session_date,
              current_session.start_time,
              current_session.rsvp_status
            from memberships m
            left join membership_club_access a on a.club_id = m.club_id and a.membership_id = m.id
            left join (
              select
                s.club_id, s.state, s.schedule_revision, s.session_date, s.start_time,
                sp.membership_id, sp.rsvp_status
              from active_sessions s
              join session_participants sp on sp.club_id = s.club_id and sp.session_id = s.id
              where s.state = 'OPEN' and sp.participation_status = 'ACTIVE'
                and s.number = (
                  select max(s2.number) from active_sessions s2 where s2.club_id = s.club_id and s2.state = 'OPEN'
                )
            ) current_session
              on current_session.club_id = m.club_id and current_session.membership_id = m.id
            where m.club_id = ? and m.id = ?
            """.trimIndent()
    }
}

private fun MessageDigest.append(value: Any?) {
    val bytes = (value?.toString() ?: "<null>").toByteArray(StandardCharsets.UTF_8)
    update(ByteBuffer.allocate(Int.SIZE_BYTES).putInt(bytes.size).array())
    update(bytes)
}
