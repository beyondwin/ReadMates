package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.AdminNotificationReplayExecution
import com.readmates.notification.application.model.AdminNotificationReplayTarget
import com.readmates.notification.application.port.out.AdminNotificationReplayConfirmation
import com.readmates.notification.application.port.out.AdminNotificationReplayConfirmationInsert
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.utcOffsetDateTimeOrNull
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.BatchPreparedStatementSetter
import org.springframework.jdbc.core.JdbcTemplate
import tools.jackson.databind.ObjectMapper
import java.sql.PreparedStatement
import java.sql.ResultSet
import java.time.OffsetDateTime
import java.util.UUID

internal class AdminNotificationReplayJdbcSupport(
    private val jdbcTemplate: JdbcTemplate,
    private val objectMapper: ObjectMapper,
) {
    fun findConfirmation(
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
                { resultSet, _ -> resultSet.toConfirmation(objectMapper) },
                id.dbString(),
            ).firstOrNull()

    fun replayPreviewTargets(
        previewId: UUID,
        replayedAt: OffsetDateTime,
    ): AdminNotificationReplayExecution {
        val replayedTargetIds = mutableListOf<UUID>()
        val skipped = sortedMapOf<String, Int>()
        lockReplayTargets(previewId).forEach { target ->
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

    fun insertConfirmationOrigin(input: AdminNotificationReplayConfirmationInsert) {
        insertConfirmationTargets(input.confirmationId, input.replayedTargetIds)
        insertConvergence(input.convergenceId, input.confirmationId, input.confirmedAt)
    }

    fun insertTargets(
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

    fun loadExclusions(scope: ReplayScope): Map<String, Int> =
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
                    when lower(trim(last_error)) in ('mail_retryable', 'mail_permanent')
                      then 'FAILURE_CODE_NONCANONICAL'
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
            { resultSet, _ -> resultSet.toLockedReplayTarget() },
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
}

private fun ResultSet.toConfirmation(objectMapper: ObjectMapper): AdminNotificationReplayConfirmation =
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
        actorCapabilities = objectMapper.jsonStringList(getString("actor_capabilities_json")),
        commandType = getString("command_type"),
        targetKind = getString("target_kind"),
        targetIdSnapshot = uuid("target_id_snapshot"),
        identityMode = getString("identity_mode"),
        canonicalSchemaVersion = getString("canonical_schema_version"),
        digestKeyVersion = getObject("digest_key_version")?.let { getInt("digest_key_version") },
        requestHmac = getBytes("request_hmac"),
        skippedReasonCounts = objectMapper.jsonCountMap(getString("skipped_reason_counts_json")),
        originStatus = getString("origin_outcome"),
        convergenceId = getString("convergence_id")?.let(UUID::fromString),
        effectStatus = getString("effect_status"),
    )

private fun ResultSet.toLockedReplayTarget(): LockedReplayTarget =
    LockedReplayTarget(
        deliveryId = uuid("delivery_id"),
        clubId = uuid("club_id"),
        expectedStatus = getString("expected_status"),
        expectedAttemptCount = getInt("expected_attempt_count"),
        expectedFailureCode = getString("expected_failure_code"),
        expectedUpdatedAt = utcOffsetDateTime("expected_updated_at"),
        actualDeliveryId = getString("actual_delivery_id")?.let(UUID::fromString),
        actualClubId = getString("actual_club_id")?.let(UUID::fromString),
        actualChannel = getString("actual_channel"),
        actualStatus = getString("actual_status"),
        actualAttemptCount = getObject("actual_attempt_count")?.let { getInt("actual_attempt_count") },
        actualFailureCode = getString("actual_failure_code"),
        actualUpdatedAt = utcOffsetDateTimeOrNull("actual_updated_at"),
        locked = getObject("actual_locked_at") != null,
    )

private fun ObjectMapper.jsonStringList(json: String?): List<String>? =
    json?.let {
        readValue(it, List::class.java).map(Any?::toString)
    }

private fun ObjectMapper.jsonCountMap(json: String?): Map<String, Int> =
    json
        ?.let { readValue(it, Map::class.java) }
        ?.entries
        ?.associate { (key, value) -> key.toString() to (value as Number).toInt() }
        ?: emptyMap()

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
