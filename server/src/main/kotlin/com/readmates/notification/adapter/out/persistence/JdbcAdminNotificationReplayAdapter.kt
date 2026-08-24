package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.AdminNotificationFilter
import com.readmates.notification.application.model.AdminNotificationReplayExecution
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
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import tools.jackson.databind.ObjectMapper
import java.time.OffsetDateTime
import java.util.UUID

@Repository
class JdbcAdminNotificationReplayAdapter(
    private val jdbcTemplate: JdbcTemplate,
    objectMapper: ObjectMapper,
) : AdminNotificationReplayPort,
    AdminNotificationAuditPort {
    private val support = AdminNotificationReplayJdbcSupport(jdbcTemplate, objectMapper)

    override fun loadSnapshot(
        filter: AdminNotificationFilter,
        targetLimit: Int,
    ): AdminNotificationReplaySnapshot {
        if (!filter.isEligibleReplayFilter()) return AdminNotificationReplaySnapshot(emptyList(), 0, emptyList())
        val targetScope = exactReplayScope(filter)
        val exclusionScope = replayClassificationScope(filter)
        val targets =
            JdbcArguments.query(
                jdbcTemplate,
                """
                select id, club_id, status, attempt_count, last_error, updated_at
                from notification_deliveries
                where binary channel = binary 'EMAIL'
                  and binary status in (binary 'FAILED', binary 'DEAD')
                  and binary last_error in (binary 'MAIL_RETRYABLE', binary 'MAIL_PERMANENT')
                  ${targetScope.sql}
                order by id
                limit ?
                """.trimIndent(),
                targetScope.args + targetLimit,
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
        val exclusions = support.loadExclusions(exclusionScope)
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
        support.insertTargets(previewId, input.targets)
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
        support.findConfirmation("confirmation.preview_id = ?", previewId)

    override fun findConfirmationById(confirmationId: UUID): AdminNotificationReplayConfirmation? =
        support.findConfirmation("confirmation.id = ?", confirmationId)

    override fun replayPreviewTargets(
        previewId: UUID,
        replayedAt: OffsetDateTime,
    ): AdminNotificationReplayExecution = support.replayPreviewTargets(previewId, replayedAt)

    override fun createConfirmation(input: AdminNotificationReplayConfirmationInsert): UUID {
        jdbcTemplate.update(
            """
            insert into admin_notification_replay_confirmations (
              id, preview_id, actor_user_id, actor_platform_role, club_id, selection_hash,
              replayed_count, skipped_count, platform_audit_event_id, confirmed_at,
              actor_capabilities_json, command_type, target_kind, target_id_snapshot, identity_mode,
              canonical_schema_version, digest_key_version, request_hmac,
              skipped_reason_counts_json, origin_outcome
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, cast(? as json), 'notification.replay',
                      'NOTIFICATION_REPLAY_TARGET_SET', ?, 'HMAC', ?, ?, ?, cast(? as json), 'SUCCEEDED')
            """.trimIndent(),
            input.confirmationId.dbString(),
            input.previewId.dbString(),
            input.actorUserId.dbString(),
            input.actorPlatformRole,
            input.clubId?.dbString(),
            input.selectionHash,
            input.replayedCount,
            input.skippedCount,
            input.platformAuditEventId.dbString(),
            input.confirmedAt.toUtcLocalDateTime(),
            input.actorCapabilitiesJson,
            input.confirmationId.dbString(),
            input.canonicalSchemaVersion,
            input.digestKeyVersion,
            input.requestHmac,
            input.skippedReasonCountsJson,
        )
        support.insertConfirmationOrigin(input)
        return input.confirmationId
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
}

private fun AdminNotificationFilter.isEligibleReplayFilter(): Boolean =
    channel != NotificationChannel.IN_APP &&
        deliveryStatus !in NON_REPLAYABLE_DELIVERY_STATUSES

private fun exactReplayScope(filter: AdminNotificationFilter): ReplayScope {
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

private fun replayClassificationScope(filter: AdminNotificationFilter): ReplayScope {
    val predicates = mutableListOf<String>()
    val args = mutableListOf<Any>()
    filter.clubId?.let {
        predicates += "club_id = ?"
        args += it.dbString()
    }
    filter.channel?.let {
        predicates += "lower(trim(channel)) = lower(?)"
        args += it.name
    }
    filter.deliveryStatus?.let {
        predicates += "lower(trim(status)) = lower(?)"
        args += it.name
    }
    return ReplayScope(
        sql = if (predicates.isEmpty()) "" else "and ${predicates.joinToString(" and ")}",
        args = args,
    )
}

internal data class ReplayScope(
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
