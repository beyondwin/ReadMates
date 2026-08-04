package com.readmates.admin.operations.adapter.out.persistence

import com.readmates.admin.operations.application.model.AdminOperationAction
import com.readmates.admin.operations.application.model.AdminOperationCase
import com.readmates.admin.operations.application.model.AdminOperationCaseState
import com.readmates.admin.operations.application.model.AdminOperationTransitionCommand
import com.readmates.admin.operations.application.port.out.AdminOperationCaseUpdateResult
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component

@Component
internal class AdminOperationCaseTransitionJdbcWriter(
    private val jdbcTemplate: JdbcTemplate,
    private val reader: AdminOperationCaseJdbcReader,
    private val events: AdminOperationCaseEventJdbcAppender,
) {
    fun transition(command: AdminOperationTransitionCommand): AdminOperationCaseUpdateResult =
        reader.get(command.caseId)?.let { current ->
            if (current.version != command.expectedVersion) {
                AdminOperationCaseUpdateResult.VersionConflict
            } else {
                transitionCurrent(current, command)
            }
        } ?: AdminOperationCaseUpdateResult.NotFound

    private fun transitionCurrent(
        current: AdminOperationCase,
        command: AdminOperationTransitionCommand,
    ): AdminOperationCaseUpdateResult {
        val targetState = command.action.targetState()
        val updated = updateTransition(current, targetState, command)
        return if (updated != 1) {
            AdminOperationCaseUpdateResult.VersionConflict
        } else {
            events.append(
                caseId = command.caseId,
                fromState = current.state,
                toState = targetState,
                action = command.action,
                actorAdminId = command.actorAdminId,
                reasonCode = command.reasonCode,
                occurredAt = command.now,
                caseVersion = current.version + 1,
            )
            AdminOperationCaseUpdateResult.Updated(requireNotNull(reader.get(command.caseId)))
        }
    }

    private fun updateTransition(
        current: AdminOperationCase,
        targetState: AdminOperationCaseState,
        command: AdminOperationTransitionCommand,
    ): Int {
        val acknowledgedAt = if (command.action == AdminOperationAction.ACKNOWLEDGE) command.now else null
        val snoozedUntil = if (command.action == AdminOperationAction.SNOOZE) command.snoozedUntil else null
        val resolvedAt = if (command.action == AdminOperationAction.RESOLVE) command.now else null
        val resolutionCode = if (command.action == AdminOperationAction.RESOLVE) command.reasonCode else null
        return jdbcTemplate.update(
            """
            update admin_operation_cases
            set state = ?,
                acknowledged_at = coalesce(?, acknowledged_at),
                snoozed_until = ?,
                assignee_admin_id = case when ? = 'ACKNOWLEDGE'
                  then coalesce(assignee_admin_id, ?) else assignee_admin_id end,
                resolved_at = ?,
                resolution_code = ?,
                version = version + 1
            where id = ? and version = ?
            """.trimIndent(),
            targetState.name,
            acknowledgedAt?.toUtcLocalDateTime(),
            snoozedUntil?.toUtcLocalDateTime(),
            command.action.name,
            command.actorAdminId.dbString(),
            resolvedAt?.toUtcLocalDateTime(),
            resolutionCode,
            current.id.dbString(),
            command.expectedVersion,
        )
    }
}
