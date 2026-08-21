package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.ManualNotificationDispatchList
import com.readmates.notification.application.model.ManualNotificationDispatchListItem
import com.readmates.notification.application.model.ManualNotificationMemberOption
import com.readmates.notification.application.model.ManualNotificationRecentDispatch
import com.readmates.notification.application.port.out.ManualNotificationSessionContext
import com.readmates.notification.domain.NotificationEventType
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.paging.CursorCodec
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import org.springframework.jdbc.core.JdbcTemplate
import java.time.OffsetDateTime
import java.util.UUID

internal class ManualNotificationDispatchReadQueries(
    private val jdbcTemplate: JdbcTemplate,
    private val rows: ManualNotificationDispatchRows,
) {
    fun findSessionContext(
        clubId: UUID,
        sessionId: UUID,
        forUpdate: Boolean,
    ): ManualNotificationSessionContext? =
        jdbcTemplate
            .query(
                """
                select
                  sessions.id,
                  sessions.club_id,
                  sessions.number,
                  sessions.book_title,
                  sessions.session_date,
                  sessions.state,
                  sessions.visibility,
                  exists(
                    select 1
                    from session_feedback_documents
                    where session_feedback_documents.club_id = sessions.club_id
                      and session_feedback_documents.session_id = sessions.id
                  ) as feedback_document_uploaded,
                  (select max(session_feedback_documents.version)
                   from session_feedback_documents
                   where session_feedback_documents.club_id = sessions.club_id
                     and session_feedback_documents.session_id = sessions.id) as feedback_document_version,
                  (select session_record_revisions.snapshot_sha256
                   from session_record_revisions
                   where session_record_revisions.club_id = sessions.club_id
                     and session_record_revisions.session_id = sessions.id
                   order by session_record_revisions.version desc
                   limit 1) as session_record_content_revision
                from active_sessions sessions
                where sessions.club_id = ?
                  and sessions.id = ?
                ${if (forUpdate) "for update" else ""}
                """.trimIndent(),
                { resultSet, _ -> rows.sessionContext(resultSet) },
                clubId.dbString(),
                sessionId.dbString(),
            ).firstOrNull()

    fun listMembers(
        clubId: UUID,
        sessionId: UUID?,
        search: String?,
        pageRequest: PageRequest,
    ): CursorPage<ManualNotificationMemberOption> {
        val cursor = ManualMemberCursor.from(pageRequest.cursor)
        val args = mutableListOf<Any>()
        val sessionJoin = sessionJoin(sessionId, args)
        args += clubId.dbString()
        val searchPredicate = searchPredicate(search, args)
        val cursorPredicate = memberCursorPredicate(cursor, args)
        args += pageRequest.limit + 1
        val loaded = loadMembers(sessionJoin, searchPredicate, cursorPredicate, args)
        return memberPage(loaded, pageRequest.limit)
    }

    fun listDispatches(
        clubId: UUID,
        sessionId: UUID?,
        eventType: NotificationEventType?,
        pageRequest: PageRequest,
    ): ManualNotificationDispatchList {
        val cursor = ManualDispatchCursor.from(pageRequest.cursor)
        val predicates = mutableListOf("notification_manual_dispatches.club_id = ?")
        val args = mutableListOf<Any>(clubId.dbString())
        addDispatchFilters(predicates, args, sessionId, eventType, cursor)
        args += pageRequest.limit + 1
        return dispatchPage(loadDispatches(predicates, args), pageRequest.limit)
    }

    fun recentDispatches(
        clubId: UUID,
        sessionId: UUID,
        eventType: NotificationEventType,
        contentRevision: String,
    ): List<ManualNotificationRecentDispatch> =
        jdbcTemplate.query(
            """
            select
              notification_manual_dispatches.id,
              notification_manual_dispatches.event_type,
              notification_manual_dispatches.requested_channels,
              notification_manual_dispatches.created_at,
              users.email as requested_by_email,
              notification_manual_dispatches.target_count
            from notification_manual_dispatches
            join memberships on memberships.id = notification_manual_dispatches.requested_by_membership_id
              and memberships.club_id = notification_manual_dispatches.club_id
            join users on users.id = memberships.user_id
            where notification_manual_dispatches.club_id = ?
              and notification_manual_dispatches.session_id = ?
              and notification_manual_dispatches.event_type = ?
              and notification_manual_dispatches.content_revision = ?
            order by notification_manual_dispatches.created_at desc
            limit 5
            """.trimIndent(),
            { resultSet, _ -> rows.recentDispatch(resultSet) },
            clubId.dbString(),
            sessionId.dbString(),
            eventType.name,
            contentRevision,
        )

    private fun sessionJoin(
        sessionId: UUID?,
        args: MutableList<Any>,
    ): String =
        if (sessionId == null) {
            "left join session_participants on false"
        } else {
            args += sessionId.dbString()
            """
            left join session_participants on session_participants.club_id = memberships.club_id
              and session_participants.session_id = ?
              and session_participants.membership_id = memberships.id
            """.trimIndent()
        }

    private fun searchPredicate(
        search: String?,
        args: MutableList<Any>,
    ): String {
        val likeSearch =
            search
                ?.trim()
                ?.lowercase()
                ?.takeIf { it.isNotBlank() }
                ?.let { "%$it%" }
        return if (likeSearch == null) {
            ""
        } else {
            repeat(MEMBER_SEARCH_FIELD_COUNT) { args += likeSearch }
            """
            and (
              lower(coalesce(memberships.short_name, users.name)) like ?
              or lower(users.name) like ?
              or lower(users.email) like ?
            )
            """.trimIndent()
        }
    }

    private fun memberCursorPredicate(
        cursor: ManualMemberCursor?,
        args: MutableList<Any>,
    ): String =
        if (cursor == null) {
            ""
        } else {
            args += cursor.displayName
            args += cursor.displayName
            args += cursor.membershipId
            """
            and (
              coalesce(memberships.short_name, users.name) > ?
              or (coalesce(memberships.short_name, users.name) = ? and memberships.id > ?)
            )
            """.trimIndent()
        }

    private fun loadMembers(
        sessionJoin: String,
        searchPredicate: String,
        cursorPredicate: String,
        args: List<Any>,
    ): List<ManualNotificationMemberOption> =
        jdbcTemplate.query(
            """
            select
              memberships.id as membership_id,
              coalesce(memberships.short_name, users.name) as display_name,
              users.email,
              memberships.role,
              memberships.status,
              session_participants.participation_status,
              session_participants.attendance_status,
              coalesce(notification_preferences.email_enabled, true) as email_enabled
            from memberships
            join users on users.id = memberships.user_id
            $sessionJoin
            left join notification_preferences on notification_preferences.membership_id = memberships.id
              and notification_preferences.club_id = memberships.club_id
            where memberships.club_id = ?
              and memberships.status = 'ACTIVE'
              $searchPredicate
              $cursorPredicate
            order by display_name, memberships.id
            limit ?
            """.trimIndent(),
            { resultSet, _ -> rows.memberOption(resultSet) },
            *args.toTypedArray(),
        )

    private fun addDispatchFilters(
        predicates: MutableList<String>,
        args: MutableList<Any>,
        sessionId: UUID?,
        eventType: NotificationEventType?,
        cursor: ManualDispatchCursor?,
    ) {
        sessionId?.let {
            predicates += "notification_manual_dispatches.session_id = ?"
            args += it.dbString()
        }
        eventType?.let {
            predicates += "notification_manual_dispatches.event_type = ?"
            args += it.name
        }
        cursor?.let {
            predicates +=
                """
                (
                  notification_manual_dispatches.created_at < ?
                  or (notification_manual_dispatches.created_at = ? and notification_manual_dispatches.id < ?)
                )
                """.trimIndent()
            args += it.createdAt.toUtcLocalDateTime()
            args += it.createdAt.toUtcLocalDateTime()
            args += it.id
        }
    }

    private fun loadDispatches(
        predicates: List<String>,
        args: List<Any>,
    ): List<ManualNotificationDispatchListItem> =
        jdbcTemplate.query(
            """
            select
              notification_manual_dispatches.id as manual_dispatch_id,
              notification_manual_dispatches.event_id,
              notification_manual_dispatches.event_type,
              notification_manual_dispatches.session_id,
              sessions.number as session_number,
              sessions.book_title,
              notification_manual_dispatches.requested_channels,
              notification_manual_dispatches.audience,
              notification_manual_dispatches.resend,
              users.email as requested_by_email,
              notification_manual_dispatches.target_count,
              notification_manual_dispatches.expected_in_app_count,
              notification_manual_dispatches.expected_email_count,
              notification_event_outbox.status as event_status,
              notification_manual_dispatches.created_at
            from notification_manual_dispatches
            join notification_event_outbox on notification_event_outbox.id = notification_manual_dispatches.event_id
              and notification_event_outbox.club_id = notification_manual_dispatches.club_id
            join active_sessions sessions on sessions.id = notification_manual_dispatches.session_id
              and sessions.club_id = notification_manual_dispatches.club_id
            join memberships on memberships.id = notification_manual_dispatches.requested_by_membership_id
              and memberships.club_id = notification_manual_dispatches.club_id
            join users on users.id = memberships.user_id
            where ${predicates.joinToString(" and ")}
            order by notification_manual_dispatches.created_at desc, notification_manual_dispatches.id desc
            limit ?
            """.trimIndent(),
            { resultSet, _ -> rows.dispatchListItem(resultSet) },
            *args.toTypedArray(),
        )
}

private fun memberPage(
    loaded: List<ManualNotificationMemberOption>,
    limit: Int,
): CursorPage<ManualNotificationMemberOption> {
    val visible = loaded.take(limit)
    val nextCursor =
        visible.lastOrNull()?.takeIf { loaded.size > limit }?.let { member ->
            CursorCodec.encode(
                mapOf(
                    "displayName" to member.displayName,
                    "membershipId" to member.membershipId.toString(),
                ),
            )
        }
    return CursorPage(items = visible, nextCursor = nextCursor)
}

private fun dispatchPage(
    loaded: List<ManualNotificationDispatchListItem>,
    limit: Int,
): ManualNotificationDispatchList {
    val visible = loaded.take(limit)
    val nextCursor =
        visible.lastOrNull()?.takeIf { loaded.size > limit }?.let { dispatch ->
            CursorCodec.encode(
                mapOf(
                    "createdAt" to dispatch.createdAt.toString(),
                    "id" to dispatch.manualDispatchId.toString(),
                ),
            )
        }
    return ManualNotificationDispatchList(items = visible, nextCursor = nextCursor)
}

private data class ManualMemberCursor(
    val displayName: String,
    val membershipId: String,
) {
    companion object {
        fun from(cursor: Map<String, String>): ManualMemberCursor? =
            cursor["displayName"]?.takeIf { it.isNotBlank() }?.let { displayName ->
                cursor["membershipId"]?.takeIf { it.isNotBlank() }?.let { membershipId ->
                    ManualMemberCursor(displayName, membershipId)
                }
            }
    }
}

private data class ManualDispatchCursor(
    val createdAt: OffsetDateTime,
    val id: String,
) {
    companion object {
        fun from(cursor: Map<String, String>): ManualDispatchCursor? =
            cursor["createdAt"]
                ?.let { runCatching { OffsetDateTime.parse(it) }.getOrNull() }
                ?.let { createdAt ->
                    cursor["id"]?.takeIf { it.isNotBlank() }?.let { id ->
                        ManualDispatchCursor(createdAt, id)
                    }
                }
    }
}

private const val MEMBER_SEARCH_FIELD_COUNT = 3
