@file:Suppress("LongMethod", "TooManyFunctions")

package com.readmates.admin.operations.adapter.out.persistence

import com.readmates.admin.operations.application.AdminOperationError.INVALID_CURSOR
import com.readmates.admin.operations.application.AdminOperationException
import com.readmates.admin.operations.application.model.AdminOperationAction
import com.readmates.admin.operations.application.model.AdminOperationAssigneeFilter
import com.readmates.admin.operations.application.model.AdminOperationCase
import com.readmates.admin.operations.application.model.AdminOperationCaseCounts
import com.readmates.admin.operations.application.model.AdminOperationCaseEvent
import com.readmates.admin.operations.application.model.AdminOperationCaseFilter
import com.readmates.admin.operations.application.model.AdminOperationCaseState
import com.readmates.admin.operations.application.model.AdminOperationSeverity
import com.readmates.admin.operations.application.model.AdminOperationSignal
import com.readmates.admin.operations.application.model.AdminOperationSignalBatch
import com.readmates.admin.operations.application.model.AdminOperationSourceFreshness
import com.readmates.admin.operations.application.model.AdminOperationSourceStatus
import com.readmates.admin.operations.application.model.AdminOperationSourceType
import com.readmates.admin.operations.application.model.AdminOperationTransitionCommand
import com.readmates.admin.operations.application.port.out.AdminOperationCaseUpdateResult
import com.readmates.admin.operations.application.port.out.LoadAdminOperationCasesPort
import com.readmates.admin.operations.application.port.out.WriteAdminOperationCasesPort
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.utcOffsetDateTimeOrNull
import com.readmates.shared.db.uuid
import com.readmates.shared.db.uuidOrNull
import com.readmates.shared.paging.CursorCodec
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import java.sql.ResultSet
import java.time.OffsetDateTime
import java.util.UUID

@Repository
class JdbcAdminOperationCaseAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : LoadAdminOperationCasesPort,
    WriteAdminOperationCasesPort {
    override fun list(
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
        page.cursor.takeIf { it.isNotEmpty() }?.let { cursor ->
            val decoded = decodeCursor(cursor)
            predicates +=
                """
                (
                  $SEVERITY_RANK_SQL > ?
                  or ($SEVERITY_RANK_SQL = ? and first_observed_at > ?)
                  or ($SEVERITY_RANK_SQL = ? and first_observed_at = ? and id > ?)
                )
                """.trimIndent()
            arguments += decoded.severityRank
            arguments += decoded.severityRank
            arguments += decoded.firstObservedAt.toUtcLocalDateTime()
            arguments += decoded.severityRank
            arguments += decoded.firstObservedAt.toUtcLocalDateTime()
            arguments += decoded.id.dbString()
        }
        val where = predicates.takeIf { it.isNotEmpty() }?.joinToString(" and ", prefix = "where ").orEmpty()
        val limit = page.limit.coerceAtLeast(1)
        arguments += limit + 1
        val rows =
            queryCases(
                """
                select *
                from admin_operation_cases
                $where
                order by $SEVERITY_RANK_SQL, first_observed_at, id
                limit ?
                """.trimIndent(),
                arguments,
            )
        val items = rows.take(limit)
        val nextCursor =
            if (rows.size > limit) {
                items.lastOrNull()?.toCursor()
            } else {
                null
            }
        return CursorPage(items = items, nextCursor = nextCursor)
    }

    override fun counts(adminId: UUID): AdminOperationCaseCounts =
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

    override fun get(caseId: UUID): AdminOperationCase? =
        queryCases(
            "select * from admin_operation_cases where id = ?",
            listOf(caseId.dbString()),
        ).firstOrNull()

    override fun history(
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
            EVENT_ROW_MAPPER,
            caseId.dbString(),
            limit.coerceIn(1, MAX_HISTORY_LIMIT),
        )

    override fun sourceFreshness(): List<AdminOperationSourceFreshness> =
        jdbcTemplate.query(
            """
            select *
            from admin_operation_source_status
            order by field(source_type, 'CLUB_READINESS', 'NOTIFICATION', 'AI_JOB', 'CLOSING_RISK')
            """.trimIndent(),
        ) { rs, _ -> rs.toSourceFreshness() }

    @Transactional
    override fun reconcile(
        batch: AdminOperationSignalBatch,
        now: OffsetDateTime,
    ): List<AdminOperationCase> {
        if (
            batch.status == AdminOperationSourceStatus.UNAVAILABLE ||
            batch.status == AdminOperationSourceStatus.DISABLED
        ) {
            return emptyList()
        }
        val signals =
            batch.signals
                .onEach { require(it.sourceType == batch.sourceType) { "Signal source must match its batch" } }
                .associateBy { it.sourceKey }
                .values
        val reconciled = signals.map { signal -> reconcileSignal(signal, now) }
        if (batch.status == AdminOperationSourceStatus.AVAILABLE && batch.authoritative) {
            resolveMissing(batch.sourceType, signals.mapTo(mutableSetOf()) { it.sourceKey }, now)
        }
        return reconciled
    }

    @Transactional
    override fun recordSourceFreshness(freshness: AdminOperationSourceFreshness) {
        jdbcTemplate.update(
            """
            insert into admin_operation_source_status (
              source_type, status, attempted_at, last_successful_at, authoritative
            )
            values (?, ?, ?, ?, ?) as incoming
            on duplicate key update
              status = incoming.status,
              attempted_at = incoming.attempted_at,
              last_successful_at = coalesce(
                incoming.last_successful_at,
                admin_operation_source_status.last_successful_at
              ),
              authoritative = incoming.authoritative
            """.trimIndent(),
            freshness.sourceType.name,
            freshness.status.name,
            freshness.generatedAt.toUtcLocalDateTime(),
            freshness.lastSuccessfulAt?.toUtcLocalDateTime(),
            freshness.authoritative,
        )
    }

    @Transactional
    override fun transition(command: AdminOperationTransitionCommand): AdminOperationCaseUpdateResult =
        get(command.caseId)?.let { current ->
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
            appendEvent(
                caseId = command.caseId,
                fromState = current.state,
                toState = targetState,
                action = command.action,
                actorAdminId = command.actorAdminId,
                reasonCode = command.reasonCode,
                occurredAt = command.now,
                caseVersion = current.version + 1,
            )
            AdminOperationCaseUpdateResult.Updated(requireNotNull(get(command.caseId)))
        }
    }

    private fun reconcileSignal(
        signal: AdminOperationSignal,
        now: OffsetDateTime,
    ): AdminOperationCase {
        val newCaseId = UUID.randomUUID()
        val inserted =
            jdbcTemplate.update(
                """
                insert ignore into admin_operation_cases (
                  id, source_type, source_key, club_id, state, severity, safe_summary_code,
                  first_observed_at, last_observed_at, reopen_count, version, impact_count, detail_href
                )
                values (?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, 0, 0, ?, ?)
                """.trimIndent(),
                newCaseId.dbString(),
                signal.sourceType.name,
                signal.sourceKey,
                signal.clubId?.dbString(),
                signal.severity.name,
                signal.summaryCode,
                signal.observedAt.toUtcLocalDateTime(),
                signal.observedAt.toUtcLocalDateTime(),
                signal.impactCount,
                signal.detailHref,
            )
        val locked = lockBySourceIdentity(signal.sourceType, signal.sourceKey)
        if (inserted == 1) {
            appendEvent(
                caseId = newCaseId,
                fromState = null,
                toState = AdminOperationCaseState.OPEN,
                action = null,
                actorAdminId = null,
                reasonCode = SIGNAL_OPENED,
                occurredAt = now,
                caseVersion = 0,
            )
            return locked
        }

        val reopensResolved = locked.state == AdminOperationCaseState.RESOLVED
        val reopensExpiredSnooze =
            locked.state == AdminOperationCaseState.SNOOZED &&
                locked.snoozedUntil?.let { !it.isAfter(now) } == true
        val reopens = reopensResolved || reopensExpiredSnooze
        jdbcTemplate.update(
            """
            update admin_operation_cases
            set club_id = ?,
                state = ?,
                severity = ?,
                safe_summary_code = ?,
                last_observed_at = ?,
                acknowledged_at = case when ? then null else acknowledged_at end,
                snoozed_until = ?,
                resolved_at = ?,
                resolution_code = ?,
                reopen_count = reopen_count + ?,
                version = version + 1,
                impact_count = ?,
                detail_href = ?
            where id = ?
            """.trimIndent(),
            signal.clubId?.dbString(),
            if (reopens) AdminOperationCaseState.OPEN.name else locked.state.name,
            signal.severity.name,
            signal.summaryCode,
            signal.observedAt.toUtcLocalDateTime(),
            reopens,
            if (reopens) null else locked.snoozedUntil?.toUtcLocalDateTime(),
            if (reopens) null else locked.resolvedAt?.toUtcLocalDateTime(),
            null,
            if (reopensResolved) 1 else 0,
            signal.impactCount,
            signal.detailHref,
            locked.id.dbString(),
        )
        val updated = requireNotNull(get(locked.id))
        if (reopens) {
            appendEvent(
                caseId = locked.id,
                fromState = locked.state,
                toState = AdminOperationCaseState.OPEN,
                action = null,
                actorAdminId = null,
                reasonCode = SIGNAL_REOPENED,
                occurredAt = now,
                caseVersion = updated.version,
            )
        }
        return updated
    }

    private fun resolveMissing(
        sourceType: AdminOperationSourceType,
        activeKeys: Set<String>,
        now: OffsetDateTime,
    ) {
        val candidates =
            queryCases(
                """
                select *
                from admin_operation_cases
                where source_type = ? and state <> 'RESOLVED'
                for update
                """.trimIndent(),
                listOf(sourceType.name),
            ).filterNot { it.sourceKey in activeKeys }
        for (candidate in candidates) {
            val updated =
                jdbcTemplate.update(
                    """
                    update admin_operation_cases
                    set state = 'RESOLVED',
                        snoozed_until = null,
                        resolved_at = ?,
                        resolution_code = ?,
                        version = version + 1
                    where id = ? and version = ?
                    """.trimIndent(),
                    now.toUtcLocalDateTime(),
                    SIGNAL_CLEARED,
                    candidate.id.dbString(),
                    candidate.version,
                )
            if (updated == 1) {
                appendEvent(
                    caseId = candidate.id,
                    fromState = candidate.state,
                    toState = AdminOperationCaseState.RESOLVED,
                    action = null,
                    actorAdminId = null,
                    reasonCode = SIGNAL_CLEARED,
                    occurredAt = now,
                    caseVersion = candidate.version + 1,
                )
            }
        }
    }

    private fun lockBySourceIdentity(
        sourceType: AdminOperationSourceType,
        sourceKey: String,
    ): AdminOperationCase =
        queryCases(
            """
            select *
            from admin_operation_cases
            where source_type = ? and source_key = ?
            for update
            """.trimIndent(),
            listOf(sourceType.name, sourceKey),
        ).single()

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

    private fun appendEvent(
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

    private fun queryCases(
        sql: String,
        arguments: List<Any>,
    ): List<AdminOperationCase> {
        @Suppress("SpreadOperator")
        return jdbcTemplate.query(sql, CASE_ROW_MAPPER, *arguments.toTypedArray())
    }

    private fun decodeCursor(cursor: Map<String, String>): CaseCursor {
        if (cursor.keys != CURSOR_KEYS) throw AdminOperationException(INVALID_CURSOR)
        return runCatching {
            CaseCursor(
                severityRank = cursor.getValue(CURSOR_SEVERITY_RANK).toInt(),
                firstObservedAt = OffsetDateTime.parse(cursor.getValue(CURSOR_FIRST_OBSERVED_AT)),
                id = UUID.fromString(cursor.getValue(CURSOR_ID)),
            )
        }.getOrElse { throw AdminOperationException(INVALID_CURSOR) }
    }

    private data class CaseCursor(
        val severityRank: Int,
        val firstObservedAt: OffsetDateTime,
        val id: UUID,
    )

    private companion object {
        const val MAX_HISTORY_LIMIT = 100
        const val SIGNAL_OPENED = "SIGNAL_OPENED"
        const val SIGNAL_REOPENED = "SIGNAL_REOPENED"
        const val SIGNAL_CLEARED = "SIGNAL_CLEARED"
        const val CURSOR_SEVERITY_RANK = "severityRank"
        const val CURSOR_FIRST_OBSERVED_AT = "firstObservedAt"
        const val CURSOR_ID = "id"
        val CURSOR_KEYS = setOf(CURSOR_SEVERITY_RANK, CURSOR_FIRST_OBSERVED_AT, CURSOR_ID)
        const val SEVERITY_RANK_SQL =
            "case severity when 'CRITICAL' then 0 when 'WARNING' then 1 when 'READY' then 2 else 3 end"

        val CASE_ROW_MAPPER = RowMapper<AdminOperationCase> { rs, _ -> rs.toAdminOperationCase() }
        val EVENT_ROW_MAPPER = RowMapper<AdminOperationCaseEvent> { rs, _ -> rs.toAdminOperationCaseEvent() }
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

private fun ResultSet.toSourceFreshness(): AdminOperationSourceFreshness =
    AdminOperationSourceFreshness(
        sourceType = AdminOperationSourceType.valueOf(getString("source_type")),
        status = AdminOperationSourceStatus.valueOf(getString("status")),
        generatedAt = utcOffsetDateTime("attempted_at"),
        lastSuccessfulAt = utcOffsetDateTimeOrNull("last_successful_at"),
        authoritative = getBoolean("authoritative"),
    )

private fun AdminOperationAction.targetState(): AdminOperationCaseState =
    when (this) {
        AdminOperationAction.ACKNOWLEDGE -> AdminOperationCaseState.ACKNOWLEDGED
        AdminOperationAction.SNOOZE -> AdminOperationCaseState.SNOOZED
        AdminOperationAction.RESOLVE -> AdminOperationCaseState.RESOLVED
    }

private fun AdminOperationCase.toCursor(): String? =
    CursorCodec.encode(
        mapOf(
            "severityRank" to severity.rank().toString(),
            "firstObservedAt" to firstObservedAt.toString(),
            "id" to id.toString(),
        ),
    )

private fun AdminOperationSeverity.rank(): Int =
    when (this) {
        AdminOperationSeverity.CRITICAL -> 0
        AdminOperationSeverity.WARNING -> 1
        AdminOperationSeverity.READY -> 2
        AdminOperationSeverity.INFO -> INFO_SEVERITY_RANK
    }

private const val INFO_SEVERITY_RANK = 3
