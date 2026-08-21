package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostSessionDeletionAssessment
import com.readmates.session.application.HostSessionDeletionCounts
import com.readmates.session.application.HostSessionDeletionNotAllowedException
import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.model.HostSessionDeletionTarget
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.hostSessionDeletionBlockers
import com.readmates.session.application.requireHost
import com.readmates.shared.db.dbString
import com.readmates.shared.db.uuid
import com.readmates.shared.security.CurrentMember
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class HostSessionDeletionQueries(
    private val jdbcTemplate: JdbcTemplate,
) {
    fun assess(
        command: HostSessionIdCommand,
        lock: Boolean,
    ): HostSessionDeletionAssessment {
        requireHost(command.host)
        val target = findDeletionTarget(command.host, command.sessionId, lock)
        requireDeletableTarget(target)
        return HostSessionDeletionAssessment(
            target = target,
            blockers = countDeletionBlockers(command.host.clubId, command.sessionId),
            counts = countSessionDeletionRows(command.host.clubId, command.sessionId),
        )
    }

    fun deleteAssessed(
        command: HostSessionIdCommand,
        target: HostSessionDeletionTarget,
    ): Boolean {
        requireHost(command.host)
        check(target.sessionId == command.sessionId)
        deleteSessionOwnedRows(command.host.clubId, command.sessionId)
        val deletedSessions =
            jdbcTemplate.update(
                """
                delete from sessions
                where id = ?
                  and club_id = ?
                  and state in ('OPEN', 'DRAFT')
                """.trimIndent(),
                command.sessionId.dbString(),
                command.host.clubId.dbString(),
            )
        return deletedSessions > 0
    }

    private fun findDeletionTarget(
        member: CurrentMember,
        sessionId: UUID,
        lock: Boolean,
    ): HostSessionDeletionTarget {
        val lockClause = if (lock) "for update" else ""
        return jdbcTemplate
            .query(
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

    private fun requireDeletableTarget(target: HostSessionDeletionTarget) {
        if (target.state != "OPEN" && target.state != "DRAFT") {
            throw HostSessionDeletionNotAllowedException()
        }
    }

    private fun countDeletionBlockers(
        clubId: UUID,
        sessionId: UUID,
    ) = hostSessionDeletionBlockers(
        revisionCount =
            countSessionRows(
                "select count(*) from session_record_revisions where club_id = ? and session_id = ?",
                clubId,
                sessionId,
            ),
        decisionCount =
            countSessionRows(
                "select count(*) from host_action_notification_decisions where club_id = ? and session_id = ?",
                clubId,
                sessionId,
            ),
        manualDispatchCount =
            countSessionRows(
                "select count(*) from notification_manual_dispatches where club_id = ? and session_id = ?",
                clubId,
                sessionId,
            ),
        eventCount =
            countSessionRows(
                """
                select count(*)
                from notification_event_outbox
                where club_id = ?
                  and aggregate_type = 'SESSION'
                  and aggregate_id = ?
                """.trimIndent(),
                clubId,
                sessionId,
            ),
        deliveryCount =
            countSessionRows(
                """
                select count(*)
                from notification_deliveries d
                inner join notification_event_outbox e
                  on e.id = d.event_id and e.club_id = d.club_id
                where e.club_id = ?
                  and e.aggregate_type = 'SESSION'
                  and e.aggregate_id = ?
                """.trimIndent(),
                clubId,
                sessionId,
            ),
        memberNotificationCount =
            countSessionRows(
                """
                select count(*)
                from member_notifications m
                inner join notification_event_outbox e
                  on e.id = m.event_id and e.club_id = m.club_id
                where e.club_id = ?
                  and e.aggregate_type = 'SESSION'
                  and e.aggregate_id = ?
                """.trimIndent(),
                clubId,
                sessionId,
            ),
    )

    private fun countSessionDeletionRows(
        clubId: UUID,
        sessionId: UUID,
    ): HostSessionDeletionCounts =
        HostSessionDeletionCounts(
            participants =
                countSessionRows(
                    "select count(*) from session_participants where club_id = ? and session_id = ?",
                    clubId,
                    sessionId,
                ),
            rsvpResponses =
                jdbcTemplate.queryForObject(
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
            questions =
                countSessionRows(
                    "select count(*) from questions where club_id = ? and session_id = ?",
                    clubId,
                    sessionId,
                ),
            checkins =
                countSessionRows(
                    "select count(*) from reading_checkins where club_id = ? and session_id = ?",
                    clubId,
                    sessionId,
                ),
            oneLineReviews =
                countSessionRows(
                    "select count(*) from one_line_reviews where club_id = ? and session_id = ?",
                    clubId,
                    sessionId,
                ),
            longReviews =
                countSessionRows(
                    "select count(*) from long_reviews where club_id = ? and session_id = ?",
                    clubId,
                    sessionId,
                ),
            highlights =
                countSessionRows(
                    "select count(*) from highlights where club_id = ? and session_id = ?",
                    clubId,
                    sessionId,
                ),
            publications =
                countSessionRows(
                    "select count(*) from public_session_publications where club_id = ? and session_id = ?",
                    clubId,
                    sessionId,
                ),
            feedbackReports =
                countSessionRows(
                    "select count(*) from feedback_reports where club_id = ? and session_id = ?",
                    clubId,
                    sessionId,
                ),
            feedbackDocuments =
                countSessionRows(
                    "select count(*) from session_feedback_documents where club_id = ? and session_id = ?",
                    clubId,
                    sessionId,
                ),
        )

    private fun countSessionRows(
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
        clubId: UUID,
        sessionId: UUID,
    ) {
        // Lifecycle audit and AI provider/job audit are durable evidence, not cleanup targets.
        jdbcTemplate.update(
            "delete from ai_generation_commit_receipts where club_id = ? and session_id = ?",
            clubId.dbString(),
            sessionId.dbString(),
        )
        jdbcTemplate.update(
            "delete from host_action_notification_previews where club_id = ? and session_id = ?",
            clubId.dbString(),
            sessionId.dbString(),
        )
        jdbcTemplate.update(
            "delete from session_record_drafts where club_id = ? and session_id = ?",
            clubId.dbString(),
            sessionId.dbString(),
        )
        jdbcTemplate.update(
            "delete from host_session_change_audit where club_id = ? and session_id = ?",
            clubId.dbString(),
            sessionId.dbString(),
        )
        jdbcTemplate.update("delete from feedback_reports where club_id = ? and session_id = ?", clubId.dbString(), sessionId.dbString())
        jdbcTemplate.update(
            "delete from session_feedback_documents where club_id = ? and session_id = ?",
            clubId.dbString(),
            sessionId.dbString(),
        )
        jdbcTemplate.update(
            "delete from public_session_publications where club_id = ? and session_id = ?",
            clubId.dbString(),
            sessionId.dbString(),
        )
        jdbcTemplate.update("delete from highlights where club_id = ? and session_id = ?", clubId.dbString(), sessionId.dbString())
        jdbcTemplate.update("delete from one_line_reviews where club_id = ? and session_id = ?", clubId.dbString(), sessionId.dbString())
        jdbcTemplate.update("delete from long_reviews where club_id = ? and session_id = ?", clubId.dbString(), sessionId.dbString())
        jdbcTemplate.update("delete from questions where club_id = ? and session_id = ?", clubId.dbString(), sessionId.dbString())
        jdbcTemplate.update("delete from reading_checkins where club_id = ? and session_id = ?", clubId.dbString(), sessionId.dbString())
        jdbcTemplate.update(
            "delete from session_participants where club_id = ? and session_id = ?",
            clubId.dbString(),
            sessionId.dbString(),
        )
    }
}
