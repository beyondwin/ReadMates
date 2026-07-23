package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.AdminNotificationClubHealth
import com.readmates.notification.application.model.AdminNotificationClubRef
import com.readmates.notification.application.model.AdminNotificationDelivery
import com.readmates.notification.application.model.AdminNotificationFailureCluster
import com.readmates.notification.application.model.AdminNotificationFilter
import com.readmates.notification.application.model.AdminNotificationManualDispatchMetadata
import com.readmates.notification.application.model.AdminNotificationManualDispatchSummary
import com.readmates.notification.application.model.AdminNotificationOperationsSnapshot
import com.readmates.notification.application.model.AdminNotificationOutboxEvent
import com.readmates.notification.application.model.AdminNotificationRelaySummary
import com.readmates.notification.application.model.AdminNotificationReplayEstimate
import com.readmates.notification.application.model.AdminNotificationStatusSummary
import com.readmates.notification.application.model.NotificationDispatchSource
import com.readmates.notification.application.port.out.AdminNotificationAuditPort
import com.readmates.notification.application.port.out.AdminNotificationOperationsReadPort
import com.readmates.notification.application.port.out.AdminNotificationReplayPort
import com.readmates.notification.application.port.out.AdminNotificationReplayPreviewRecord
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.notification.domain.NotificationEventOutboxStatus
import com.readmates.notification.domain.NotificationEventType
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.utcOffsetDateTimeOrNull
import com.readmates.shared.db.uuid
import com.readmates.shared.paging.CursorCodec
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.PreparedStatementSetter
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

@Repository
class JdbcAdminNotificationOperationsAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : AdminNotificationOperationsReadPort,
    AdminNotificationReplayPort,
    AdminNotificationAuditPort {
    private val snapshotQueries = AdminNotificationSnapshotQueries(jdbcTemplate)

    override fun snapshot(): AdminNotificationOperationsSnapshot = snapshotQueries.snapshot()

    override fun listEvents(
        filter: AdminNotificationFilter,
        pageRequest: PageRequest,
    ): CursorPage<AdminNotificationOutboxEvent> {
        val predicates = mutableListOf<String>()
        val args = mutableListOf<Any>()
        filter.clubId?.let {
            predicates += "notification_event_outbox.club_id = ?"
            args += it.dbString()
        }
        filter.eventStatus?.let {
            predicates += "notification_event_outbox.status = ?"
            args += it.name
        }
        appendCursorPredicate("notification_event_outbox", pageRequest, predicates, args)
        args += pageRequest.limit + 1

        val whereClause = predicates.whereClause()
        val rows =
            JdbcArguments.query(
                jdbcTemplate,
                """
                select
                  notification_event_outbox.id,
                  notification_event_outbox.event_type,
                  notification_event_outbox.status,
                  notification_event_outbox.attempt_count,
                  notification_event_outbox.next_attempt_at,
                  notification_event_outbox.created_at,
                  notification_event_outbox.updated_at,
                  notification_event_outbox.last_error,
                  clubs.id as club_id,
                  clubs.slug as club_slug,
                  clubs.name as club_name,
                  notification_manual_dispatches.id as manual_dispatch_id,
                  host_action_notification_decisions.id as host_decision_id,
                  notification_manual_dispatches.target_count as manual_target_count,
                  users.email as requested_by_email
                from notification_event_outbox
                join clubs on clubs.id = notification_event_outbox.club_id
                left join notification_manual_dispatches on notification_manual_dispatches.event_id = notification_event_outbox.id
                  and notification_manual_dispatches.club_id = notification_event_outbox.club_id
                left join host_action_notification_decisions on host_action_notification_decisions.event_id = notification_event_outbox.id
                  and host_action_notification_decisions.club_id = notification_event_outbox.club_id
                left join memberships on memberships.id = notification_manual_dispatches.requested_by_membership_id
                  and memberships.club_id = notification_manual_dispatches.club_id
                left join users on users.id = memberships.user_id
                $whereClause
                order by notification_event_outbox.updated_at desc, notification_event_outbox.created_at desc, notification_event_outbox.id desc
                limit ?
                """.trimIndent(),
                args,
                { resultSet, _ -> resultSet.toAdminNotificationOutboxEvent() },
            )
        return pageFromRows(rows, pageRequest.limit) { row ->
            updatedAtDescCursor(row.updatedAt, row.createdAt, row.eventId.toString())
        }
    }

    override fun listDeliveries(
        filter: AdminNotificationFilter,
        pageRequest: PageRequest,
    ): CursorPage<AdminNotificationDelivery> {
        val predicates = mutableListOf<String>()
        val args = mutableListOf<Any>()
        filter.clubId?.let {
            predicates += "notification_deliveries.club_id = ?"
            args += it.dbString()
        }
        filter.deliveryStatus?.let {
            predicates += "notification_deliveries.status = ?"
            args += it.name
        }
        filter.channel?.let {
            predicates += "notification_deliveries.channel = ?"
            args += it.name
        }
        appendCursorPredicate("notification_deliveries", pageRequest, predicates, args)
        args += pageRequest.limit + 1

        val rows =
            JdbcArguments.query(
                jdbcTemplate,
                """
                select
                  notification_deliveries.id,
                  notification_deliveries.event_id,
                  notification_deliveries.channel,
                  notification_deliveries.status,
                  notification_deliveries.attempt_count,
                  notification_deliveries.created_at,
                  notification_deliveries.updated_at,
                  notification_deliveries.last_error,
                  clubs.id as club_id,
                  clubs.slug as club_slug,
                  clubs.name as club_name,
                  case when notification_deliveries.channel = 'EMAIL' then users.email else null end as recipient_email
                from notification_deliveries
                join notification_event_outbox on notification_event_outbox.id = notification_deliveries.event_id
                  and notification_event_outbox.club_id = notification_deliveries.club_id
                join clubs on clubs.id = notification_deliveries.club_id
                join memberships on memberships.id = notification_deliveries.recipient_membership_id
                  and memberships.club_id = notification_deliveries.club_id
                join users on users.id = memberships.user_id
                ${predicates.whereClause()}
                order by notification_deliveries.updated_at desc, notification_deliveries.created_at desc, notification_deliveries.id desc
                limit ?
                """.trimIndent(),
                args,
                { resultSet, _ -> resultSet.toAdminNotificationDelivery() },
            )
        return pageFromRows(rows, pageRequest.limit) { row ->
            updatedAtDescCursor(row.updatedAt, row.createdAt, row.deliveryId.toString())
        }
    }

    override fun estimateReplayableDeliveries(filter: AdminNotificationFilter): AdminNotificationReplayEstimate {
        val predicates = replayableDeliveryPredicates(filter)
        val rows =
            JdbcArguments.query(
                jdbcTemplate,
                """
                select status, count(*) as count
                from notification_deliveries
                ${predicates.sql}
                group by status
                """.trimIndent(),
                predicates.args,
                { resultSet, _ -> resultSet.getString("status") to resultSet.getInt("count") },
            )
        val byStatus = rows.associate { it.first to it.second }
        return AdminNotificationReplayEstimate(
            matchedCount = byStatus.values.sum(),
            estimatedByStatus = byStatus,
        )
    }

    override fun createPreview(
        actorUserId: UUID,
        filterJson: String,
        selectionHash: String,
        matchedCount: Int,
        expiresAt: OffsetDateTime,
    ): UUID {
        val id = UUID.randomUUID()
        jdbcTemplate.update(
            """
            insert into admin_notification_replay_previews
              (id, actor_user_id, filter_json, selection_hash, matched_count, expires_at)
            values (?, ?, cast(? as json), ?, ?, ?)
            """.trimIndent(),
            id.dbString(),
            actorUserId.dbString(),
            filterJson,
            selectionHash,
            matchedCount,
            expiresAt.toUtcLocalDateTime(),
        )
        return id
    }

    override fun loadOpenPreview(previewId: UUID): AdminNotificationReplayPreviewRecord? =
        jdbcTemplate
            .query(
                """
                select id, actor_user_id, filter_json, selection_hash, matched_count, expires_at
                from admin_notification_replay_previews
                where id = ?
                  and consumed_at is null
                """.trimIndent(),
                { resultSet, _ ->
                    AdminNotificationReplayPreviewRecord(
                        previewId = resultSet.uuid("id"),
                        actorUserId = resultSet.uuid("actor_user_id"),
                        filterJson = resultSet.getString("filter_json"),
                        selectionHash = resultSet.getString("selection_hash"),
                        matchedCount = resultSet.getInt("matched_count"),
                        expiresAt = resultSet.utcOffsetDateTime("expires_at"),
                    )
                },
                previewId.dbString(),
            ).firstOrNull()

    override fun markPreviewConsumed(previewId: UUID): Boolean =
        jdbcTemplate.update(
            """
            update admin_notification_replay_previews
            set consumed_at = utc_timestamp(6)
            where id = ?
              and consumed_at is null
            """.trimIndent(),
            previewId.dbString(),
        ) == 1

    override fun replayDeadOrFailedDeliveries(filter: AdminNotificationFilter): Int {
        val predicates = replayableDeliveryPredicates(filter)
        return JdbcArguments.update(
            jdbcTemplate,
            """
            update notification_deliveries
            set status = 'PENDING',
                attempt_count = 0,
                next_attempt_at = utc_timestamp(6),
                locked_at = null,
                last_error = null,
                updated_at = utc_timestamp(6)
            ${predicates.sql}
            """.trimIndent(),
            predicates.args,
        )
    }

    override fun writeReplayConfirmed(
        actorUserId: UUID,
        actorPlatformRole: String,
        metadataJson: String,
    ) {
        jdbcTemplate.update(
            """
            insert into platform_audit_events
              (id, actor_user_id, actor_platform_role, target_user_id, event_type, metadata_json, created_at)
            values (?, ?, ?, null, 'ADMIN_NOTIFICATION_REPLAY_CONFIRMED', cast(? as json), utc_timestamp(6))
            """.trimIndent(),
            UUID.randomUUID().dbString(),
            actorUserId.dbString(),
            actorPlatformRole,
            metadataJson,
        )
    }
}

private class AdminNotificationSnapshotQueries(
    private val jdbcTemplate: JdbcTemplate,
) {
    fun snapshot(): AdminNotificationOperationsSnapshot =
        AdminNotificationOperationsSnapshot(
            generatedAt =
                jdbcTemplate.queryForObject(
                    "select utc_timestamp(6)",
                    OffsetDateTimeRowMapper,
                ) ?: OffsetDateTime.now(),
            outboxSummary = outboxSummary(),
            deliverySummary = deliverySummary(),
            relaySummary = relaySummary(),
            failureClusters = failureClusters(),
            clubHealth = clubHealth(),
            recentManualDispatches = recentManualDispatches(),
        )

    private fun outboxSummary(): AdminNotificationStatusSummary =
        AdminNotificationStatusSummary(
            pending = countOutbox("PENDING"),
            active = countOutbox("PUBLISHING"),
            failed = countOutbox("FAILED"),
            dead = countOutbox("DEAD"),
            sentOrPublishedLast24h =
                jdbcTemplate.queryForObject(
                    """
                    select count(*)
                    from notification_event_outbox
                    where status = 'PUBLISHED'
                      and published_at >= timestampadd(HOUR, -24, utc_timestamp(6))
                    """.trimIndent(),
                    Int::class.java,
                ) ?: 0,
        )

    private fun deliverySummary(): AdminNotificationStatusSummary =
        AdminNotificationStatusSummary(
            pending = countDelivery("PENDING"),
            active = countDelivery("SENDING"),
            failed = countDelivery("FAILED"),
            dead = countDelivery("DEAD"),
            sentOrPublishedLast24h =
                jdbcTemplate.queryForObject(
                    """
                    select count(*)
                    from notification_deliveries
                    where status = 'SENT'
                      and sent_at >= timestampadd(HOUR, -24, utc_timestamp(6))
                    """.trimIndent(),
                    Int::class.java,
                ) ?: 0,
        )

    private fun relaySummary(): AdminNotificationRelaySummary =
        AdminNotificationRelaySummary(
            publishing = countOutbox("PUBLISHING"),
            sending = countDelivery("SENDING"),
            stalePublishing =
                jdbcTemplate.queryForObject(
                    """
                    select count(*)
                    from notification_event_outbox
                    where status = 'PUBLISHING'
                      and locked_at < timestampadd(MINUTE, -15, utc_timestamp(6))
                    """.trimIndent(),
                    Int::class.java,
                ) ?: 0,
            staleSending =
                jdbcTemplate.queryForObject(
                    """
                    select count(*)
                    from notification_deliveries
                    where status = 'SENDING'
                      and locked_at < timestampadd(MINUTE, -15, utc_timestamp(6))
                    """.trimIndent(),
                    Int::class.java,
                ) ?: 0,
        )

    private fun failureClusters(): List<AdminNotificationFailureCluster> {
        val rows =
            jdbcTemplate.query(
                """
                select coalesce(nullif(last_error, ''), 'unknown') as raw_error, status, updated_at
                from notification_event_outbox
                where status in ('FAILED', 'DEAD')
                union all
                select coalesce(nullif(last_error, ''), 'unknown') as raw_error, status, updated_at
                from notification_deliveries
                where status in ('FAILED', 'DEAD')
                """.trimIndent(),
            ) { resultSet, _ ->
                FailureClusterSeed(
                    safeErrorCode = safeFailureCode(resultSet.getString("raw_error")),
                    status = resultSet.getString("status"),
                    updatedAt = resultSet.utcOffsetDateTime("updated_at"),
                )
            }
        return rows
            .groupBy { it.safeErrorCode to it.status }
            .map { (key, grouped) ->
                AdminNotificationFailureCluster(
                    safeErrorCode = key.first,
                    status = key.second,
                    count = grouped.size,
                    latestAt = grouped.maxOfOrNull { it.updatedAt },
                )
            }.sortedWith(
                compareByDescending<AdminNotificationFailureCluster> { it.count }
                    .thenBy { it.safeErrorCode },
            ).take(FAILURE_CLUSTER_LIMIT)
    }

    private fun clubHealth(): List<AdminNotificationClubHealth> =
        jdbcTemplate.query(
            """
            select
              clubs.id as club_id,
              clubs.slug as club_slug,
              clubs.name as club_name,
              sum(case when notification_deliveries.status in ('PENDING', 'SENDING') then 1 else 0 end) as pending,
              sum(case when notification_deliveries.status = 'FAILED' then 1 else 0 end) as failed,
              sum(case when notification_deliveries.status = 'DEAD' then 1 else 0 end) as dead,
              max(notification_deliveries.sent_at) as last_success_at
            from notification_deliveries
            join clubs on clubs.id = notification_deliveries.club_id
            group by clubs.id, clubs.slug, clubs.name
            having pending > 0 or failed > 0 or dead > 0 or last_success_at is not null
            order by dead desc, failed desc, pending desc, clubs.slug
            limit 25
            """.trimIndent(),
        ) { resultSet, _ ->
            AdminNotificationClubHealth(
                clubId = resultSet.uuid("club_id"),
                slug = resultSet.getString("club_slug"),
                name = resultSet.getString("club_name"),
                pending = resultSet.getInt("pending"),
                failed = resultSet.getInt("failed"),
                dead = resultSet.getInt("dead"),
                lastSuccessAt = resultSet.utcOffsetDateTimeOrNull("last_success_at"),
            )
        }

    private fun recentManualDispatches(): List<AdminNotificationManualDispatchSummary> =
        jdbcTemplate.query(
            """
            select
              notification_manual_dispatches.id,
              notification_manual_dispatches.event_id,
              notification_manual_dispatches.club_id,
              clubs.name as club_name,
              notification_manual_dispatches.event_type,
              notification_event_outbox.status as event_status,
              notification_manual_dispatches.target_count,
              notification_manual_dispatches.created_at
            from notification_manual_dispatches
            join notification_event_outbox on notification_event_outbox.id = notification_manual_dispatches.event_id
              and notification_event_outbox.club_id = notification_manual_dispatches.club_id
            join clubs on clubs.id = notification_manual_dispatches.club_id
            order by notification_manual_dispatches.created_at desc, notification_manual_dispatches.id desc
            limit 10
            """.trimIndent(),
        ) { resultSet, _ ->
            AdminNotificationManualDispatchSummary(
                manualDispatchId = resultSet.uuid("id"),
                eventId = resultSet.uuid("event_id"),
                clubId = resultSet.uuid("club_id"),
                clubName = resultSet.getString("club_name"),
                eventType = NotificationEventType.valueOf(resultSet.getString("event_type")),
                eventStatus = NotificationEventOutboxStatus.valueOf(resultSet.getString("event_status")),
                targetCount = resultSet.getInt("target_count"),
                createdAt = resultSet.utcOffsetDateTime("created_at"),
            )
        }

    private fun countOutbox(status: String): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from notification_event_outbox where status = ?",
            Int::class.java,
            status,
        ) ?: 0

    private fun countDelivery(status: String): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from notification_deliveries where status = ?",
            Int::class.java,
            status,
        ) ?: 0
}

private object OffsetDateTimeRowMapper : RowMapper<OffsetDateTime> {
    override fun mapRow(
        rs: ResultSet,
        rowNum: Int,
    ): OffsetDateTime = rs.getObject(1, LocalDateTime::class.java).atOffset(ZoneOffset.UTC)
}

private data class SqlPredicates(
    val sql: String,
    val args: List<Any>,
)

private object JdbcArguments {
    fun <T> query(
        jdbcTemplate: JdbcTemplate,
        sql: String,
        args: List<Any>,
        mapper: (ResultSet, Int) -> T,
    ): List<T> =
        jdbcTemplate.query(
            sql,
            PreparedStatementSetter { statement -> bind(statement, args) },
            RowMapper { resultSet, rowNum -> mapper(resultSet, rowNum) },
        )

    fun update(
        jdbcTemplate: JdbcTemplate,
        sql: String,
        args: List<Any>,
    ): Int =
        jdbcTemplate.update(
            sql,
            PreparedStatementSetter { statement -> bind(statement, args) },
        )

    private fun bind(
        statement: java.sql.PreparedStatement,
        args: List<Any>,
    ) {
        args.forEachIndexed { index, arg ->
            statement.setObject(index + 1, arg)
        }
    }
}

private fun replayableDeliveryPredicates(filter: AdminNotificationFilter): SqlPredicates {
    val predicates =
        mutableListOf(
            "channel = 'EMAIL'",
            "status in ('FAILED', 'DEAD')",
        )
    val args = mutableListOf<Any>()
    filter.clubId?.let {
        predicates += "club_id = ?"
        args += it.dbString()
    }
    filter.deliveryStatus
        ?.takeIf { it in setOf(NotificationDeliveryStatus.FAILED, NotificationDeliveryStatus.DEAD) }
        ?.let {
            predicates += "status = ?"
            args += it.name
        }
    return SqlPredicates("where ${predicates.joinToString(" and ")}", args)
}

private data class FailureClusterSeed(
    val safeErrorCode: String,
    val status: String,
    val updatedAt: OffsetDateTime,
)

private fun ResultSet.toAdminNotificationOutboxEvent(): AdminNotificationOutboxEvent =
    AdminNotificationOutboxEvent(
        eventId = uuid("id"),
        club = adminClubRef(),
        eventType = NotificationEventType.valueOf(getString("event_type")),
        source =
            when {
                getString("manual_dispatch_id") != null -> NotificationDispatchSource.MANUAL
                getString("host_decision_id") != null -> NotificationDispatchSource.HOST_CONFIRMED
                else -> NotificationDispatchSource.AUTOMATIC
            },
        status = NotificationEventOutboxStatus.valueOf(getString("status")),
        attemptCount = getInt("attempt_count"),
        nextAttemptAt = utcOffsetDateTimeOrNull("next_attempt_at"),
        createdAt = utcOffsetDateTime("created_at"),
        updatedAt = utcOffsetDateTime("updated_at"),
        safeErrorCode = getString("last_error")?.let(::safeFailureCode),
        manualDispatch =
            getString("manual_dispatch_id")?.let {
                AdminNotificationManualDispatchMetadata(
                    manualDispatchId = UUID.fromString(it),
                    requestedBy = maskEmailForAdmin(getString("requested_by_email")),
                    targetCount = getInt("manual_target_count"),
                )
            },
    )

private fun ResultSet.toAdminNotificationDelivery(): AdminNotificationDelivery =
    AdminNotificationDelivery(
        deliveryId = uuid("id"),
        eventId = uuid("event_id"),
        club = adminClubRef(),
        channel = NotificationChannel.valueOf(getString("channel")),
        status = NotificationDeliveryStatus.valueOf(getString("status")),
        maskedRecipient = getString("recipient_email")?.let(::maskEmailForAdmin),
        attemptCount = getInt("attempt_count"),
        createdAt = utcOffsetDateTime("created_at"),
        updatedAt = utcOffsetDateTime("updated_at"),
        safeErrorCode = getString("last_error")?.let(::safeFailureCode),
    )

private fun ResultSet.adminClubRef(): AdminNotificationClubRef =
    AdminNotificationClubRef(
        clubId = uuid("club_id"),
        slug = getString("club_slug"),
        name = getString("club_name"),
    )

private fun appendCursorPredicate(
    table: String,
    pageRequest: PageRequest,
    predicates: MutableList<String>,
    args: MutableList<Any>,
) {
    val cursor = UpdatedAtDescCursor.from(pageRequest.cursor) ?: return
    predicates +=
        """
        (
          $table.updated_at < ?
          or ($table.updated_at = ? and $table.created_at < ?)
          or ($table.updated_at = ? and $table.created_at = ? and $table.id < ?)
        )
        """.trimIndent()
    args += cursor.updatedAt.toUtcLocalDateTime()
    args += cursor.updatedAt.toUtcLocalDateTime()
    args += cursor.createdAt.toUtcLocalDateTime()
    args += cursor.updatedAt.toUtcLocalDateTime()
    args += cursor.createdAt.toUtcLocalDateTime()
    args += cursor.id
}

private fun List<String>.whereClause(): String = if (isEmpty()) "" else "where ${joinToString(" and ")}"

private fun safeFailureCode(raw: String?): String {
    val normalized = raw?.lowercase().orEmpty()
    return when {
        normalized.isBlank() -> "unknown"
        "timeout" in normalized -> "provider_timeout"
        "mailbox" in normalized || "550" in normalized -> "mailbox_unavailable"
        "smtp" in normalized || "provider" in normalized -> "provider_delivery_error"
        "sql" in normalized || "exception" in normalized -> "delivery_state_error"
        else -> "delivery_failure"
    }
}

private fun maskEmailForAdmin(email: String?): String {
    val value = email?.trim().orEmpty()
    val at = value.indexOf('@')
    if (value.isBlank() || at <= 0 || at == value.lastIndex) {
        return "unknown"
    }
    return "${value.first()}***@${value.substring(at + 1)}"
}

private fun updatedAtDescCursor(
    updatedAt: OffsetDateTime,
    createdAt: OffsetDateTime,
    id: String,
): String? =
    CursorCodec.encode(
        mapOf(
            "updatedAt" to updatedAt.toString(),
            "createdAt" to createdAt.toString(),
            "id" to id,
        ),
    )

private fun <T> pageFromRows(
    rows: List<T>,
    limit: Int,
    cursorFor: (T) -> String?,
): CursorPage<T> {
    val visibleRows = rows.take(limit)
    return CursorPage(
        items = visibleRows,
        nextCursor = if (rows.size > limit) visibleRows.lastOrNull()?.let(cursorFor) else null,
    )
}

private data class UpdatedAtDescCursor(
    val updatedAt: OffsetDateTime,
    val createdAt: OffsetDateTime,
    val id: String,
) {
    companion object {
        fun from(cursor: Map<String, String>): UpdatedAtDescCursor? {
            val updatedAt = cursor["updatedAt"]?.parseOffsetDateTime()
            val createdAt = cursor["createdAt"]?.parseOffsetDateTime()
            val id = cursor["id"]?.takeIf { it.isNotBlank() }
            return if (updatedAt != null && createdAt != null && id != null) {
                UpdatedAtDescCursor(updatedAt, createdAt, id)
            } else {
                null
            }
        }

        @Suppress("ktlint:standard:function-expression-body")
        private fun String.parseOffsetDateTime(): OffsetDateTime? {
            return runCatching { OffsetDateTime.parse(this) }.getOrNull()
        }
    }
}

private const val FAILURE_CLUSTER_LIMIT = 12
