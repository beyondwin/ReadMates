package com.readmates.session.application

import com.readmates.shared.db.dbString
import com.readmates.shared.db.uuid
import com.readmates.shared.security.CurrentMember
import org.springframework.beans.factory.ObjectProvider
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

private data class HostSessionDeletionTarget(
    val sessionId: UUID,
    val sessionNumber: Int,
    val title: String,
    val state: String,
)

@Repository
class HostSessionDeletionRepository(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) {
    fun previewOpenSessionDeletion(member: CurrentMember, sessionId: UUID): HostSessionDeletionPreviewResponse {
        requireHost(member)
        val jdbcTemplate = jdbcTemplate()
        val target = findDeletionTarget(jdbcTemplate, member, sessionId, lock = false)
        requireOpenDeletionTarget(target)

        return HostSessionDeletionPreviewResponse(
            sessionId = target.sessionId.toString(),
            sessionNumber = target.sessionNumber,
            title = target.title,
            state = target.state,
            canDelete = true,
            counts = countSessionDeletionRows(jdbcTemplate, member.clubId, sessionId),
        )
    }

    @Transactional
    fun deleteOpenHostSession(member: CurrentMember, sessionId: UUID): HostSessionDeletionResponse {
        requireHost(member)
        val jdbcTemplate = jdbcTemplate()
        val target = findDeletionTarget(jdbcTemplate, member, sessionId, lock = true)
        requireOpenDeletionTarget(target)
        val counts = countSessionDeletionRows(jdbcTemplate, member.clubId, sessionId)

        deleteSessionOwnedRows(jdbcTemplate, member.clubId, sessionId)

        val deletedSessions = jdbcTemplate.update(
            """
            delete from sessions
            where id = ?
              and club_id = ?
              and state = 'OPEN'
            """.trimIndent(),
            sessionId.dbString(),
            member.clubId.dbString(),
        )
        if (deletedSessions == 0) {
            throw HostSessionNotFoundException()
        }

        return HostSessionDeletionResponse(
            sessionId = target.sessionId.toString(),
            sessionNumber = target.sessionNumber,
            deleted = true,
            counts = counts,
        )
    }

    private fun findDeletionTarget(
        jdbcTemplate: JdbcTemplate,
        member: CurrentMember,
        sessionId: UUID,
        lock: Boolean,
    ): HostSessionDeletionTarget {
        val lockClause = if (lock) "for update" else ""
        return jdbcTemplate.query(
            """
            select id, number, title, state
            from sessions
            where id = ?
              and club_id = ?
            $lockClause
            """.trimIndent(),
            { resultSet, _ ->
                HostSessionDeletionTarget(
                    sessionId = resultSet.uuid("id"),
                    sessionNumber = resultSet.getInt("number"),
                    title = resultSet.getString("title"),
                    state = resultSet.getString("state"),
                )
            },
            sessionId.dbString(),
            member.clubId.dbString(),
        ).firstOrNull() ?: throw HostSessionNotFoundException()
    }

    private fun requireOpenDeletionTarget(target: HostSessionDeletionTarget) {
        if (target.state != "OPEN") {
            throw HostSessionDeletionNotAllowedException()
        }
    }

    private fun countSessionDeletionRows(
        jdbcTemplate: JdbcTemplate,
        clubId: UUID,
        sessionId: UUID,
    ): HostSessionDeletionCounts =
        HostSessionDeletionCounts(
            participants = countSessionRows(
                jdbcTemplate,
                "select count(*) from session_participants where club_id = ? and session_id = ?",
                clubId,
                sessionId,
            ),
            rsvpResponses = jdbcTemplate.queryForObject(
                """
                select count(*)
                from session_participants
                where club_id = ?
                  and session_id = ?
                  and rsvp_status <> 'NO_RESPONSE'
                """.trimIndent(),
                Int::class.java,
                clubId.dbString(),
                sessionId.dbString(),
            ) ?: 0,
            questions = countSessionRows(
                jdbcTemplate,
                "select count(*) from questions where club_id = ? and session_id = ?",
                clubId,
                sessionId,
            ),
            checkins = countSessionRows(
                jdbcTemplate,
                "select count(*) from reading_checkins where club_id = ? and session_id = ?",
                clubId,
                sessionId,
            ),
            oneLineReviews = countSessionRows(
                jdbcTemplate,
                "select count(*) from one_line_reviews where club_id = ? and session_id = ?",
                clubId,
                sessionId,
            ),
            longReviews = countSessionRows(
                jdbcTemplate,
                "select count(*) from long_reviews where club_id = ? and session_id = ?",
                clubId,
                sessionId,
            ),
            highlights = countSessionRows(
                jdbcTemplate,
                "select count(*) from highlights where club_id = ? and session_id = ?",
                clubId,
                sessionId,
            ),
            publications = countSessionRows(
                jdbcTemplate,
                "select count(*) from public_session_publications where club_id = ? and session_id = ?",
                clubId,
                sessionId,
            ),
            feedbackReports = countSessionRows(
                jdbcTemplate,
                "select count(*) from feedback_reports where club_id = ? and session_id = ?",
                clubId,
                sessionId,
            ),
            feedbackDocuments = countSessionRows(
                jdbcTemplate,
                "select count(*) from session_feedback_documents where club_id = ? and session_id = ?",
                clubId,
                sessionId,
            ),
        )

    private fun countSessionRows(
        jdbcTemplate: JdbcTemplate,
        sql: String,
        clubId: UUID,
        sessionId: UUID,
    ): Int =
        jdbcTemplate.queryForObject(
            sql,
            Int::class.java,
            clubId.dbString(),
            sessionId.dbString(),
        ) ?: 0

    private fun deleteSessionOwnedRows(
        jdbcTemplate: JdbcTemplate,
        clubId: UUID,
        sessionId: UUID,
    ) {
        jdbcTemplate.update("delete from feedback_reports where club_id = ? and session_id = ?", clubId.dbString(), sessionId.dbString())
        jdbcTemplate.update("delete from session_feedback_documents where club_id = ? and session_id = ?", clubId.dbString(), sessionId.dbString())
        jdbcTemplate.update("delete from public_session_publications where club_id = ? and session_id = ?", clubId.dbString(), sessionId.dbString())
        jdbcTemplate.update("delete from highlights where club_id = ? and session_id = ?", clubId.dbString(), sessionId.dbString())
        jdbcTemplate.update("delete from one_line_reviews where club_id = ? and session_id = ?", clubId.dbString(), sessionId.dbString())
        jdbcTemplate.update("delete from long_reviews where club_id = ? and session_id = ?", clubId.dbString(), sessionId.dbString())
        jdbcTemplate.update("delete from questions where club_id = ? and session_id = ?", clubId.dbString(), sessionId.dbString())
        jdbcTemplate.update("delete from reading_checkins where club_id = ? and session_id = ?", clubId.dbString(), sessionId.dbString())
        jdbcTemplate.update("delete from session_participants where club_id = ? and session_id = ?", clubId.dbString(), sessionId.dbString())
    }

    private fun jdbcTemplate(): JdbcTemplate =
        jdbcTemplateOrThrow(jdbcTemplateProvider)
}
