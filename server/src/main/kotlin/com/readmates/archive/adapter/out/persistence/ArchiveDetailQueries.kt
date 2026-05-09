package com.readmates.archive.adapter.out.persistence

import com.readmates.archive.application.model.ArchiveSessionDetailHeader
import com.readmates.shared.db.dbString
import com.readmates.shared.db.uuid
import com.readmates.shared.security.CurrentMember
import org.springframework.jdbc.core.JdbcTemplate
import java.time.LocalDate
import java.util.UUID

internal class ArchiveDetailQueries {
    fun loadArchiveSessionDetail(
        jdbcTemplate: JdbcTemplate,
        currentMember: CurrentMember,
        sessionId: UUID,
    ): ArchiveSessionDetailHeader? =
        jdbcTemplate.query(
            """
            select
              sessions.id,
              sessions.number,
              sessions.title,
              sessions.book_title,
              sessions.book_author,
              sessions.book_image_url,
              sessions.session_date,
              sessions.state,
              sessions.location_label,
              (
                select count(*)
                from session_participants
                where session_participants.session_id = sessions.id
                  and session_participants.club_id = sessions.club_id
                  and session_participants.attendance_status = 'ATTENDED'
                  and session_participants.participation_status = 'ACTIVE'
              ) as attendance,
              (
                select count(*)
                from session_participants
                where session_participants.session_id = sessions.id
                  and session_participants.club_id = sessions.club_id
                  and session_participants.participation_status = 'ACTIVE'
              ) as total,
              current_participant.attendance_status as my_attendance_status,
              case
                when public_session_publications.visibility in ('MEMBER', 'PUBLIC')
                  then public_session_publications.public_summary
                else null
              end as public_summary
            from sessions
            left join session_participants current_participant on current_participant.session_id = sessions.id
              and current_participant.club_id = sessions.club_id
              and current_participant.membership_id = ?
              and current_participant.participation_status = 'ACTIVE'
            left join public_session_publications on public_session_publications.session_id = sessions.id
              and public_session_publications.club_id = sessions.club_id
            where sessions.id = ?
              and sessions.club_id = ?
              and sessions.state in ('CLOSED', 'PUBLISHED')
              and sessions.visibility in ('MEMBER', 'PUBLIC')
            """.trimIndent(),
            { resultSet, _ ->
                ArchiveSessionDetailHeader(
                    sessionId = resultSet.uuid("id").toString(),
                    sessionNumber = resultSet.getInt("number"),
                    title = resultSet.getString("title"),
                    bookTitle = resultSet.getString("book_title"),
                    bookAuthor = resultSet.getString("book_author"),
                    bookImageUrl = resultSet.getString("book_image_url"),
                    date = resultSet.getObject("session_date", LocalDate::class.java).toString(),
                    locationLabel = resultSet.getString("location_label"),
                    attendance = resultSet.getInt("attendance"),
                    total = resultSet.getInt("total"),
                    state = resultSet.getString("state"),
                    myAttendanceStatus = resultSet.getString("my_attendance_status"),
                    isHost = currentMember.isHost,
                    publicSummary = resultSet.getString("public_summary"),
                )
            },
            currentMember.membershipId.dbString(),
            sessionId.dbString(),
            currentMember.clubId.dbString(),
        ).firstOrNull()
}
