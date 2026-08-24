@file:Suppress("LongMethod", "TooManyFunctions")

package com.readmates.admin.audit.adapter.out.persistence

import com.readmates.admin.audit.application.AdminAuditError
import com.readmates.admin.audit.application.AdminAuditException
import com.readmates.admin.audit.application.model.AdminAuditActionCategory
import com.readmates.admin.audit.application.model.AdminAuditNativeIdType
import com.readmates.admin.audit.application.model.AdminAuditSourceQuery
import com.readmates.admin.audit.application.model.AdminAuditSourceRow
import com.readmates.admin.audit.application.model.AdminAuditSourceSlice
import com.readmates.admin.audit.application.model.AdminAuditSourceType
import com.readmates.admin.audit.application.model.AdminAuditTuple
import com.readmates.admin.audit.application.port.out.AdminAuditLedgerReadPort
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate
import org.springframework.stereotype.Repository
import java.math.BigInteger
import java.sql.ResultSet
import java.sql.Timestamp
import java.text.Normalizer
import java.time.ZoneOffset
import java.util.Locale
import java.util.UUID

@Repository
class JdbcAdminAuditLedgerAdapter(
    jdbcTemplate: JdbcTemplate,
) : AdminAuditLedgerReadPort {
    private val jdbc = NamedParameterJdbcTemplate(jdbcTemplate)

    override fun listSource(
        source: AdminAuditSourceType,
        query: AdminAuditSourceQuery,
    ): List<AdminAuditSourceRow> {
        if (!sourceSupportsFilter(source, query)) return emptyList()
        return when (source) {
            AdminAuditSourceType.PLATFORM -> platformEvents(query)
            AdminAuditSourceType.CLUB -> clubEvents(query)
            AdminAuditSourceType.OPERATION_CASE_EVENT -> operationCaseEvents(query)
            AdminAuditSourceType.CLUB_COMMAND_RECEIPT -> clubReceipts(query)
            AdminAuditSourceType.CLUB_CONVERGENCE_ATTEMPT -> clubConvergenceEvents(query)
            AdminAuditSourceType.NOTIFICATION_CONFIRMATION -> notificationConfirmations(query)
            AdminAuditSourceType.NOTIFICATION_CONVERGENCE_ATTEMPT -> serviceConvergenceEvents(query, true)
            AdminAuditSourceType.AI_COMMAND_RECEIPT -> aiReceipts(query)
            AdminAuditSourceType.AI_CONVERGENCE_ATTEMPT -> serviceConvergenceEvents(query, false)
            AdminAuditSourceType.SUPPORT_COMMAND_RECEIPT -> supportReceipts(query)
            AdminAuditSourceType.PUBLIC_TAKEDOWN_RECEIPT -> publicTakedownReceipts(query)
            AdminAuditSourceType.PUBLIC_CONVERGENCE_ATTEMPT -> publicConvergenceEvents(query)
            AdminAuditSourceType.AI_GENERATION -> aiGenerationEvents(query)
            AdminAuditSourceType.NOTIFICATION_REPLAY_PREVIEW -> notificationReplayPreviews(query)
        }
    }

    private fun platformEvents(query: AdminAuditSourceQuery) =
        standardQuery(
            AdminAuditSourceType.PLATFORM,
            query,
            """
            select event.id source_id, event.created_at occurred_at, event.actor_user_id,
                   event.actor_platform_role actor_role,
                   json_unquote(json_extract(event.metadata_json, '$.clubId')) club_id,
                   event.target_user_id, event.event_type action_type, 'SUCCESS' outcome_hint,
                   cast(event.metadata_json as char) metadata_json
            from platform_audit_events event
            """.trimIndent(),
            "event.created_at",
            "event.id",
            "event.actor_platform_role",
            "json_unquote(json_extract(event.metadata_json, '$.clubId'))",
            "'SUCCESS'",
            listOf("event.actor_user_id", "event.target_user_id"),
            """
            and not exists (select 1 from platform_admin_club_command_receipts r where r.platform_audit_event_id_snapshot = event.id)
            and not exists (select 1 from admin_notification_replay_confirmations r where r.platform_audit_event_id = event.id)
            and not exists (select 1 from ai_generation_admin_command_receipts r where r.platform_audit_event_id_snapshot = event.id)
            and not exists (select 1 from platform_admin_support_command_receipts r where r.platform_audit_event_id_snapshot = event.id)
            ${platformSemanticPredicate(query)}
            """.trimIndent(),
        )

    private fun clubEvents(query: AdminAuditSourceQuery) =
        standardQuery(
            AdminAuditSourceType.CLUB,
            query,
            """
            select event.id source_id, event.created_at occurred_at, event.actor_user_id,
                   event.actor_platform_role actor_role, event.club_id, null target_user_id,
                   event.event_type action_type, 'SUCCESS' outcome_hint,
                   cast(event.metadata_json as char) metadata_json
            from club_audit_events event
            """.trimIndent(),
            "event.created_at",
            "event.id",
            "event.actor_platform_role",
            "event.club_id",
            "'SUCCESS'",
            listOf("event.actor_user_id"),
        )

    private fun operationCaseEvents(query: AdminAuditSourceQuery) =
        standardQuery(
            AdminAuditSourceType.OPERATION_CASE_EVENT,
            query,
            """
            select event.id source_id, event.occurred_at, event.actor_admin_id actor_user_id,
                   coalesce(admin.role, case when event.actor_admin_id is null then 'SYSTEM' else 'UNKNOWN' end) actor_role,
                   operation_case.club_id, null target_user_id,
                   concat('OPERATION_CASE_', coalesce(event.action, event.reason_code)) action_type,
                   case when event.to_state = 'RESOLVED' then 'SUCCESS' else 'PREPARED' end outcome_hint,
                   cast(json_object('caseId', event.case_id, 'toState', event.to_state,
                        'reasonCode', event.reason_code, 'caseVersion', event.case_version) as char) metadata_json
            from admin_operation_case_events event
            join admin_operation_cases operation_case on operation_case.id = event.case_id
            left join platform_admins admin on admin.user_id = event.actor_admin_id
            """.trimIndent(),
            "event.occurred_at",
            "event.id",
            "coalesce(admin.role, case when event.actor_admin_id is null then 'SYSTEM' else 'UNKNOWN' end)",
            "operation_case.club_id",
            "case when event.to_state = 'RESOLVED' then 'SUCCESS' else 'PREPARED' end",
            listOf("event.actor_admin_id"),
        )

    private fun clubReceipts(query: AdminAuditSourceQuery) =
        standardQuery(
            AdminAuditSourceType.CLUB_COMMAND_RECEIPT,
            query,
            """
            select receipt.id source_id, receipt.origin_at occurred_at,
                   receipt.actor_user_id_snapshot actor_user_id, receipt.actor_platform_role_snapshot actor_role,
                   receipt.club_id_snapshot club_id, null target_user_id,
                   concat('CLUB_COMMAND_', upper(replace(receipt.command_type, '.', '_'))) action_type,
                   receipt.outcome outcome_hint,
                   cast(json_object('receiptId', receipt.id, 'commandType', receipt.command_type,
                        'afterAdminRevision', receipt.after_admin_revision, 'outcome', receipt.outcome) as char) metadata_json
            from platform_admin_club_command_receipts receipt
            join platform_audit_events audit on audit.id = receipt.platform_audit_event_id_snapshot
            """.trimIndent(),
            "receipt.origin_at",
            "receipt.id",
            "receipt.actor_platform_role_snapshot",
            "receipt.club_id_snapshot",
            outcomeFromReceipt("receipt.outcome"),
            listOf("receipt.actor_user_id_snapshot"),
        )

    private fun clubConvergenceEvents(query: AdminAuditSourceQuery) =
        standardQuery(
            AdminAuditSourceType.CLUB_CONVERGENCE_ATTEMPT,
            query,
            """
            select ${compositeId("event")} source_id, event.observed_at occurred_at,
                   receipt.actor_user_id_snapshot actor_user_id, receipt.actor_platform_role_snapshot actor_role,
                   receipt.club_id_snapshot club_id, null target_user_id,
                   concat('CLUB_CONVERGENCE_', event.effect_type) action_type, event.state outcome_hint,
                   cast(json_object('receiptId', event.receipt_id_snapshot, 'effectType', event.effect_type,
                        'attemptNo', event.attempt_no, 'state', event.state,
                        'safeErrorCode', event.safe_error_code) as char) metadata_json
            from platform_admin_club_command_convergence_events event
            join platform_admin_club_command_receipts receipt on receipt.id = event.receipt_id_snapshot
            """.trimIndent(),
            "event.observed_at",
            compositeId("event"),
            "receipt.actor_platform_role_snapshot",
            "receipt.club_id_snapshot",
            outcomeFromState("event.state"),
            listOf("receipt.actor_user_id_snapshot"),
        )

    private fun notificationConfirmations(query: AdminAuditSourceQuery) =
        standardQuery(
            AdminAuditSourceType.NOTIFICATION_CONFIRMATION,
            query,
            """
            select receipt.id source_id, receipt.confirmed_at occurred_at, receipt.actor_user_id,
                   receipt.actor_platform_role actor_role, receipt.club_id, null target_user_id,
                   'ADMIN_NOTIFICATION_REPLAY_CONFIRMED' action_type, 'SUCCESS' outcome_hint,
                   cast(json_object('receiptId', receipt.id, 'replayedCount', receipt.replayed_count,
                        'skippedCount', receipt.skipped_count, 'originOutcome', receipt.origin_outcome) as char) metadata_json
            from admin_notification_replay_confirmations receipt
            join platform_audit_events audit on audit.id = receipt.platform_audit_event_id
            """.trimIndent(),
            "receipt.confirmed_at",
            "receipt.id",
            "receipt.actor_platform_role",
            "receipt.club_id",
            "'SUCCESS'",
            listOf("receipt.actor_user_id"),
            additionalSensitivePredicate = notificationRecipientPredicate("receipt.id"),
        )

    private fun serviceConvergenceEvents(
        query: AdminAuditSourceQuery,
        notification: Boolean,
    ): List<AdminAuditSourceRow> {
        val source =
            if (notification) {
                AdminAuditSourceType.NOTIFICATION_CONVERGENCE_ATTEMPT
            } else {
                AdminAuditSourceType.AI_CONVERGENCE_ATTEMPT
            }
        val parentColumn = if (notification) "event.notification_receipt_id_snapshot" else "event.ai_receipt_id_snapshot"
        val join =
            if (notification) {
                "join admin_notification_replay_confirmations receipt on receipt.id = event.notification_receipt_id_snapshot"
            } else {
                "join ai_generation_admin_command_receipts receipt on receipt.id = event.ai_receipt_id_snapshot"
            }
        val actor = if (notification) "receipt.actor_user_id" else "receipt.actor_user_id_snapshot"
        val role = if (notification) "receipt.actor_platform_role" else "receipt.actor_platform_role_snapshot"
        val club = if (notification) "receipt.club_id" else "receipt.club_id_snapshot"
        return standardQuery(
            source,
            query,
            """
            select ${compositeId("event")} source_id, event.observed_at occurred_at, $actor actor_user_id,
                   $role actor_role, $club club_id, null target_user_id,
                   concat('SERVICE_CONVERGENCE_', event.effect_type) action_type, event.state outcome_hint,
                   cast(json_object('receiptId', $parentColumn, 'effectType', event.effect_type,
                        'attemptNo', event.attempt_no, 'state', event.state,
                        'safeErrorCode', event.safe_error_code) as char) metadata_json
            from admin_service_command_convergence_events event
            $join
            """.trimIndent(),
            "event.observed_at",
            compositeId("event"),
            role,
            club,
            outcomeFromState("event.state"),
            listOf(actor),
            "and $parentColumn is not null",
            if (notification) notificationRecipientPredicate("receipt.id") else null,
        )
    }

    private fun aiReceipts(query: AdminAuditSourceQuery) =
        standardQuery(
            AdminAuditSourceType.AI_COMMAND_RECEIPT,
            query,
            """
            select receipt.id source_id, receipt.origin_at occurred_at,
                   receipt.actor_user_id_snapshot actor_user_id, receipt.actor_platform_role_snapshot actor_role,
                   receipt.club_id_snapshot club_id, null target_user_id,
                   concat('AI_COMMAND_', receipt.action) action_type, receipt.origin_outcome outcome_hint,
                   cast(json_object('receiptId', receipt.id, 'jobId', receipt.job_id_snapshot,
                        'action', receipt.action, 'afterStatus', receipt.after_job_status_snapshot,
                        'originOutcome', receipt.origin_outcome, 'safeReasonCode', receipt.safe_reason_code) as char) metadata_json
            from ai_generation_admin_command_receipts receipt
            join platform_audit_events audit on audit.id = receipt.platform_audit_event_id_snapshot
            """.trimIndent(),
            "receipt.origin_at",
            "receipt.id",
            "receipt.actor_platform_role_snapshot",
            "receipt.club_id_snapshot",
            outcomeFromReceipt("receipt.origin_outcome"),
            listOf("receipt.actor_user_id_snapshot", "receipt.job_id_snapshot"),
        )

    private fun supportReceipts(query: AdminAuditSourceQuery) =
        standardQuery(
            AdminAuditSourceType.SUPPORT_COMMAND_RECEIPT,
            query,
            """
            select receipt.id source_id, receipt.created_at occurred_at,
                   receipt.actor_user_id_snapshot actor_user_id, receipt.actor_platform_role_snapshot actor_role,
                   receipt.club_id_snapshot club_id, grant_source.grantee_user_id target_user_id,
                   concat('SUPPORT_ACCESS_GRANT_', receipt.command_type) action_type, receipt.outcome outcome_hint,
                   cast(json_object('receiptId', receipt.id, 'grantId', receipt.grant_id_snapshot,
                        'scope', receipt.scope_snapshot, 'reasonCategory', receipt.reason_category,
                        'notePresent', receipt.note_present, 'outcome', receipt.outcome) as char) metadata_json
            from platform_admin_support_command_receipts receipt
            join platform_audit_events audit on audit.id = receipt.platform_audit_event_id_snapshot
            left join support_access_grants grant_source on grant_source.id = receipt.grant_id_snapshot
            """.trimIndent(),
            "receipt.created_at",
            "receipt.id",
            "receipt.actor_platform_role_snapshot",
            "receipt.club_id_snapshot",
            outcomeFromReceipt("receipt.outcome"),
            listOf("receipt.actor_user_id_snapshot", "receipt.grant_id_snapshot", "grant_source.grantee_user_id"),
        )

    private fun publicTakedownReceipts(query: AdminAuditSourceQuery) =
        standardQuery(
            AdminAuditSourceType.PUBLIC_TAKEDOWN_RECEIPT,
            query,
            """
            select receipt.id source_id, receipt.created_at occurred_at,
                   receipt.actor_user_id_snapshot actor_user_id, receipt.actor_platform_role_snapshot actor_role,
                   receipt.club_id_snapshot club_id, null target_user_id,
                   'EMERGENCY_PUBLIC_TAKEDOWN_CONFIRMED' action_type, 'DENIED' outcome_hint,
                   cast(json_object('receiptId', receipt.id, 'convergenceId', receipt.convergence_id,
                        'publicationId', receipt.publication_id_snapshot, 'committedGeneration', receipt.committed_generation,
                        'originResult', receipt.origin_result, 'reasonCategory', receipt.reason_category,
                        'reasonRedacted', receipt.reason_redacted,
                        'remoteCopyLimitationCode', receipt.remote_copy_limitation_code) as char) metadata_json
            from admin_public_takedown_receipts receipt
            """.trimIndent(),
            "receipt.created_at",
            "receipt.id",
            "receipt.actor_platform_role_snapshot",
            "receipt.club_id_snapshot",
            "'DENIED'",
            listOf("receipt.actor_user_id_snapshot"),
        )

    private fun publicConvergenceEvents(query: AdminAuditSourceQuery) =
        standardQuery(
            AdminAuditSourceType.PUBLIC_CONVERGENCE_ATTEMPT,
            query,
            """
            select ${compositeId("event")} source_id, event.observed_at occurred_at,
                   receipt.actor_user_id_snapshot actor_user_id, receipt.actor_platform_role_snapshot actor_role,
                   receipt.club_id_snapshot club_id, null target_user_id,
                   'PUBLIC_TAKEDOWN_CONVERGENCE' action_type, event.status outcome_hint,
                   cast(json_object('receiptId', receipt.id, 'convergenceId', event.convergence_id,
                        'attemptNo', event.attempt_no, 'state', event.status,
                        'safeErrorCode', event.result_category) as char) metadata_json
            from public_convergence_events event
            join admin_public_takedown_receipts receipt on receipt.convergence_id = event.convergence_id
            """.trimIndent(),
            "event.observed_at",
            compositeId("event"),
            "receipt.actor_platform_role_snapshot",
            "receipt.club_id_snapshot",
            outcomeFromState("event.status"),
            listOf("receipt.actor_user_id_snapshot"),
        )

    private fun aiGenerationEvents(query: AdminAuditSourceQuery) =
        standardQuery(
            AdminAuditSourceType.AI_GENERATION,
            query,
            """
            select cast(event.id as char) source_id, event.created_at occurred_at,
                   event.host_user_id actor_user_id, 'HOST' actor_role, event.club_id, null target_user_id,
                   'AI_GENERATION_AUDIT' action_type, event.status outcome_hint,
                   cast(json_object('jobId', event.job_id, 'provider', event.provider, 'model', event.model,
                        'status', event.status, 'errorCode', event.error_code,
                        'costEstimateUsd', event.cost_estimate_usd, 'latencyMs', event.latency_ms) as char) metadata_json
            from ai_generation_audit_log event
            """.trimIndent(),
            "event.created_at",
            "event.id",
            "'HOST'",
            "event.club_id",
            outcomeFromState("event.status"),
            listOf("event.host_user_id", "event.job_id"),
        )

    private fun notificationReplayPreviews(query: AdminAuditSourceQuery) =
        standardQuery(
            AdminAuditSourceType.NOTIFICATION_REPLAY_PREVIEW,
            query,
            """
            select preview.id source_id, preview.created_at occurred_at, preview.actor_user_id,
                   preview.actor_platform_role actor_role, preview.club_id, null target_user_id,
                   case when preview.contract_version <> 2 then 'ADMIN_NOTIFICATION_REPLAY_PREVIEW_LEGACY'
                        when preview.consumed_at is not null then 'ADMIN_NOTIFICATION_REPLAY_PREVIEW_CONSUMED'
                        else 'ADMIN_NOTIFICATION_REPLAY_PREVIEW_PREPARED' end action_type,
                   case when preview.contract_version <> 2 then 'UNKNOWN'
                        when preview.consumed_at is not null then 'SUCCESS' else 'PREPARED' end outcome_hint,
                   cast(json_object('matchedCount', preview.matched_count, 'selectionHash', preview.selection_hash,
                        'expiresAt', preview.expires_at, 'consumedAt', preview.consumed_at) as char) metadata_json
            from admin_notification_replay_previews preview
            """.trimIndent(),
            "preview.created_at",
            "preview.id",
            "preview.actor_platform_role",
            "preview.club_id",
            "case when preview.contract_version <> 2 then 'UNKNOWN' " +
                "when preview.consumed_at is not null then 'SUCCESS' else 'PREPARED' end",
            listOf("preview.actor_user_id"),
            additionalSensitivePredicate = notificationPreviewRecipientPredicate("preview.id"),
        )

    private fun standardQuery(
        source: AdminAuditSourceType,
        query: AdminAuditSourceQuery,
        selectFrom: String,
        timeExpr: String,
        idExpr: String,
        actorRoleExpr: String,
        clubExpr: String,
        outcomeExpr: String,
        targetIds: List<String>,
        extraWhere: String = "",
        additionalSensitivePredicate: String? = null,
    ): List<AdminAuditSourceRow> {
        val params =
            MapSqlParameterSource()
                .addValue("from", Timestamp.from(query.filter.from.toInstant()))
                .addValue("snapshotTo", Timestamp.from(query.snapshotTo.toInstant()))
                .addValue("limit", query.limit)
        val where = StringBuilder("where $timeExpr >= :from and $timeExpr < :snapshotTo\n")
        query.filter.actorRole?.let {
            where.append("and binary $actorRoleExpr = binary :actorRole\n")
            params.addValue("actorRole", it.name)
        }
        query.filter.clubId?.let {
            where.append("and binary $clubExpr = binary :clubId\n")
            params.addValue("clubId", it.toString())
        }
        query.filter.outcome?.let {
            where.append("and binary ($outcomeExpr) = binary :outcome\n")
            params.addValue("outcome", it.name)
        }
        query.sensitiveTarget?.normalizeSearch()?.takeIf(String::isNotBlank)?.let { target ->
            params.addValue("sensitiveTarget", target)
            where.append("and (")
            where.append(targetIds.joinToString(" or ") { "lower(cast($it as char)) = :sensitiveTarget" })
            where.append(" or exists (select 1 from users sensitive_user where (")
            where.append(targetIds.joinToString(" or ") { "sensitive_user.id = $it" })
            where.append(") and (lower(sensitive_user.email) = :sensitiveTarget ")
            where.append("or lower(sensitive_user.name) like concat('%', :sensitiveTarget, '%')))")
            additionalSensitivePredicate?.let { where.append(" or ($it)") }
            where.append(")\n")
        }
        where.append(extraWhere).append('\n')
        appendContinuation(where, params, source, query, timeExpr, idExpr)
        return jdbc.query("$selectFrom\n$where order by $timeExpr desc, $idExpr desc limit :limit", params) { rs, _ ->
            rs.toSourceRow(source)
        }
    }

    private fun appendContinuation(
        where: StringBuilder,
        params: MapSqlParameterSource,
        source: AdminAuditSourceType,
        query: AdminAuditSourceQuery,
        timeExpr: String,
        idExpr: String,
    ) {
        val after = query.after ?: return
        params.addValue("afterOccurredAt", Timestamp.from(after.occurredAt.toInstant()))
        when {
            source.rank < after.sourceRank -> where.append("and $timeExpr < :afterOccurredAt\n")
            source.rank > after.sourceRank -> where.append("and $timeExpr <= :afterOccurredAt\n")
            else -> {
                where.append("and ($timeExpr < :afterOccurredAt or ($timeExpr = :afterOccurredAt and $idExpr < :afterId))\n")
                params.addValue("afterId", after.nativeId(source))
            }
        }
    }

    private fun ResultSet.toSourceRow(source: AdminAuditSourceType) =
        AdminAuditSourceRow(
            source,
            getString("source_id"),
            getTimestamp("occurred_at").toInstant().atOffset(ZoneOffset.UTC),
            uuidOrNull("actor_user_id"),
            getString("actor_role"),
            uuidOrNull("club_id"),
            uuidOrNull("target_user_id"),
            getString("action_type"),
            getString("outcome_hint"),
            getString("metadata_json"),
        )
}

private fun sourceSupportsFilter(
    source: AdminAuditSourceType,
    query: AdminAuditSourceQuery,
): Boolean {
    if (source == AdminAuditSourceType.PLATFORM) return true
    return (query.filter.sourceSlice == null || query.filter.sourceSlice == source.fixedSlice()) &&
        (query.filter.actionCategory == null || query.filter.actionCategory == source.fixedCategory())
}

private fun AdminAuditSourceType.fixedSlice() =
    when (this) {
        AdminAuditSourceType.CLUB, AdminAuditSourceType.CLUB_COMMAND_RECEIPT,
        AdminAuditSourceType.CLUB_CONVERGENCE_ATTEMPT,
        -> AdminAuditSourceSlice.S3
        AdminAuditSourceType.SUPPORT_COMMAND_RECEIPT -> AdminAuditSourceSlice.S4
        AdminAuditSourceType.NOTIFICATION_CONFIRMATION, AdminAuditSourceType.NOTIFICATION_CONVERGENCE_ATTEMPT,
        AdminAuditSourceType.NOTIFICATION_REPLAY_PREVIEW,
        -> AdminAuditSourceSlice.S5
        AdminAuditSourceType.AI_COMMAND_RECEIPT, AdminAuditSourceType.AI_CONVERGENCE_ATTEMPT,
        AdminAuditSourceType.AI_GENERATION,
        -> AdminAuditSourceSlice.S6
        else -> AdminAuditSourceSlice.PLATFORM
    }

private fun AdminAuditSourceType.fixedCategory() =
    when (fixedSlice()) {
        AdminAuditSourceSlice.S3, AdminAuditSourceSlice.CLUB -> AdminAuditActionCategory.CLUB_LIFECYCLE
        AdminAuditSourceSlice.S4 -> AdminAuditActionCategory.SUPPORT
        AdminAuditSourceSlice.S5 -> AdminAuditActionCategory.NOTIFICATION
        AdminAuditSourceSlice.S6 -> AdminAuditActionCategory.AI_OPS
        else -> AdminAuditActionCategory.PLATFORM_ADMIN
    }

private fun platformSemanticPredicate(query: AdminAuditSourceQuery): String {
    val clauses = mutableListOf<String>()
    query.filter.sourceSlice?.let {
        clauses +=
            when (it) {
                AdminAuditSourceSlice.S4 -> "event.event_type like 'SUPPORT_ACCESS_%'"
                AdminAuditSourceSlice.S5 -> "event.event_type like 'ADMIN_NOTIFICATION_%'"
                AdminAuditSourceSlice.PLATFORM ->
                    "event.event_type not like 'SUPPORT_ACCESS_%' " +
                        "and event.event_type not like 'ADMIN_NOTIFICATION_%'"
                else -> "false"
            }
    }
    query.filter.actionCategory?.let {
        clauses +=
            when (it) {
                AdminAuditActionCategory.SUPPORT -> "event.event_type like 'SUPPORT_ACCESS_%'"
                AdminAuditActionCategory.NOTIFICATION -> "event.event_type like 'ADMIN_NOTIFICATION_%'"
                AdminAuditActionCategory.PLATFORM_ADMIN, AdminAuditActionCategory.AUTH_SECURITY ->
                    "event.event_type not like 'SUPPORT_ACCESS_%' and event.event_type not like 'ADMIN_NOTIFICATION_%'"
                else -> "false"
            }
    }
    return clauses.joinToString("\nand ", if (clauses.isEmpty()) "" else "and ")
}

private fun outcomeFromReceipt(column: String) =
    "case when $column in ('SUCCEEDED','ACCEPTED') then 'SUCCESS' when $column in ('FAILED','PARTIAL') then 'FAILED' else 'UNKNOWN' end"

private fun outcomeFromState(column: String) =
    "case when $column in ('SUCCEEDED','COMMITTED') then 'SUCCESS' when $column in ('FAILED','DEAD','CANCELLED') then 'FAILED' " +
        "when $column in ('PENDING','RUNNING','OPEN','ACKNOWLEDGED','SNOOZED') then 'PREPARED' else 'UNKNOWN' end"

private fun compositeId(alias: String) =
    "concat($alias.convergence_id, ':', lpad($alias.attempt_no, 10, '0'), ':', lpad($alias.event_seq, 3, '0'))"

private fun notificationRecipientPredicate(confirmationId: String): String =
    """
    exists (
      select 1
      from admin_notification_replay_confirmation_targets target_snapshot
      join notification_deliveries delivery on delivery.id = target_snapshot.delivery_id_snapshot
      join memberships recipient_membership
        on recipient_membership.id = delivery.recipient_membership_id
       and recipient_membership.club_id = delivery.club_id
      join users recipient_user on recipient_user.id = recipient_membership.user_id
      where target_snapshot.confirmation_id = $confirmationId
        and (
          lower(recipient_user.id) = :sensitiveTarget
          or lower(recipient_user.email) = :sensitiveTarget
          or lower(recipient_user.name) like concat('%', :sensitiveTarget, '%')
        )
    )
    """.trimIndent()

private fun notificationPreviewRecipientPredicate(previewId: String): String =
    """
    exists (
      select 1
      from admin_notification_replay_preview_targets target_snapshot
      join notification_deliveries delivery on delivery.id = target_snapshot.delivery_id
      join memberships recipient_membership
        on recipient_membership.id = delivery.recipient_membership_id
       and recipient_membership.club_id = delivery.club_id
      join users recipient_user on recipient_user.id = recipient_membership.user_id
      where target_snapshot.preview_id = $previewId
        and (
          lower(recipient_user.id) = :sensitiveTarget
          or lower(recipient_user.email) = :sensitiveTarget
          or lower(recipient_user.name) like concat('%', :sensitiveTarget, '%')
        )
    )
    """.trimIndent()

private fun AdminAuditTuple.nativeId(source: AdminAuditSourceType): Any =
    when (source.nativeIdType) {
        AdminAuditNativeIdType.NUMERIC ->
            immutableSourceId
                .toBigIntegerOrNull()
                ?.takeIf { it >= BigInteger.ZERO && it <= BigInteger.valueOf(Long.MAX_VALUE) }
                ?.toLong()
                ?: throw AdminAuditException(AdminAuditError.INVALID_CURSOR, "Invalid numeric audit cursor id")
        AdminAuditNativeIdType.UUID ->
            runCatching { UUID.fromString(immutableSourceId).toString() }
                .getOrElse { throw AdminAuditException(AdminAuditError.INVALID_CURSOR, "Invalid UUID audit cursor id") }
        AdminAuditNativeIdType.COMPOSITE ->
            immutableSourceId.takeIf(COMPOSITE_ID::matches)
                ?: throw AdminAuditException(AdminAuditError.INVALID_CURSOR, "Invalid composite audit cursor id")
    }

private fun ResultSet.uuidOrNull(column: String): UUID? = getString(column)?.let(UUID::fromString)

private fun String.normalizeSearch() = Normalizer.normalize(trim(), Normalizer.Form.NFC).lowercase(Locale.ROOT)

private val COMPOSITE_ID = Regex("^[0-9a-fA-F-]{36}:[0-9]{10}:[0-9]{3}$")
