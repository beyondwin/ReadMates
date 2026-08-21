package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostSessionDeletionAssessment
import com.readmates.session.application.HostSessionDeletionCounts
import com.readmates.session.application.HostSessionDeletionNotAllowedException
import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.model.HOST_SESSION_TRASH_RETENTION_DAYS
import com.readmates.session.application.model.HostSessionDeletionTarget
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.HostSessionLifecycleAction
import com.readmates.session.application.model.HostSessionTrashPage
import com.readmates.session.application.model.HostSessionTrashPurgeTarget
import com.readmates.session.application.model.HostSessionTrashRecord
import com.readmates.session.application.model.HostSessionTrashResponse
import com.readmates.session.application.model.hostSessionDeletionBlockers
import com.readmates.session.application.requireHost
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import com.readmates.shared.paging.CursorCodec
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.OffsetDateTime
import java.util.UUID

@Repository
@Suppress("TooManyFunctions")
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

    fun moveToTrash(
        command: HostSessionIdCommand,
        target: HostSessionDeletionTarget,
    ): HostSessionTrashRecord {
        requireHost(command.host)
        check(target.sessionId == command.sessionId)
        val updated =
            jdbcTemplate.update(
                """
                update sessions
                set deleted_at = utc_timestamp(6),
                    deleted_by_membership_id = ?,
                    purge_after = date_add(deleted_at, interval $HOST_SESSION_TRASH_RETENTION_DAYS day)
                where id = ?
                  and club_id = ?
                  and deleted_at is null
                  and state in ('OPEN', 'DRAFT')
                """.trimIndent(),
                command.host.membershipId.dbString(),
                command.sessionId.dbString(),
                command.host.clubId.dbString(),
            )
        check(updated == 1)
        return loadTrashRecord(command, lock = false) ?: error("trashed session was not readable")
    }

    fun listTrash(
        host: CurrentMember,
        pageRequest: PageRequest,
    ): HostSessionTrashPage {
        requireHost(host)
        val cursor = HostSessionTrashCursor.from(pageRequest.cursor, host.clubId)
        val parameters = mutableListOf<Any>(host.clubId.dbString())
        val cursorClause =
            if (cursor == null) {
                ""
            } else {
                parameters += cursor.deletedAt.toUtcLocalDateTime()
                parameters += cursor.deletedAt.toUtcLocalDateTime()
                parameters += cursor.id.dbString()
                "and (deleted_at < ? or (deleted_at = ? and id < ?))"
            }
        parameters += pageRequest.limit + 1
        val rows =
            jdbcTemplate.query(
                """
                select id, number, title, state, deleted_at, purge_after,
                       purge_after > utc_timestamp(6) as restorable
                from sessions
                where club_id = ?
                  and deleted_at is not null
                  $cursorClause
                order by deleted_at desc, id desc
                limit ?
                """.trimIndent(),
                { resultSet, _ -> resultSet.toTrashRecord() },
                *parameters.toTypedArray(),
            )
        val hasMore = rows.size > pageRequest.limit
        val items = rows.take(pageRequest.limit)
        val nextCursor =
            if (hasMore) {
                items.lastOrNull()?.let { record ->
                    HostSessionTrashCursor.encode(record.deletedAt, record.sessionId, host.clubId)
                }
            } else {
                null
            }
        return HostSessionTrashPage(
            items = items.map { it.toListResponse() },
            nextCursor = nextCursor,
        )
    }

    fun findTrash(command: HostSessionIdCommand): HostSessionTrashRecord? {
        requireHost(command.host)
        return loadTrashRecord(command, lock = false)
    }

    fun lockClub(clubId: UUID) {
        jdbcTemplate.queryForObject(
            "select id from clubs where id = ? for update",
            String::class.java,
            clubId.dbString(),
        )
    }

    fun lockTrash(command: HostSessionIdCommand): HostSessionTrashRecord? {
        requireHost(command.host)
        return loadTrashRecord(command, lock = true)
    }

    fun restoreTrash(command: HostSessionIdCommand): Boolean {
        requireHost(command.host)
        val updated =
            jdbcTemplate.update(
                """
                update sessions
                set deleted_at = null,
                    deleted_by_membership_id = null,
                    purge_after = null
                where id = ?
                  and club_id = ?
                  and deleted_at is not null
                  and purge_after > utc_timestamp(6)
                """.trimIndent(),
                command.sessionId.dbString(),
                command.host.clubId.dbString(),
            )
        return updated > 0
    }

    fun findOpenSessionId(clubId: UUID): UUID? =
        jdbcTemplate
            .query(
                """
                select id
                from active_sessions sessions
                where club_id = ?
                  and state = 'OPEN'
                limit 1
                """.trimIndent(),
                { resultSet, _ -> resultSet.uuid("id") },
                clubId.dbString(),
            ).firstOrNull()

    fun deletionCounts(
        clubId: UUID,
        sessionId: UUID,
    ): HostSessionDeletionCounts = countSessionDeletionRows(clubId, sessionId)

    fun lockExpiredForPurge(limit: Int): List<HostSessionTrashPurgeTarget> =
        jdbcTemplate.query(
            """
            select id, club_id
            from sessions
            where deleted_at is not null
              and purge_after <= utc_timestamp(6)
            order by purge_after, id
            limit ?
            for update skip locked
            """.trimIndent(),
            { resultSet, _ ->
                HostSessionTrashPurgeTarget(
                    sessionId = resultSet.uuid("id"),
                    clubId = resultSet.uuid("club_id"),
                )
            },
            limit,
        )

    fun purgeLocked(target: HostSessionTrashPurgeTarget): Boolean {
        deleteSessionOwnedRows(target.clubId, target.sessionId)
        val deletedSessions =
            jdbcTemplate.update(
                """
                delete from sessions
                where id = ?
                  and club_id = ?
                  and deleted_at is not null
                """.trimIndent(),
                target.sessionId.dbString(),
                target.clubId.dbString(),
            )
        return deletedSessions > 0
    }

    fun latestDeletedOrRestoredAction(
        clubId: UUID,
        sessionId: UUID,
    ): HostSessionLifecycleAction? =
        jdbcTemplate
            .query(
                """
                select action_type
                from host_session_lifecycle_audit
                where club_id = ?
                  and session_id = ?
                  and action_type in ('DELETED', 'RESTORED')
                order by created_at desc, id desc
                limit 1
                """.trimIndent(),
                { resultSet, _ -> HostSessionLifecycleAction.valueOf(resultSet.getString("action_type")) },
                clubId.dbString(),
                sessionId.dbString(),
            ).firstOrNull()

    private fun loadTrashRecord(
        command: HostSessionIdCommand,
        lock: Boolean,
    ): HostSessionTrashRecord? {
        val lockClause = if (lock) "for update" else ""
        return jdbcTemplate
            .query(
                """
                select id, number, title, state, deleted_at, purge_after,
                       purge_after > utc_timestamp(6) as restorable
                from sessions
                where id = ?
                  and club_id = ?
                  and deleted_at is not null
                $lockClause
                """.trimIndent(),
                { resultSet, _ -> resultSet.toTrashRecord() },
                command.sessionId.dbString(),
                command.host.clubId.dbString(),
            ).firstOrNull()
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
                  and deleted_at is null
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

    private fun ResultSet.toTrashRecord() =
        HostSessionTrashRecord(
            sessionId = uuid("id"),
            sessionNumber = getInt("number"),
            title = getString("title"),
            state = getString("state"),
            deletedAt = utcOffsetDateTime("deleted_at"),
            purgeAfter = utcOffsetDateTime("purge_after"),
            restorable = getBoolean("restorable"),
        )

    private fun HostSessionTrashRecord.toListResponse() =
        HostSessionTrashResponse(
            sessionId = sessionId.toString(),
            sessionNumber = sessionNumber,
            title = title,
            state = state,
            trashed = true,
            deletedAt = deletedAt.toString(),
            purgeAfter = purgeAfter.toString(),
            counts = EMPTY_TRASH_COUNTS,
        )
}

private val EMPTY_TRASH_COUNTS =
    HostSessionDeletionCounts(
        participants = 0,
        rsvpResponses = 0,
        questions = 0,
        checkins = 0,
        oneLineReviews = 0,
        longReviews = 0,
        highlights = 0,
        publications = 0,
        feedbackReports = 0,
        feedbackDocuments = 0,
    )

private data class HostSessionTrashCursor(
    val deletedAt: OffsetDateTime,
    val id: UUID,
) {
    companion object {
        fun from(
            cursor: Map<String, String>,
            expectedClubId: UUID,
        ): HostSessionTrashCursor? {
            if (cursor.isEmpty()) return null
            if (cursor.keys != setOf("deletedAt", "id", "clubId")) invalidCursor()
            val deletedAt =
                cursor["deletedAt"]
                    ?.let { runCatching { OffsetDateTime.parse(it) }.getOrNull() }
                    ?: invalidCursor()
            val id =
                cursor["id"]
                    ?.let { runCatching { UUID.fromString(it) }.getOrNull() }
                    ?: invalidCursor()
            val clubId =
                cursor["clubId"]
                    ?.let { runCatching { UUID.fromString(it) }.getOrNull() }
                    ?: invalidCursor()
            if (clubId != expectedClubId) invalidCursor()
            return HostSessionTrashCursor(deletedAt, id)
        }

        fun encode(
            deletedAt: OffsetDateTime,
            id: UUID,
            clubId: UUID,
        ): String? =
            CursorCodec.encode(
                mapOf(
                    "deletedAt" to deletedAt.toString(),
                    "id" to id.toString(),
                    "clubId" to clubId.toString(),
                ),
            )
    }
}
