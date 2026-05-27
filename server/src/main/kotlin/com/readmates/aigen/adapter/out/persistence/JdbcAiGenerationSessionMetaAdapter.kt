package com.readmates.aigen.adapter.out.persistence

import com.readmates.aigen.application.model.AuthorNameMode
import com.readmates.aigen.application.model.SessionMeta
import com.readmates.aigen.application.port.out.LoadAiGenerationSessionMetaPort
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import java.time.LocalDate
import java.util.UUID

@Component
@ConditionalOnProperty(prefix = "readmates.aigen", name = ["enabled"], havingValue = "true")
class JdbcAiGenerationSessionMetaAdapter(
    private val jdbc: JdbcTemplate,
) : LoadAiGenerationSessionMetaPort {
    override fun load(sessionId: UUID): SessionMeta? {
        val row =
            jdbc
                .queryForList(
                    """
                    select s.club_id, s.number, s.book_title, s.book_author, s.session_date
                    from sessions s
                    where s.id = ?
                    """.trimIndent(),
                    sessionId.toString(),
                ).firstOrNull()
                ?: return null

        val expectedAuthorNames =
            jdbc.queryForList(
                """
                select u.name
                from session_participants sp
                join memberships m on m.id = sp.membership_id
                join users u on u.id = m.user_id
                where sp.session_id = ?
                  and sp.participation_status = 'ACTIVE'
                order by sp.id
                """.trimIndent(),
                String::class.java,
                sessionId.toString(),
            )

        return SessionMeta(
            sessionId = sessionId,
            clubId = UUID.fromString(row["club_id"] as String),
            sessionNumber = (row["number"] as Number).toInt(),
            bookTitle = row["book_title"] as String,
            bookAuthor = row["book_author"] as String?,
            meetingDate = (row["session_date"] as java.sql.Date).toLocalDate() ?: LocalDate.now(),
            expectedAuthorNames = expectedAuthorNames,
            authorNameMode = AuthorNameMode.REAL,
        )
    }
}
