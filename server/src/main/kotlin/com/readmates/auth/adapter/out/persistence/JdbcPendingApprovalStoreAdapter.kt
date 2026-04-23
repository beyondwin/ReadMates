package com.readmates.auth.adapter.out.persistence

import com.readmates.auth.application.port.out.PendingApprovalRow
import com.readmates.auth.application.port.out.PendingApprovalStorePort
import com.readmates.shared.db.dbString
import com.readmates.shared.db.uuid
import org.springframework.beans.factory.ObjectProvider
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.web.server.ResponseStatusException
import java.time.LocalDate
import java.util.UUID

@Repository
class JdbcPendingApprovalStoreAdapter(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) : PendingApprovalStorePort {
    override fun findPendingApproval(clubId: UUID): PendingApprovalRow? =
        jdbcTemplate().query(
            """
            select
              clubs.name as club_name,
              sessions.id as session_id,
              sessions.number as session_number,
              sessions.title,
              sessions.book_title,
              sessions.book_author,
              sessions.session_date,
              sessions.location_label
            from clubs
            left join sessions on sessions.club_id = clubs.id
              and sessions.state in ('OPEN', 'PUBLISHED')
            where clubs.id = ?
            order by sessions.number desc
            limit 1
            """.trimIndent(),
            { resultSet, _ ->
                val sessionId = resultSet.getString("session_id")
                PendingApprovalRow(
                    clubName = resultSet.getString("club_name"),
                    sessionId = sessionId?.let { resultSet.uuid("session_id") },
                    sessionNumber = sessionId?.let { resultSet.getInt("session_number") },
                    title = resultSet.getString("title"),
                    bookTitle = resultSet.getString("book_title"),
                    bookAuthor = resultSet.getString("book_author"),
                    sessionDate = resultSet.getObject("session_date", LocalDate::class.java),
                    locationLabel = resultSet.getString("location_label"),
                )
            },
            clubId.dbString(),
        ).firstOrNull()

    private fun jdbcTemplate(): JdbcTemplate =
        jdbcTemplateProvider.ifAvailable
            ?: throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Pending approval storage is unavailable")
}
