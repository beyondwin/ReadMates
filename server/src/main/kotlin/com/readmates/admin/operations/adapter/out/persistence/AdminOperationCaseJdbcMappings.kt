package com.readmates.admin.operations.adapter.out.persistence

import com.readmates.admin.operations.application.model.AdminOperationAction
import com.readmates.admin.operations.application.model.AdminOperationCase
import com.readmates.admin.operations.application.model.AdminOperationCaseEvent
import com.readmates.admin.operations.application.model.AdminOperationCaseState
import com.readmates.admin.operations.application.model.AdminOperationSeverity
import com.readmates.admin.operations.application.model.AdminOperationSourceFreshness
import com.readmates.admin.operations.application.model.AdminOperationSourceStatus
import com.readmates.admin.operations.application.model.AdminOperationSourceType
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.utcOffsetDateTimeOrNull
import com.readmates.shared.db.uuid
import com.readmates.shared.db.uuidOrNull
import org.springframework.jdbc.core.RowMapper
import java.sql.ResultSet

internal val ADMIN_OPERATION_CASE_ROW_MAPPER =
    RowMapper<AdminOperationCase> { rs, _ -> rs.toAdminOperationCase() }

internal val ADMIN_OPERATION_EVENT_ROW_MAPPER =
    RowMapper<AdminOperationCaseEvent> { rs, _ -> rs.toAdminOperationCaseEvent() }

private fun ResultSet.toAdminOperationCase(): AdminOperationCase =
    AdminOperationCase(
        id = uuid("id"),
        sourceType = AdminOperationSourceType.valueOf(getString("source_type")),
        sourceKey = getString("source_key"),
        clubId = uuidOrNull("club_id"),
        state = AdminOperationCaseState.valueOf(getString("state")),
        severity = AdminOperationSeverity.valueOf(getString("severity")),
        summaryCode = getString("safe_summary_code"),
        firstObservedAt = utcOffsetDateTime("first_observed_at"),
        lastObservedAt = utcOffsetDateTime("last_observed_at"),
        snoozedUntil = utcOffsetDateTimeOrNull("snoozed_until"),
        assigneeAdminId = uuidOrNull("assignee_admin_id"),
        resolvedAt = utcOffsetDateTimeOrNull("resolved_at"),
        reopenCount = getInt("reopen_count"),
        version = getLong("version"),
        impactCount = getInt("impact_count"),
        detailHref = getString("detail_href"),
    )

private fun ResultSet.toAdminOperationCaseEvent(): AdminOperationCaseEvent =
    AdminOperationCaseEvent(
        id = uuid("id"),
        caseId = uuid("case_id"),
        fromState = getString("from_state")?.let(AdminOperationCaseState::valueOf),
        toState = AdminOperationCaseState.valueOf(getString("to_state")),
        action = getString("action")?.let(AdminOperationAction::valueOf),
        actorAdminId = uuidOrNull("actor_admin_id"),
        reasonCode = getString("reason_code"),
        occurredAt = utcOffsetDateTime("occurred_at"),
        caseVersion = getLong("case_version"),
    )

internal fun ResultSet.toAdminOperationSourceFreshness(): AdminOperationSourceFreshness =
    AdminOperationSourceFreshness(
        sourceType = AdminOperationSourceType.valueOf(getString("source_type")),
        status = AdminOperationSourceStatus.valueOf(getString("status")),
        generatedAt = utcOffsetDateTime("attempted_at"),
        lastSuccessfulAt = utcOffsetDateTimeOrNull("last_successful_at"),
        authoritative = getBoolean("authoritative"),
    )

internal fun AdminOperationAction.targetState(): AdminOperationCaseState =
    when (this) {
        AdminOperationAction.ACKNOWLEDGE -> AdminOperationCaseState.ACKNOWLEDGED
        AdminOperationAction.SNOOZE -> AdminOperationCaseState.SNOOZED
        AdminOperationAction.RESOLVE -> AdminOperationCaseState.RESOLVED
    }

internal fun AdminOperationSeverity.rank(): Int =
    when (this) {
        AdminOperationSeverity.CRITICAL -> 0
        AdminOperationSeverity.WARNING -> 1
        AdminOperationSeverity.READY -> 2
        AdminOperationSeverity.INFO -> INFO_SEVERITY_RANK
    }

private const val INFO_SEVERITY_RANK = 3
