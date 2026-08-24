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
import org.springframework.jdbc.core.BatchPreparedStatementSetter
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import tools.jackson.databind.ObjectMapper
import java.sql.PreparedStatement
import java.sql.ResultSet
import java.time.OffsetDateTime
import java.util.UUID

@Repository
class JdbcAdminNotificationReplayAdapter(
    private val jdbcTemplate: JdbcTemplate,
    private val objectMapper: ObjectMapper,
) : AdminNotificationReplayPort,
    AdminNotificationAuditPort {
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
        val exclusions = loadExclusions(exclusionScope)
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
        findConfirmation("confirmation.preview_id = ?", previewId)

    override fun findConfirmationById(confirmationId: UUID): AdminNotificationReplayConfirmation? =
        findConfirmation("confirmation.id = ?", confirmationId)

    override fun replayPreviewTargets(
        previewId: UUID,
        replayedAt: OffsetDateTime,
    ): AdminNotificationReplayExecution {
        val targets = lockReplayTargets(previewId)
        val replayedTargetIds = mutableListOf<UUID>()
        val skipped = sortedMapOf<String, Int>()
        targets.forEach { target ->
            val reason = target.skipReason()
            if (reason == null) {
                check(updateReplayTarget(target, replayedAt)) { "Locked replay target changed" }
                replayedTargetIds += target.deliveryId
            } else {
                skipped[reason] = skipped.getOrDefault(reason, 0) + 1
            }
        }
        return AdminNotificationReplayExecution(replayedTargetIds, skipped)
    }

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
        insertConfirmationTargets(input.confirmationId, input.replayedTargetIds)
        insertConvergence(input.convergenceId, input.confirmationId, input.confirmedAt)
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

    private fun findConfirmation(
        predicate: String,
        id: UUID,
    ): AdminNotificationReplayConfirmation? =
        jdbcTemplate
            .query(
                """
                select confirmation.id, confirmation.preview_id, confirmation.actor_user_id,
                       confirmation.actor_platform_role, confirmation.club_id, confirmation.selection_hash,
                       confirmation.replayed_count, confirmation.skipped_count, confirmation.confirmed_at,
                       cast(confirmation.actor_capabilities_json as char) actor_capabilities_json,
                       confirmation.command_type, confirmation.target_kind, confirmation.target_id_snapshot,
                       confirmation.identity_mode, confirmation.canonical_schema_version,
                       confirmation.digest_key_version, confirmation.request_hmac,
                       cast(confirmation.skipped_reason_counts_json as char) skipped_reason_counts_json,
                       confirmation.origin_outcome, convergence.id convergence_id, convergence.state effect_status
                from admin_notification_replay_confirmations confirmation
                left join admin_service_command_convergence convergence
                  on convergence.notification_receipt_id_snapshot = confirmation.id
                 and binary convergence.effect_type = binary 'NOTIFICATION_REPLAY'
                 and convergence.effect_target_id_snapshot = confirmation.id
                where $predicate
                for share
                """.trimIndent(),
                { resultSet, _ -> resultSet.toConfirmation() },
                id.dbString(),
            ).firstOrNull()

    private fun ResultSet.toConfirmation(): AdminNotificationReplayConfirmation =
        AdminNotificationReplayConfirmation(
            confirmationId = uuid("id"),
            previewId = uuid("preview_id"),
            actorUserId = uuid("actor_user_id"),
            actorPlatformRole = getString("actor_platform_role"),
            clubId = getString("club_id")?.let(UUID::fromString),
            selectionHash = getString("selection_hash"),
            replayedCount = getInt("replayed_count"),
            skippedCount = getInt("skipped_count"),
            confirmedAt = utcOffsetDateTime("confirmed_at"),
            actorCapabilities = jsonStringList(getString("actor_capabilities_json")),
            commandType = getString("command_type"),
            targetKind = getString("target_kind"),
            targetIdSnapshot = uuid("target_id_snapshot"),
            identityMode = getString("identity_mode"),
            canonicalSchemaVersion = getString("canonical_schema_version"),
            digestKeyVersion = getObject("digest_key_version")?.let { getInt("digest_key_version") },
            requestHmac = getBytes("request_hmac"),
            skippedReasonCounts = jsonCountMap(getString("skipped_reason_counts_json")),
            originStatus = getString("origin_outcome"),
            convergenceId = getString("convergence_id")?.let(UUID::fromString),
            effectStatus = getString("effect_status"),
        )

    private fun jsonStringList(json: String?): List<String>? =
        json?.let { objectMapper.readValue(it, List::class.java).map(Any?::toString) }

    private fun jsonCountMap(json: String?): Map<String, Int> =
        json
            ?.let { objectMapper.readValue(it, Map::class.java) }
            ?.entries
            ?.associate { (key, value) -> key.toString() to (value as Number).toInt() }
            ?: emptyMap()

    private fun lockReplayTargets(previewId: UUID): List<LockedReplayTarget> =
        jdbcTemplate.query(
            """
            select target.delivery_id, target.club_id, target.expected_status,
                   target.expected_attempt_count, target.expected_failure_code, target.expected_updated_at,
                   delivery.id actual_delivery_id, delivery.club_id actual_club_id,
                   delivery.channel actual_channel, delivery.status actual_status,
                   delivery.attempt_count actual_attempt_count, delivery.last_error actual_failure_code,
                   delivery.updated_at actual_updated_at, delivery.locked_at actual_locked_at
            from admin_notification_replay_preview_targets target
            left join notification_deliveries delivery on delivery.id = target.delivery_id
            where target.preview_id = ?
            order by target.delivery_id
            for update
            """.trimIndent(),
            { resultSet, _ ->
                LockedReplayTarget(
                    deliveryId = resultSet.uuid("delivery_id"),
                    clubId = resultSet.uuid("club_id"),
                    expectedStatus = resultSet.getString("expected_status"),
                    expectedAttemptCount = resultSet.getInt("expected_attempt_count"),
                    expectedFailureCode = resultSet.getString("expected_failure_code"),
                    expectedUpdatedAt = resultSet.utcOffsetDateTime("expected_updated_at"),
                    actualDeliveryId = resultSet.getString("actual_delivery_id")?.let(UUID::fromString),
                    actualClubId = resultSet.getString("actual_club_id")?.let(UUID::fromString),
                    actualChannel = resultSet.getString("actual_channel"),
                    actualStatus = resultSet.getString("actual_status"),
                    actualAttemptCount = resultSet.getObject("actual_attempt_count")?.let { resultSet.getInt("actual_attempt_count") },
                    actualFailureCode = resultSet.getString("actual_failure_code"),
                    actualUpdatedAt = resultSet.utcOffsetDateTimeOrNull("actual_updated_at"),
                    locked = resultSet.getObject("actual_locked_at") != null,
                )
            },
            previewId.dbString(),
        )

    private fun updateReplayTarget(
        target: LockedReplayTarget,
        replayedAt: OffsetDateTime,
    ): Boolean =
        jdbcTemplate.update(
            """
            update notification_deliveries
            set status = 'PENDING', attempt_count = 0, next_attempt_at = ?, locked_at = null,
                last_error = null, updated_at = ?
            where id = ? and club_id = ? and binary channel = binary 'EMAIL'
              and binary status = binary ? and attempt_count = ?
              and binary last_error = binary ? and updated_at = ? and locked_at is null
            """.trimIndent(),
            replayedAt.toUtcLocalDateTime(),
            replayedAt.toUtcLocalDateTime(),
            target.deliveryId.dbString(),
            target.clubId.dbString(),
            target.expectedStatus,
            target.expectedAttemptCount,
            target.expectedFailureCode,
            target.expectedUpdatedAt.toUtcLocalDateTime(),
        ) == 1

    private fun insertConfirmationTargets(
        confirmationId: UUID,
        deliveryIds: List<UUID>,
    ) {
        deliveryIds.forEach { deliveryId ->
            jdbcTemplate.update(
                """
                insert into admin_notification_replay_confirmation_targets
                  (confirmation_id, delivery_id_snapshot) values (?, ?)
                """.trimIndent(),
                confirmationId.dbString(),
                deliveryId.dbString(),
            )
        }
    }

    private fun insertConvergence(
        convergenceId: UUID,
        confirmationId: UUID,
        createdAt: OffsetDateTime,
    ) {
        jdbcTemplate.update(
            """
            insert into admin_service_command_convergence (
              id, notification_receipt_id_snapshot, ai_receipt_id_snapshot, effect_type,
              effect_target_id_snapshot, state, attempt_count, next_attempt_no,
              lease_owner, lease_expires_at, last_safe_error_code, available_at, created_at, updated_at
            ) values (?, ?, null, 'NOTIFICATION_REPLAY', ?, 'PENDING', 0, 1,
                      null, null, null, ?, ?, ?)
            """.trimIndent(),
            convergenceId.dbString(),
            confirmationId.dbString(),
            confirmationId.dbString(),
            createdAt.toUtcLocalDateTime(),
            createdAt.toUtcLocalDateTime(),
            createdAt.toUtcLocalDateTime(),
        )
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

                override fun setValues(
                    statement: PreparedStatement,
                    index: Int,
                ) {
                    val target = targets[index]
                    var parameterIndex = 1
                    statement.setString(parameterIndex++, previewId.dbString())
                    statement.setString(parameterIndex++, target.deliveryId.dbString())
                    statement.setString(parameterIndex++, target.clubId.dbString())
                    statement.setString(parameterIndex++, target.status)
                    statement.setInt(parameterIndex++, target.attemptCount)
                    statement.setString(parameterIndex++, target.failureCode)
                    statement.setObject(parameterIndex, target.updatedAt.toUtcLocalDateTime())
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

private data class ReplayScope(
    val sql: String,
    val args: List<Any>,
)

private data class LockedReplayTarget(
    val deliveryId: UUID,
    val clubId: UUID,
    val expectedStatus: String,
    val expectedAttemptCount: Int,
    val expectedFailureCode: String,
    val expectedUpdatedAt: OffsetDateTime,
    val actualDeliveryId: UUID?,
    val actualClubId: UUID?,
    val actualChannel: String?,
    val actualStatus: String?,
    val actualAttemptCount: Int?,
    val actualFailureCode: String?,
    val actualUpdatedAt: OffsetDateTime?,
    val locked: Boolean,
) {
    fun skipReason(): String? =
        when {
            actualDeliveryId == null -> "TARGET_MISSING"
            locked -> "TARGET_LOCKED"
            actualClubId != clubId || actualChannel != "EMAIL" -> "TARGET_STATE_CHANGED"
            actualStatus != expectedStatus || actualAttemptCount != expectedAttemptCount -> "TARGET_STATE_CHANGED"
            actualFailureCode != expectedFailureCode || actualUpdatedAt != expectedUpdatedAt -> "TARGET_STATE_CHANGED"
            else -> null
        }
}

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
