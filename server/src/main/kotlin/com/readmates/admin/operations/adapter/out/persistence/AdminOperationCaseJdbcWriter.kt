package com.readmates.admin.operations.adapter.out.persistence

import com.readmates.admin.operations.application.model.AdminOperationCase
import com.readmates.admin.operations.application.model.AdminOperationSignalBatch
import com.readmates.admin.operations.application.model.AdminOperationSourceFreshness
import com.readmates.admin.operations.application.model.AdminOperationTransitionCommand
import com.readmates.shared.db.toUtcLocalDateTime
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import java.time.OffsetDateTime

@Component
internal class AdminOperationCaseJdbcWriter(
    private val jdbcTemplate: JdbcTemplate,
    private val reconciler: AdminOperationCaseJdbcReconciler,
    private val transitionWriter: AdminOperationCaseTransitionJdbcWriter,
) {
    fun reconcile(
        batch: AdminOperationSignalBatch,
        now: OffsetDateTime,
    ): List<AdminOperationCase> = reconciler.reconcile(batch, now)

    fun recordSourceFreshness(freshness: AdminOperationSourceFreshness) {
        jdbcTemplate.update(
            """
            insert into admin_operation_source_status (
              source_type, status, attempted_at, last_successful_at, authoritative
            )
            values (?, ?, ?, ?, ?) as incoming
            on duplicate key update
              status = if(
                incoming.attempted_at >= admin_operation_source_status.attempted_at,
                incoming.status,
                admin_operation_source_status.status
              ),
              authoritative = if(
                incoming.attempted_at >= admin_operation_source_status.attempted_at,
                incoming.authoritative,
                admin_operation_source_status.authoritative
              ),
              last_successful_at = coalesce(
                greatest(
                  incoming.last_successful_at,
                  admin_operation_source_status.last_successful_at
                ),
                incoming.last_successful_at,
                admin_operation_source_status.last_successful_at
              ),
              attempted_at = greatest(
                incoming.attempted_at,
                admin_operation_source_status.attempted_at
              )
            """.trimIndent(),
            freshness.sourceType.name,
            freshness.status.name,
            freshness.generatedAt.toUtcLocalDateTime(),
            freshness.lastSuccessfulAt?.toUtcLocalDateTime(),
            freshness.authoritative,
        )
    }

    fun transition(command: AdminOperationTransitionCommand) = transitionWriter.transition(command)
}
