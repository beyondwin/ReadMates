package com.readmates.auth.application

import com.readmates.auth.application.port.`in`.GetPendingApprovalUseCase
import com.readmates.shared.db.dbString
import com.readmates.shared.security.CurrentMember
import org.springframework.beans.factory.ObjectProvider
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException
import java.sql.ResultSet
import java.time.LocalDate

data class PendingApprovalAppResponse(
    val approvalState: String,
    val clubName: String,
    val currentSession: PendingCurrentSessionResponse?,
)

data class PendingCurrentSessionResponse(
    val sessionId: String,
    val sessionNumber: Int,
    val title: String,
    val bookTitle: String,
    val bookAuthor: String,
    val date: String,
    val locationLabel: String,
)

@Service
class PendingApprovalReadService(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) : GetPendingApprovalUseCase {
    override fun get(member: CurrentMember): PendingApprovalAppResponse {
        if (!member.isViewer) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Pending approval required")
        }

        val jdbcTemplate = jdbcTemplateProvider.ifAvailable
            ?: throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Pending approval storage is unavailable")

        return jdbcTemplate.query(
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
            { resultSet, _ -> resultSet.toPendingApprovalAppResponse() },
            member.clubId.dbString(),
        ).firstOrNull()
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Club not found")
    }

    private fun ResultSet.toPendingApprovalAppResponse(): PendingApprovalAppResponse {
        val sessionId = getString("session_id")
        return PendingApprovalAppResponse(
            approvalState = "VIEWER",
            clubName = getString("club_name"),
            currentSession = sessionId?.let {
                PendingCurrentSessionResponse(
                    sessionId = it,
                    sessionNumber = getInt("session_number"),
                    title = getString("title"),
                    bookTitle = getString("book_title"),
                    bookAuthor = getString("book_author"),
                    date = getObject("session_date", LocalDate::class.java).toString(),
                    locationLabel = getString("location_label"),
                )
            },
        )
    }
}
