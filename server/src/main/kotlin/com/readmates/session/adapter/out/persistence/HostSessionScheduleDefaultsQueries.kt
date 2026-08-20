package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostSessionScheduleDefaults
import com.readmates.session.application.requireHost
import com.readmates.session.domain.SessionAccessScope
import com.readmates.shared.db.dbString
import com.readmates.shared.security.CurrentMember
import org.springframework.jdbc.core.JdbcTemplate
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime

private const val SCHEDULE_DEFAULTS_SAMPLE_LIMIT = 10

internal class HostSessionScheduleDefaultsQueries {
    fun load(
        jdbcTemplate: JdbcTemplate,
        host: CurrentMember,
    ): HostSessionScheduleDefaults {
        requireHost(host)
        val samples =
            jdbcTemplate.query(
                """
                select session_date, start_time, end_time, location_label, meeting_url, meeting_passcode,
                       access_scope, question_deadline_at
                from sessions
                where club_id = ?
                order by session_date desc, number desc
                limit ?
                """.trimIndent(),
                { resultSet, _ ->
                    HostSessionScheduleSample(
                        sessionDate = resultSet.getObject("session_date", LocalDate::class.java),
                        startTime = resultSet.getObject("start_time", LocalTime::class.java),
                        endTime = resultSet.getObject("end_time", LocalTime::class.java),
                        locationLabel = resultSet.getString("location_label").orEmpty(),
                        meetingUrl = resultSet.getString("meeting_url"),
                        meetingPasscode = resultSet.getString("meeting_passcode"),
                        accessScope = SessionAccessScope.valueOf(resultSet.getString("access_scope")),
                        questionDeadlineAt = resultSet.getObject("question_deadline_at", LocalDateTime::class.java),
                    )
                },
                host.clubId.dbString(),
                SCHEDULE_DEFAULTS_SAMPLE_LIMIT,
            )
        return HostSessionScheduleDefaultsPolicy.from(samples)
    }
}
