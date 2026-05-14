package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.ManualNotificationAudience
import com.readmates.notification.application.model.ManualNotificationDispatchList
import com.readmates.notification.application.model.ManualNotificationDispatchListItem
import com.readmates.notification.application.model.ManualNotificationEligibility
import com.readmates.notification.application.model.ManualNotificationMemberOption
import com.readmates.notification.application.model.ManualNotificationRequestedChannels
import com.readmates.notification.application.model.ManualNotificationSelection
import com.readmates.notification.application.model.NotificationDispatchSource
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.port.out.ManualNotificationConfirmInsertStatus
import com.readmates.notification.application.port.out.ManualNotificationConfirmedDispatch
import com.readmates.notification.application.port.out.ManualNotificationDispatchPort
import com.readmates.notification.application.port.out.ManualNotificationPreviewRecord
import com.readmates.notification.application.port.out.ManualNotificationSessionContext
import com.readmates.notification.application.port.out.ManualNotificationStoredDispatch
import com.readmates.notification.application.port.out.ManualNotificationTargetSnapshot
import com.readmates.notification.domain.NotificationEventOutboxStatus
import com.readmates.notification.domain.NotificationEventType
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import com.readmates.shared.paging.CursorCodec
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import org.springframework.beans.factory.annotation.Value
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.ObjectMapper
import java.sql.ResultSet
import java.time.OffsetDateTime
import java.util.UUID

@Repository
class JdbcManualNotificationDispatchAdapter(
    private val jdbcTemplate: JdbcTemplate,
    private val objectMapper: ObjectMapper,
    @param:Value("\${readmates.notifications.kafka.events-topic:readmates.notification.events.v1}") private val eventsTopic: String,
) : ManualNotificationDispatchPort {
    override fun findSessionContext(
        clubId: UUID,
        sessionId: UUID,
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
                  ) as feedback_document_uploaded
                from sessions
                where sessions.club_id = ?
                  and sessions.id = ?
                """.trimIndent(),
                { rs, _ -> rs.toSessionContext() },
                clubId.dbString(),
                sessionId.dbString(),
            ).firstOrNull()

    override fun listMembers(
        clubId: UUID,
        sessionId: UUID?,
        search: String?,
        pageRequest: PageRequest,
    ): CursorPage<ManualNotificationMemberOption> {
        val cursor = ManualMemberCursor.from(pageRequest.cursor)
        val normalizedSearch = search?.trim()?.lowercase()?.takeIf { it.isNotBlank() }
        val likeSearch = normalizedSearch?.let { "%$it%" }
        val args = mutableListOf<Any>()
        val sessionJoin =
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
        args += clubId.dbString()
        val searchPredicate =
            if (likeSearch == null) {
                ""
            } else {
                args += likeSearch
                args += likeSearch
                args += likeSearch
                """
                and (
                  lower(coalesce(memberships.short_name, users.name)) like ?
                  or lower(users.name) like ?
                  or lower(users.email) like ?
                )
                """.trimIndent()
            }
        val cursorPredicate =
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
        args += pageRequest.limit + 1
        val rows =
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
                { rs, _ -> rs.toMemberOption() },
                *args.toTypedArray(),
            )
        val visible = rows.take(pageRequest.limit)
        return CursorPage(
            items = visible,
            nextCursor =
                if (rows.size > pageRequest.limit) {
                    visible.lastOrNull()?.let {
                        CursorCodec.encode(
                            mapOf(
                                "displayName" to it.displayName,
                                "membershipId" to it.membershipId.toString(),
                            ),
                        )
                    }
                } else {
                    null
                },
        )
    }

    override fun listDispatches(
        clubId: UUID,
        sessionId: UUID?,
        eventType: NotificationEventType?,
        pageRequest: PageRequest,
    ): ManualNotificationDispatchList {
        val cursor = ManualDispatchCursor.from(pageRequest.cursor)
        val predicates = mutableListOf("notification_manual_dispatches.club_id = ?")
        val args = mutableListOf<Any>(clubId.dbString())
        sessionId?.let {
            predicates += "notification_manual_dispatches.session_id = ?"
            args += it.dbString()
        }
        eventType?.let {
            predicates += "notification_manual_dispatches.event_type = ?"
            args += it.name
        }
        if (cursor != null) {
            predicates +=
                """
                (
                  notification_manual_dispatches.created_at < ?
                  or (notification_manual_dispatches.created_at = ? and notification_manual_dispatches.id < ?)
                )
                """.trimIndent()
            args += cursor.createdAt.toUtcLocalDateTime()
            args += cursor.createdAt.toUtcLocalDateTime()
            args += cursor.id
        }
        args += pageRequest.limit + 1

        val rows =
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
                join sessions on sessions.id = notification_manual_dispatches.session_id
                  and sessions.club_id = notification_manual_dispatches.club_id
                join memberships on memberships.id = notification_manual_dispatches.requested_by_membership_id
                  and memberships.club_id = notification_manual_dispatches.club_id
                join users on users.id = memberships.user_id
                where ${predicates.joinToString(" and ")}
                order by notification_manual_dispatches.created_at desc, notification_manual_dispatches.id desc
                limit ?
                """.trimIndent(),
                { rs, _ -> rs.toDispatchListItem() },
                *args.toTypedArray(),
            )
        val visible = rows.take(pageRequest.limit)
        return ManualNotificationDispatchList(
            items = visible,
            nextCursor =
                if (rows.size > pageRequest.limit) {
                    visible.lastOrNull()?.let {
                        CursorCodec.encode(
                            mapOf(
                                "createdAt" to it.createdAt.toString(),
                                "id" to it.manualDispatchId.toString(),
                            ),
                        )
                    }
                } else {
                    null
                },
        )
    }

    override fun validateMembershipEdits(
        clubId: UUID,
        membershipIds: Set<UUID>,
    ): Boolean {
        if (membershipIds.isEmpty()) return true
        val placeholders = membershipIds.joinToString(",") { "?" }
        val count =
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from memberships
                where club_id = ?
                  and status = 'ACTIVE'
                  and id in ($placeholders)
                """.trimIndent(),
                Int::class.java,
                *(listOf(clubId.dbString() as Any) + membershipIds.map { it.dbString() as Any }).toTypedArray(),
            ) ?: 0
        return count == membershipIds.size
    }

    override fun previewTargets(
        clubId: UUID,
        selection: ManualNotificationSelection,
    ): ManualNotificationTargetSnapshot {
        val baseIds = baseMembershipIds(clubId, selection)
        val includedIds = activeMembershipIds(clubId, selection.includedMembershipIds)
        val excludedIds = selection.excludedMembershipIds.toSet()
        val finalIds = (baseIds - excludedIds + includedIds).sortedBy { it.toString() }
        if (finalIds.isEmpty()) {
            return ManualNotificationTargetSnapshot(
                baseCount = baseIds.size,
                excludedCount = selection.excludedMembershipIds.count { it in baseIds },
                includedCount = includedIds.size,
                finalTargetCount = 0,
                inAppEligibleCount = 0,
                emailEligibleCount = 0,
                emailSkippedByPreferenceCount = 0,
                emailMissingCount = 0,
                targetMembershipIds = emptyList(),
                inAppMembershipIds = emptyList(),
                emailMembershipIds = emptyList(),
            )
        }
        val eligibility = emailEligibility(clubId, selection.eventType, finalIds)
        val inAppIds = if (selection.requestedChannels != ManualNotificationRequestedChannels.EMAIL) finalIds else emptyList()
        val emailIds =
            if (selection.requestedChannels !=
                ManualNotificationRequestedChannels.IN_APP
            ) {
                eligibility.eligibleIds
            } else {
                emptyList()
            }
        return ManualNotificationTargetSnapshot(
            baseCount = baseIds.size,
            excludedCount = selection.excludedMembershipIds.count { it in baseIds },
            includedCount = includedIds.size,
            finalTargetCount = finalIds.size,
            inAppEligibleCount = inAppIds.size,
            emailEligibleCount = emailIds.size,
            emailSkippedByPreferenceCount =
                if (selection.requestedChannels !=
                    ManualNotificationRequestedChannels.IN_APP
                ) {
                    eligibility.preferenceSkipped
                } else {
                    0
                },
            emailMissingCount = if (selection.requestedChannels != ManualNotificationRequestedChannels.IN_APP) eligibility.missing else 0,
            targetMembershipIds = finalIds,
            inAppMembershipIds = inAppIds,
            emailMembershipIds = emailIds,
        )
    }

    override fun recentDispatches(
        clubId: UUID,
        sessionId: UUID,
        eventType: NotificationEventType,
    ) = jdbcTemplate.query(
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
        order by notification_manual_dispatches.created_at desc
        limit 5
        """.trimIndent(),
        { rs, _ -> rs.toRecentDispatch() },
        clubId.dbString(),
        sessionId.dbString(),
        eventType.name,
    )

    override fun insertPreview(
        clubId: UUID,
        hostMembershipId: UUID,
        selectionHash: String,
        expiresAt: OffsetDateTime,
    ): UUID {
        val id = UUID.randomUUID()
        jdbcTemplate.update(
            """
            insert into notification_manual_dispatch_previews (id, club_id, host_membership_id, selection_hash, expires_at)
            values (?, ?, ?, ?, ?)
            """.trimIndent(),
            id.dbString(),
            clubId.dbString(),
            hostMembershipId.dbString(),
            selectionHash,
            expiresAt.toUtcLocalDateTime(),
        )
        return id
    }

    override fun findPreview(
        id: UUID,
        clubId: UUID,
        hostMembershipId: UUID,
    ): ManualNotificationPreviewRecord? =
        jdbcTemplate
            .query(
                """
                select id, club_id, host_membership_id, selection_hash, expires_at
                from notification_manual_dispatch_previews
                where id = ?
                  and club_id = ?
                  and host_membership_id = ?
                """.trimIndent(),
                { rs, _ ->
                    ManualNotificationPreviewRecord(
                        id = rs.uuid("id"),
                        clubId = rs.uuid("club_id"),
                        hostMembershipId = rs.uuid("host_membership_id"),
                        selectionHash = rs.getString("selection_hash"),
                        expiresAt = rs.utcOffsetDateTime("expires_at"),
                    )
                },
                id.dbString(),
                clubId.dbString(),
                hostMembershipId.dbString(),
            ).firstOrNull()

    override fun findConsumedManualDispatch(
        previewId: UUID,
        clubId: UUID,
        hostMembershipId: UUID,
        selectionHash: String,
        now: OffsetDateTime,
    ): ManualNotificationConfirmedDispatch? =
        jdbcTemplate
            .query(
                """
                select notification_manual_dispatches.id, notification_manual_dispatches.event_id, notification_manual_dispatches.created_at
                from notification_manual_dispatch_previews
                join notification_manual_dispatches on notification_manual_dispatches.event_id = notification_manual_dispatch_previews.consumed_event_id
                  and notification_manual_dispatches.club_id = notification_manual_dispatch_previews.club_id
                where notification_manual_dispatch_previews.id = ?
                  and notification_manual_dispatch_previews.club_id = ?
                  and notification_manual_dispatch_previews.host_membership_id = ?
                  and notification_manual_dispatch_previews.selection_hash = ?
                  and notification_manual_dispatch_previews.expires_at >= ?
                  and notification_manual_dispatch_previews.consumed_event_id is not null
                """.trimIndent(),
                { rs, _ ->
                    ManualNotificationConfirmedDispatch(
                        manualDispatchId = rs.uuid("id"),
                        eventId = rs.uuid("event_id"),
                        createdAt = rs.utcOffsetDateTime("created_at"),
                        status = ManualNotificationConfirmInsertStatus.ALREADY_CONSUMED,
                    )
                },
                previewId.dbString(),
                clubId.dbString(),
                hostMembershipId.dbString(),
                selectionHash,
                now.toUtcLocalDateTime(),
            ).firstOrNull()

    @Transactional
    override fun confirmManualDispatch(
        previewId: UUID,
        clubId: UUID,
        hostMembershipId: UUID,
        selectionHash: String,
        now: OffsetDateTime,
        selection: ManualNotificationSelection,
        payload: NotificationEventPayload,
        targetSnapshot: ManualNotificationTargetSnapshot,
        resend: Boolean,
    ): ManualNotificationConfirmedDispatch? {
        val preview =
            jdbcTemplate
                .query(
                    """
                    select id, club_id, host_membership_id, selection_hash, expires_at, consumed_event_id
                    from notification_manual_dispatch_previews
                    where id = ?
                      and club_id = ?
                      and host_membership_id = ?
                    for update
                    """.trimIndent(),
                    { rs, _ ->
                        LockedPreview(
                            id = rs.uuid("id"),
                            selectionHash = rs.getString("selection_hash"),
                            expiresAt = rs.utcOffsetDateTime("expires_at"),
                            consumedEventId = rs.getString("consumed_event_id")?.let(UUID::fromString),
                        )
                    },
                    previewId.dbString(),
                    clubId.dbString(),
                    hostMembershipId.dbString(),
                ).firstOrNull() ?: return null
        if (preview.expiresAt.isBefore(now) || preview.selectionHash != selectionHash) return null
        preview.consumedEventId?.let { eventId ->
            return findStoredDispatchByEventId(clubId, eventId)
                ?.copy(status = ManualNotificationConfirmInsertStatus.ALREADY_CONSUMED)
        }

        val eventId = UUID.randomUUID()
        val dispatchId = requireNotNull(payload.manualDispatch?.id) { "Manual dispatch payload id is required" }
        jdbcTemplate.update(
            """
            insert into notification_event_outbox (
              id, club_id, event_type, aggregate_type, aggregate_id, payload_json, kafka_topic, kafka_key, status, dedupe_key
            )
            values (?, ?, ?, 'SESSION', ?, ?, ?, ?, 'PENDING', ?)
            """.trimIndent(),
            eventId.dbString(),
            clubId.dbString(),
            selection.eventType.name,
            selection.sessionId.dbString(),
            objectMapper.writeValueAsString(payload),
            eventsTopic,
            clubId.dbString(),
            "manual:${selection.eventType}:${selection.sessionId}:preview:$previewId",
        )
        jdbcTemplate.update(
            """
            insert into notification_manual_dispatches (
              id, club_id, event_id, preview_id, session_id, event_type, requested_by_membership_id,
              requested_channels, audience, excluded_count, included_count, target_count,
              expected_in_app_count, expected_email_count, resend, send_mode
            )
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            dispatchId.dbString(),
            clubId.dbString(),
            eventId.dbString(),
            previewId.dbString(),
            selection.sessionId.dbString(),
            selection.eventType.name,
            hostMembershipId.dbString(),
            selection.requestedChannels.name,
            selection.audience.name,
            targetSnapshot.excludedCount,
            targetSnapshot.includedCount,
            targetSnapshot.finalTargetCount,
            targetSnapshot.inAppEligibleCount,
            targetSnapshot.emailEligibleCount,
            resend,
            selection.sendMode.name,
        )
        jdbcTemplate.update(
            """
            update notification_manual_dispatch_previews
            set consumed_at = utc_timestamp(6),
                consumed_event_id = ?
            where id = ?
              and club_id = ?
              and host_membership_id = ?
              and consumed_event_id is null
            """.trimIndent(),
            eventId.dbString(),
            previewId.dbString(),
            clubId.dbString(),
            hostMembershipId.dbString(),
        )
        val createdAt =
            jdbcTemplate.queryForObject(
                "select created_at from notification_manual_dispatches where id = ?",
                { rs, _ -> rs.utcOffsetDateTime("created_at") },
                dispatchId.dbString(),
            )!!
        return ManualNotificationConfirmedDispatch(
            manualDispatchId = dispatchId,
            eventId = eventId,
            createdAt = createdAt,
            status = ManualNotificationConfirmInsertStatus.CREATED,
        )
    }

    @Transactional
    override fun insertManualDispatch(
        clubId: UUID,
        hostMembershipId: UUID,
        selection: ManualNotificationSelection,
        payload: NotificationEventPayload,
        targetSnapshot: ManualNotificationTargetSnapshot,
        resend: Boolean,
    ): ManualNotificationStoredDispatch {
        val eventId = UUID.randomUUID()
        val dispatchId = requireNotNull(payload.manualDispatch?.id) { "Manual dispatch payload id is required" }
        jdbcTemplate.update(
            """
            insert into notification_event_outbox (
              id, club_id, event_type, aggregate_type, aggregate_id, payload_json, kafka_topic, kafka_key, status, dedupe_key
            )
            values (?, ?, ?, 'SESSION', ?, ?, ?, ?, 'PENDING', ?)
            """.trimIndent(),
            eventId.dbString(),
            clubId.dbString(),
            selection.eventType.name,
            selection.sessionId.dbString(),
            objectMapper.writeValueAsString(payload),
            eventsTopic,
            clubId.dbString(),
            "manual:${selection.eventType}:${selection.sessionId}:$dispatchId",
        )
        jdbcTemplate.update(
            """
            insert into notification_manual_dispatches (
              id, club_id, event_id, session_id, event_type, requested_by_membership_id,
              requested_channels, audience, excluded_count, included_count, target_count,
              expected_in_app_count, expected_email_count, resend, send_mode
            )
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            dispatchId.dbString(),
            clubId.dbString(),
            eventId.dbString(),
            selection.sessionId.dbString(),
            selection.eventType.name,
            hostMembershipId.dbString(),
            selection.requestedChannels.name,
            selection.audience.name,
            targetSnapshot.excludedCount,
            targetSnapshot.includedCount,
            targetSnapshot.finalTargetCount,
            targetSnapshot.inAppEligibleCount,
            targetSnapshot.emailEligibleCount,
            resend,
            selection.sendMode.name,
        )
        val createdAt =
            jdbcTemplate.queryForObject(
                "select created_at from notification_manual_dispatches where id = ?",
                { rs, _ -> rs.utcOffsetDateTime("created_at") },
                dispatchId.dbString(),
            )!!
        return ManualNotificationStoredDispatch(dispatchId, eventId, createdAt)
    }

    private fun findStoredDispatchByEventId(
        clubId: UUID,
        eventId: UUID,
    ): ManualNotificationConfirmedDispatch? =
        jdbcTemplate
            .query(
                """
                select id, event_id, created_at
                from notification_manual_dispatches
                where club_id = ?
                  and event_id = ?
                """.trimIndent(),
                { rs, _ ->
                    ManualNotificationConfirmedDispatch(
                        manualDispatchId = rs.uuid("id"),
                        eventId = rs.uuid("event_id"),
                        createdAt = rs.utcOffsetDateTime("created_at"),
                        status = ManualNotificationConfirmInsertStatus.ALREADY_CONSUMED,
                    )
                },
                clubId.dbString(),
                eventId.dbString(),
            ).firstOrNull()

    private fun baseMembershipIds(
        clubId: UUID,
        selection: ManualNotificationSelection,
    ): Set<UUID> {
        val sql =
            when (selection.audience) {
                ManualNotificationAudience.ALL_ACTIVE_MEMBERS ->
                    """
                select memberships.id
                from memberships
                where memberships.club_id = ?
                  and memberships.status = 'ACTIVE'
            """
                ManualNotificationAudience.SESSION_PARTICIPANTS ->
                    """
                select memberships.id
                from memberships
                join session_participants on session_participants.membership_id = memberships.id
                  and session_participants.club_id = memberships.club_id
                  and session_participants.session_id = ?
                  and session_participants.participation_status = 'ACTIVE'
                where memberships.club_id = ?
                  and memberships.status = 'ACTIVE'
            """
                ManualNotificationAudience.CONFIRMED_ATTENDEES ->
                    """
                select memberships.id
                from memberships
                join session_participants on session_participants.membership_id = memberships.id
                  and session_participants.club_id = memberships.club_id
                  and session_participants.session_id = ?
                  and session_participants.participation_status = 'ACTIVE'
                  and session_participants.attendance_status = 'ATTENDED'
                where memberships.club_id = ?
                  and memberships.status = 'ACTIVE'
            """
            }.trimIndent()
        val args =
            if (selection.audience == ManualNotificationAudience.ALL_ACTIVE_MEMBERS) {
                arrayOf(clubId.dbString())
            } else {
                arrayOf(selection.sessionId.dbString(), clubId.dbString())
            }
        return jdbcTemplate.query(sql, { rs, _ -> rs.uuid("id") }, *args).toSet()
    }

    private fun activeMembershipIds(
        clubId: UUID,
        membershipIds: List<UUID>,
    ): Set<UUID> {
        if (membershipIds.isEmpty()) return emptySet()
        val placeholders = membershipIds.joinToString(",") { "?" }
        return jdbcTemplate
            .query(
                """
                select id
                from memberships
                where club_id = ?
                  and status = 'ACTIVE'
                  and id in ($placeholders)
                """.trimIndent(),
                { rs, _ -> rs.uuid("id") },
                *(listOf(clubId.dbString() as Any) + membershipIds.map { it.dbString() as Any }).toTypedArray(),
            ).toSet()
    }

    private fun emailEligibility(
        clubId: UUID,
        eventType: NotificationEventType,
        membershipIds: List<UUID>,
    ): EmailEligibility {
        val preferenceColumn =
            when (eventType) {
                NotificationEventType.NEXT_BOOK_PUBLISHED -> "next_book_published_enabled"
                NotificationEventType.SESSION_REMINDER_DUE -> "session_reminder_due_enabled"
                NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED -> "feedback_document_published_enabled"
                NotificationEventType.REVIEW_PUBLISHED -> "review_published_enabled"
            }
        val placeholders = membershipIds.joinToString(",") { "?" }
        val rows =
            jdbcTemplate.query(
                """
                select
                  memberships.id,
                  users.email,
                  coalesce(notification_preferences.email_enabled, true) as email_enabled,
                  coalesce(notification_preferences.$preferenceColumn, true) as event_enabled
                from memberships
                join users on users.id = memberships.user_id
                left join notification_preferences on notification_preferences.membership_id = memberships.id
                  and notification_preferences.club_id = memberships.club_id
                where memberships.club_id = ?
                  and memberships.id in ($placeholders)
                """.trimIndent(),
                { rs, _ ->
                    EmailEligibilityRow(
                        membershipId = rs.uuid("id"),
                        email = rs.getString("email"),
                        emailEnabled = rs.getBoolean("email_enabled"),
                        eventEnabled = rs.getBoolean("event_enabled"),
                    )
                },
                *(listOf(clubId.dbString() as Any) + membershipIds.map { it.dbString() as Any }).toTypedArray(),
            )
        return EmailEligibility(
            eligibleIds =
                rows
                    .filter { !it.email.isNullOrBlank() && it.emailEnabled && it.eventEnabled }
                    .map { it.membershipId }
                    .sortedBy { it.toString() },
            preferenceSkipped = rows.count { !it.email.isNullOrBlank() && !(it.emailEnabled && it.eventEnabled) },
            missing = rows.count { it.email.isNullOrBlank() },
        )
    }

    private fun ResultSet.toSessionContext(): ManualNotificationSessionContext =
        ManualNotificationSessionContext(
            sessionId = uuid("id"),
            clubId = uuid("club_id"),
            sessionNumber = getInt("number"),
            bookTitle = getString("book_title"),
            date = getDate("session_date")?.toLocalDate(),
            state = getString("state"),
            visibility = getString("visibility"),
            feedbackDocumentUploaded = getBoolean("feedback_document_uploaded"),
        )

    private fun ResultSet.toMemberOption(): ManualNotificationMemberOption {
        val email = getString("email")
        val emailEnabled = getBoolean("email_enabled")
        return ManualNotificationMemberOption(
            membershipId = uuid("membership_id"),
            displayName = getString("display_name"),
            maskedEmail = maskEmail(email),
            role = getString("role"),
            membershipStatus = getString("status"),
            sessionParticipationStatus = getString("participation_status"),
            attendanceStatus = getString("attendance_status"),
            emailEligibility =
                when {
                    email.isNullOrBlank() -> ManualNotificationEligibility.EMAIL_MISSING
                    !emailEnabled -> ManualNotificationEligibility.EMAIL_DISABLED
                    else -> ManualNotificationEligibility.ELIGIBLE
                },
            inAppEligibility = ManualNotificationEligibility.ELIGIBLE,
        )
    }

    private fun ResultSet.toRecentDispatch() =
        com.readmates.notification.application.model.ManualNotificationRecentDispatch(
            manualDispatchId = uuid("id"),
            eventType = NotificationEventType.valueOf(getString("event_type")),
            requestedChannels = ManualNotificationRequestedChannels.valueOf(getString("requested_channels")),
            createdAt = utcOffsetDateTime("created_at"),
            requestedBy = maskEmail(getString("requested_by_email")),
            targetCount = getInt("target_count"),
        )

    private fun ResultSet.toDispatchListItem() =
        ManualNotificationDispatchListItem(
            manualDispatchId = uuid("manual_dispatch_id"),
            eventId = uuid("event_id"),
            source = NotificationDispatchSource.MANUAL,
            eventType = NotificationEventType.valueOf(getString("event_type")),
            sessionId = uuid("session_id"),
            sessionNumber = getInt("session_number"),
            bookTitle = getString("book_title"),
            requestedChannels = ManualNotificationRequestedChannels.valueOf(getString("requested_channels")),
            audience = ManualNotificationAudience.valueOf(getString("audience")),
            resend = getBoolean("resend"),
            requestedBy = maskEmail(getString("requested_by_email")),
            targetCount = getInt("target_count"),
            expectedInAppCount = getInt("expected_in_app_count"),
            expectedEmailCount = getInt("expected_email_count"),
            eventStatus = NotificationEventOutboxStatus.valueOf(getString("event_status")),
            createdAt = utcOffsetDateTime("created_at"),
        )

    private fun maskEmail(email: String?): String {
        val value = email?.trim().orEmpty()
        val at = value.indexOf('@')
        if (at <= 0 || at == value.lastIndex) return "숨김"
        val domain = value.substring(at + 1)
        if (domain.isBlank()) return "숨김"
        return "${value.first()}***@$domain"
    }

    private data class EmailEligibility(
        val eligibleIds: List<UUID>,
        val preferenceSkipped: Int,
        val missing: Int,
    )

    private data class EmailEligibilityRow(
        val membershipId: UUID,
        val email: String?,
        val emailEnabled: Boolean,
        val eventEnabled: Boolean,
    )

    private data class LockedPreview(
        val id: UUID,
        val selectionHash: String,
        val expiresAt: OffsetDateTime,
        val consumedEventId: UUID?,
    )

    private data class ManualMemberCursor(
        val displayName: String,
        val membershipId: String,
    ) {
        companion object {
            fun from(cursor: Map<String, String>): ManualMemberCursor? {
                val displayName = cursor["displayName"]?.takeIf { it.isNotBlank() } ?: return null
                val membershipId = cursor["membershipId"]?.takeIf { it.isNotBlank() } ?: return null
                return ManualMemberCursor(displayName, membershipId)
            }
        }
    }

    private data class ManualDispatchCursor(
        val createdAt: OffsetDateTime,
        val id: String,
    ) {
        companion object {
            fun from(cursor: Map<String, String>): ManualDispatchCursor? {
                val createdAt =
                    cursor["createdAt"]?.let { runCatching { OffsetDateTime.parse(it) }.getOrNull() }
                        ?: return null
                val id = cursor["id"]?.takeIf { it.isNotBlank() } ?: return null
                return ManualDispatchCursor(createdAt, id)
            }
        }
    }
}
