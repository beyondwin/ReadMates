package com.readmates.admin.operations.adapter.out.persistence

import com.readmates.admin.operations.application.model.AdminOperationAssigneeFilter
import com.readmates.admin.operations.application.model.AdminOperationCase
import com.readmates.admin.operations.application.model.AdminOperationCaseCounts
import com.readmates.admin.operations.application.model.AdminOperationCaseEvent
import com.readmates.admin.operations.application.model.AdminOperationCaseFilter
import com.readmates.admin.operations.application.model.AdminOperationSourceFreshness
import com.readmates.shared.db.dbString
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import java.util.UUID

@Component
internal class AdminOperationCaseJdbcReader(
    private val jdbcTemplate: JdbcTemplate,
) {
    fun list(
        filter: AdminOperationCaseFilter,
        page: PageRequest,
        adminId: UUID,
    ): CursorPage<AdminOperationCase> {
        val predicates = mutableListOf<String>()
        val arguments = mutableListOf<Any>()
        predicates.addEnumFilter("state", filter.states, arguments)
        predicates.addEnumFilter("severity", filter.severities, arguments)
        predicates.addEnumFilter("source_type", filter.sources, arguments)
        if (filter.assignee == AdminOperationAssigneeFilter.ME) {
            predicates += "assignee_admin_id = ?"
            arguments += adminId.dbString()
        }
        AdminOperationCaseJdbcCursor.appendContinuation(page.cursor, predicates, arguments)
        val where = predicates.takeIf { it.isNotEmpty() }?.joinToString(" and ", prefix = "where ").orEmpty()
        val limit = page.limit.coerceAtLeast(1)
        arguments += limit + 1
        val rows =
            queryCases(
                """
                select *
                from admin_operation_cases
                $where
                order by ${AdminOperationCaseJdbcCursor.SEVERITY_RANK_SQL}, first_observed_at, id
                limit ?
                """.trimIndent(),
                arguments,
            )
        val items = rows.take(limit)
        return CursorPage(
            items = items,
            nextCursor =
                if (rows.size > limit) {
                    items.lastOrNull()?.let(AdminOperationCaseJdbcCursor::encode)
                } else {
                    null
                },
        )
    }

    fun counts(adminId: UUID): AdminOperationCaseCounts =
        requireNotNull(
            jdbcTemplate.queryForObject(
                """
                select
                  sum(case when state = 'OPEN' then 1 else 0 end) as open_count,
                  sum(case when state <> 'RESOLVED' and severity = 'CRITICAL' then 1 else 0 end) as critical_count,
                  sum(case when state <> 'RESOLVED' and assignee_admin_id = ? then 1 else 0 end) as assigned_count,
                  sum(case when state = 'SNOOZED' then 1 else 0 end) as snoozed_count
                from admin_operation_cases
                """.trimIndent(),
                { rs, _ ->
                    AdminOperationCaseCounts(
                        open = rs.getLong("open_count"),
                        critical = rs.getLong("critical_count"),
                        assignedToMe = rs.getLong("assigned_count"),
                        snoozed = rs.getLong("snoozed_count"),
                    )
                },
                adminId.dbString(),
            ),
        )

    fun get(caseId: UUID): AdminOperationCase? =
        queryCases(
            "select * from admin_operation_cases where id = ?",
            listOf(caseId.dbString()),
        ).firstOrNull()

    fun history(
        caseId: UUID,
        limit: Int,
    ): List<AdminOperationCaseEvent> =
        jdbcTemplate.query(
            """
            select *
            from admin_operation_case_events
            where case_id = ?
            order by occurred_at desc, id desc
            limit ?
            """.trimIndent(),
            ADMIN_OPERATION_EVENT_ROW_MAPPER,
            caseId.dbString(),
            limit.coerceIn(1, MAX_HISTORY_LIMIT),
        )

    fun sourceFreshness(): List<AdminOperationSourceFreshness> =
        jdbcTemplate.query(
            """
            select *
            from admin_operation_source_status
            order by field(source_type, 'CLUB_READINESS', 'NOTIFICATION', 'AI_JOB', 'CLOSING_RISK')
            """.trimIndent(),
        ) { rs, _ -> rs.toAdminOperationSourceFreshness() }

    fun queryCases(
        sql: String,
        arguments: List<Any>,
    ): List<AdminOperationCase> {
        @Suppress("SpreadOperator")
        return jdbcTemplate.query(sql, ADMIN_OPERATION_CASE_ROW_MAPPER, *arguments.toTypedArray())
    }

    private companion object {
        const val MAX_HISTORY_LIMIT = 100
    }
}

private fun <E : Enum<E>> MutableList<String>.addEnumFilter(
    column: String,
    values: Set<E>,
    arguments: MutableList<Any>,
) {
    if (values.isEmpty()) return
    this += "$column in (${values.joinToString(",") { "?" }})"
    arguments.addAll(values.map { it.name })
}
