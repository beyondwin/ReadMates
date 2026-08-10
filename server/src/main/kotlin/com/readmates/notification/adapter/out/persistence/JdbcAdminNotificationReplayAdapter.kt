package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.AdminNotificationFilter
import com.readmates.notification.application.model.AdminNotificationReplaySnapshot
import com.readmates.notification.application.model.AdminNotificationReplayTarget
import com.readmates.notification.application.port.out.AdminNotificationAuditPort
import com.readmates.notification.application.port.out.AdminNotificationReplayConfirmation
import com.readmates.notification.application.port.out.AdminNotificationReplayConfirmationInsert
import com.readmates.notification.application.port.out.AdminNotificationReplayPort
import com.readmates.notification.application.port.out.AdminNotificationReplayPreviewInsert
import com.readmates.notification.application.port.out.AdminNotificationReplayPreviewRecord
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.utcOffsetDateTimeOrNull
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.BatchPreparedStatementSetter
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.PreparedStatement
import java.time.OffsetDateTime
import java.util.UUID

@Repository
class JdbcAdminNotificationReplayAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : AdminNotificationReplayPort,
    AdminNotificationAuditPort {
    override fun loadSnapshot(
        filter: AdminNotificationFilter,
        targetLimit: Int,
    ): AdminNotificationReplaySnapshot {
        if (!filter.isEligibleReplayFilter()) return AdminNotificationReplaySnapshot(emptyList(), 0, emptyList())
        val scope = replayScope(filter)
        val targets =
            JdbcArguments.query(
                jdbcTemplate,
                """
                select id, club_id, status, attempt_count, last_error, updated_at
                from notification_deliveries
                where binary channel = binary 'EMAIL'
                  and binary status in (binary 'FAILED', binary 'DEAD')
                  and binary last_error in (binary 'MAIL_RETRYABLE', binary 'MAIL_PERMANENT')
                  ${scope.sql}
                order by id
                limit ?
                """.trimIndent(),
                scope.args + targetLimit,
                { resultSet, _ ->
                    AdminNotificationReplayTarget(
                        deliveryId = resultSet.uuid("id"),
                        clubId = resultSet.uuid("club_id"),
                        status = resultSet.getString("status"),
                        attemptCount = resultSet.getInt("attempt_count"),
                        failureCode = resultSet.getString("last_error"),
                        updatedAt = resultSet.utcOffsetDateTime("updated_at"),
                    )
                },
            )
        val exclusions = loadExclusions(scope)
        return AdminNotificationReplaySnapshot(
            targets = targets,
            excludedCount = exclusions.values.sum(),
            warnings = REPLAY_WARNING_ORDER.filter { exclusions.getOrDefault(it, 0) > 0 },
        )
    }

    override fun createPreview(input: AdminNotificationReplayPreviewInsert): UUID {
        val previewId = UUID.randomUUID()
        jdbcTemplate.update(
            """
            insert into admin_notification_replay_previews (
              id, actor_user_id, filter_json, selection_hash, matched_count, expires_at, created_at,
              contract_version, actor_platform_role, club_id
            ) values (?, ?, cast(? as json), ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            previewId.dbString(),
            input.actorUserId.dbString(),
            input.filterJson,
            input.selectionHash,
            input.targets.size,
            input.expiresAt.toUtcLocalDateTime(),
            input.createdAt.toUtcLocalDateTime(),
            input.contractVersion,
            input.actorPlatformRole,
            input.clubId?.dbString(),
        )
        insertTargets(previewId, input.targets)
        return previewId
    }

    override fun lockPreview(previewId: UUID): AdminNotificationReplayPreviewRecord? =
        jdbcTemplate
            .query(
                """
                select id, contract_version, actor_user_id, actor_platform_role, club_id, filter_json,
                       selection_hash, matched_count, expires_at, consumed_at
                from admin_notification_replay_previews
                where id = ?
                for update
                """.trimIndent(),
                { resultSet, _ ->
                    AdminNotificationReplayPreviewRecord(
                        previewId = resultSet.uuid("id"),
                        contractVersion = resultSet.getInt("contract_version"),
                        actorUserId = resultSet.uuid("actor_user_id"),
                        actorPlatformRole = resultSet.getString("actor_platform_role"),
                        clubId = resultSet.getString("club_id")?.let(UUID::fromString),
                        filterJson = resultSet.getString("filter_json"),
                        selectionHash = resultSet.getString("selection_hash"),
                        matchedCount = resultSet.getInt("matched_count"),
                        expiresAt = resultSet.utcOffsetDateTime("expires_at"),
                        consumedAt = resultSet.utcOffsetDateTimeOrNull("consumed_at"),
                    )
                },
                previewId.dbString(),
            ).firstOrNull()

    override fun findConfirmation(previewId: UUID): AdminNotificationReplayConfirmation? =
        jdbcTemplate
            .query(
                """
                select id, preview_id, actor_user_id, actor_platform_role, club_id, selection_hash,
                       replayed_count, skipped_count, confirmed_at
                from admin_notification_replay_confirmations
                where preview_id = ?
                """.trimIndent(),
                { resultSet, _ ->
                    AdminNotificationReplayConfirmation(
                        confirmationId = resultSet.uuid("id"),
                        previewId = resultSet.uuid("preview_id"),
                        actorUserId = resultSet.uuid("actor_user_id"),
                        actorPlatformRole = resultSet.getString("actor_platform_role"),
                        clubId = resultSet.getString("club_id")?.let(UUID::fromString),
                        selectionHash = resultSet.getString("selection_hash"),
                        replayedCount = resultSet.getInt("replayed_count"),
                        skippedCount = resultSet.getInt("skipped_count"),
                        confirmedAt = resultSet.utcOffsetDateTime("confirmed_at"),
                    )
                },
                previewId.dbString(),
            ).firstOrNull()

    override fun replayPreviewTargets(
        previewId: UUID,
        replayedAt: OffsetDateTime,
    ): Int =
        jdbcTemplate.update(
            """
            update notification_deliveries as delivery
            join admin_notification_replay_preview_targets as target
              on target.preview_id = ?
             and target.delivery_id = delivery.id
             and target.club_id = delivery.club_id
            set delivery.status = 'PENDING',
                delivery.attempt_count = 0,
                delivery.next_attempt_at = ?,
                delivery.locked_at = null,
                delivery.last_error = null,
                delivery.updated_at = ?
            where binary delivery.channel = binary 'EMAIL'
              and binary delivery.status = binary target.expected_status
              and delivery.attempt_count = target.expected_attempt_count
              and binary delivery.last_error = binary target.expected_failure_code
              and delivery.updated_at = target.expected_updated_at
              and delivery.locked_at is null
            """.trimIndent(),
            previewId.dbString(),
            replayedAt.toUtcLocalDateTime(),
            replayedAt.toUtcLocalDateTime(),
        )

    override fun createConfirmation(input: AdminNotificationReplayConfirmationInsert): UUID {
        val confirmationId = UUID.randomUUID()
        jdbcTemplate.update(
            """
            insert into admin_notification_replay_confirmations (
              id, preview_id, actor_user_id, actor_platform_role, club_id, selection_hash,
              replayed_count, skipped_count, platform_audit_event_id, confirmed_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            confirmationId.dbString(),
            input.previewId.dbString(),
            input.actorUserId.dbString(),
            input.actorPlatformRole,
            input.clubId?.dbString(),
            input.selectionHash,
            input.replayedCount,
            input.skippedCount,
            input.platformAuditEventId.dbString(),
            input.confirmedAt.toUtcLocalDateTime(),
        )
        return confirmationId
    }

    override fun consumePreview(
        previewId: UUID,
        confirmationId: UUID,
        consumedAt: OffsetDateTime,
    ): Boolean =
        jdbcTemplate.update(
            """
            update admin_notification_replay_previews
            set consumed_at = ?, consumed_confirmation_id = ?
            where id = ?
              and contract_version = 2
              and consumed_at is null
              and consumed_confirmation_id is null
            """.trimIndent(),
            consumedAt.toUtcLocalDateTime(),
            confirmationId.dbString(),
            previewId.dbString(),
        ) == 1

    override fun writeReplayConfirmed(
        actorUserId: UUID,
        actorPlatformRole: String,
        metadataJson: String,
        createdAt: OffsetDateTime,
    ): UUID {
        val auditEventId = UUID.randomUUID()
        jdbcTemplate.update(
            """
            insert into platform_audit_events
              (id, actor_user_id, actor_platform_role, target_user_id, event_type, metadata_json, created_at)
            values (?, ?, ?, null, 'ADMIN_NOTIFICATION_REPLAY_CONFIRMED', cast(? as json), ?)
            """.trimIndent(),
            auditEventId.dbString(),
            actorUserId.dbString(),
            actorPlatformRole,
            metadataJson,
            createdAt.toUtcLocalDateTime(),
        )
        return auditEventId
    }

    private fun insertTargets(
        previewId: UUID,
        targets: List<AdminNotificationReplayTarget>,
    ) {
        if (targets.isEmpty()) return
        jdbcTemplate.batchUpdate(
            """
            insert into admin_notification_replay_preview_targets (
              preview_id, delivery_id, club_id, expected_status, expected_attempt_count,
              expected_failure_code, expected_updated_at
            ) values (?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            object : BatchPreparedStatementSetter {
                override fun getBatchSize(): Int = targets.size

                @Suppress("MagicNumber")
                override fun setValues(
                    statement: PreparedStatement,
                    index: Int,
                ) {
                    val target = targets[index]
                    statement.setString(1, previewId.dbString())
                    statement.setString(2, target.deliveryId.dbString())
                    statement.setString(3, target.clubId.dbString())
                    statement.setString(4, target.status)
                    statement.setInt(5, target.attemptCount)
                    statement.setString(6, target.failureCode)
                    statement.setObject(7, target.updatedAt.toUtcLocalDateTime())
                }
            },
        )
    }

    private fun loadExclusions(scope: ReplayScope): Map<String, Int> =
        JdbcArguments
            .query(
                jdbcTemplate,
                """
                select exclusion_category, count(*) as excluded_count
                from (
                  select case
                    when binary channel <> binary 'EMAIL' then 'CHANNEL_NONCANONICAL'
                    when binary status not in (binary 'FAILED', binary 'DEAD') then 'STATUS_NONCANONICAL'
                    when last_error is null or octet_length(last_error) = 0 then 'FAILURE_CODE_MISSING'
                    when binary last_error = binary 'MAIL_AMBIGUOUS' then 'MAIL_AMBIGUOUS'
                    when binary last_error = binary 'DELIVERY_EXPIRED' then 'DELIVERY_EXPIRED'
                    when binary last_error = binary 'DELIVERY_CONTENT_INVALID' then 'DELIVERY_CONTENT_INVALID'
                    when lower(trim(last_error)) in ('mail_retryable', 'mail_permanent') then 'FAILURE_CODE_NONCANONICAL'
                    else 'FAILURE_CODE_UNKNOWN'
                  end as exclusion_category
                  from notification_deliveries
                  where (
                    binary status in (binary 'FAILED', binary 'DEAD')
                    or lower(trim(status)) in ('failed', 'dead')
                    or binary status not in (
                      binary 'PENDING', binary 'SENDING', binary 'SENT',
                      binary 'FAILED', binary 'DEAD', binary 'SKIPPED'
                    )
                  )
                    ${scope.sql}
                    and not coalesce((
                      binary channel = binary 'EMAIL'
                      and binary status in (binary 'FAILED', binary 'DEAD')
                      and binary last_error in (binary 'MAIL_RETRYABLE', binary 'MAIL_PERMANENT')
                    ), false)
                ) exclusions
                group by exclusion_category
                """.trimIndent(),
                scope.args,
                { resultSet, _ -> resultSet.getString("exclusion_category") to resultSet.getInt("excluded_count") },
            ).associate { it }
}

private fun AdminNotificationFilter.isEligibleReplayFilter(): Boolean =
    channel != NotificationChannel.IN_APP &&
        deliveryStatus !in NON_REPLAYABLE_DELIVERY_STATUSES

private fun replayScope(filter: AdminNotificationFilter): ReplayScope {
    val predicates = mutableListOf<String>()
    val args = mutableListOf<Any>()
    filter.clubId?.let {
        predicates += "club_id = ?"
        args += it.dbString()
    }
    filter.channel?.let {
        predicates += "binary channel = binary ?"
        args += it.name
    }
    filter.deliveryStatus?.let {
        predicates += "binary status = binary ?"
        args += it.name
    }
    return ReplayScope(
        sql = if (predicates.isEmpty()) "" else "and ${predicates.joinToString(" and ")}",
        args = args,
    )
}

private data class ReplayScope(
    val sql: String,
    val args: List<Any>,
)

private val REPLAY_WARNING_ORDER =
    listOf(
        "CHANNEL_NONCANONICAL",
        "STATUS_NONCANONICAL",
        "FAILURE_CODE_MISSING",
        "MAIL_AMBIGUOUS",
        "DELIVERY_EXPIRED",
        "DELIVERY_CONTENT_INVALID",
        "FAILURE_CODE_NONCANONICAL",
        "FAILURE_CODE_UNKNOWN",
    )

private val NON_REPLAYABLE_DELIVERY_STATUSES =
    setOf(
        NotificationDeliveryStatus.PENDING,
        NotificationDeliveryStatus.SENDING,
        NotificationDeliveryStatus.SENT,
        NotificationDeliveryStatus.SKIPPED,
    )
