package com.readmates.admin.operations.adapter.out.persistence

import com.readmates.admin.operations.application.model.AdminOperationAction
import com.readmates.admin.operations.application.model.AdminOperationCaseState
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import java.time.OffsetDateTime
import java.util.UUID

@Component
internal class AdminOperationCaseEventJdbcAppender(
    private val jdbcTemplate: JdbcTemplate,
) {
    fun append(
        caseId: UUID,
        fromState: AdminOperationCaseState?,
        toState: AdminOperationCaseState,
        action: AdminOperationAction?,
        actorAdminId: UUID?,
        reasonCode: String,
        occurredAt: OffsetDateTime,
        caseVersion: Long,
    ) {
        jdbcTemplate.update(
            """
            insert into admin_operation_case_events (
              id, case_id, from_state, to_state, action, actor_admin_id,
              reason_code, occurred_at, case_version
            )
            values (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            UUID.randomUUID().dbString(),
            caseId.dbString(),
            fromState?.name,
            toState.name,
            action?.name,
            actorAdminId?.dbString(),
            reasonCode,
            occurredAt.toUtcLocalDateTime(),
            caseVersion,
        )
    }
}
