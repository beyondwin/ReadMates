package com.readmates.admin.operations.adapter.out.persistence

import com.readmates.admin.operations.application.model.AdminOperationCase
import com.readmates.admin.operations.application.model.AdminOperationCaseState
import com.readmates.admin.operations.application.model.AdminOperationSignal
import com.readmates.admin.operations.application.model.AdminOperationSignalBatch
import com.readmates.admin.operations.application.model.AdminOperationSourceStatus
import com.readmates.admin.operations.application.model.AdminOperationSourceType
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import java.time.OffsetDateTime
import java.util.UUID

@Component
internal class AdminOperationCaseJdbcReconciler(
    private val jdbcTemplate: JdbcTemplate,
    private val reader: AdminOperationCaseJdbcReader,
    private val events: AdminOperationCaseEventJdbcAppender,
) {
    fun reconcile(
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
            resolveMissing(
                batch.sourceType,
                signals.mapTo(mutableSetOf()) { it.sourceKey },
                batch.generatedAt,
                now,
            )
        }
        return reconciled
    }

    private fun reconcileSignal(
        signal: AdminOperationSignal,
        now: OffsetDateTime,
    ): AdminOperationCase {
        val insertion = insertSignal(signal)
        val locked = lockBySourceIdentity(signal.sourceType, signal.sourceKey)
        return when {
            insertion.inserted -> {
                events.append(
                    caseId = insertion.caseId,
                    fromState = null,
                    toState = AdminOperationCaseState.OPEN,
                    action = null,
                    actorAdminId = null,
                    reasonCode = SIGNAL_OPENED,
                    occurredAt = now,
                    caseVersion = 0,
                )
                locked
            }
            signal.observedAt.isBefore(locked.lastObservedAt) -> locked
            else -> reconcileExisting(locked, signal, now)
        }
    }

    private fun insertSignal(signal: AdminOperationSignal): CaseInsertion {
        val caseId = UUID.randomUUID()
        val inserted =
            jdbcTemplate.update(
                """
                insert ignore into admin_operation_cases (
                  id, source_type, source_key, club_id, state, severity, safe_summary_code,
                  first_observed_at, last_observed_at, reopen_count, version, impact_count, detail_href
                )
                values (?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, 0, 0, ?, ?)
                """.trimIndent(),
                caseId.dbString(),
                signal.sourceType.name,
                signal.sourceKey,
                signal.clubId?.dbString(),
                signal.severity.name,
                signal.summaryCode,
                signal.observedAt.toUtcLocalDateTime(),
                signal.observedAt.toUtcLocalDateTime(),
                signal.impactCount,
                signal.detailHref,
            ) == 1
        return CaseInsertion(caseId, inserted)
    }

    private fun reconcileExisting(
        locked: AdminOperationCase,
        signal: AdminOperationSignal,
        now: OffsetDateTime,
    ): AdminOperationCase {
        val reopensResolved = locked.state == AdminOperationCaseState.RESOLVED
        val reopensExpiredSnooze =
            locked.state == AdminOperationCaseState.SNOOZED &&
                locked.snoozedUntil?.let { !it.isAfter(now) } == true
        val reopens = reopensResolved || reopensExpiredSnooze
        updateProjection(locked, signal, reopens, reopensResolved)
        val updated = requireNotNull(reader.get(locked.id))
        if (reopens) {
            events.append(
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

    private fun updateProjection(
        locked: AdminOperationCase,
        signal: AdminOperationSignal,
        reopens: Boolean,
        reopensResolved: Boolean,
    ) {
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
    }

    private fun resolveMissing(
        sourceType: AdminOperationSourceType,
        activeKeys: Set<String>,
        generatedAt: OffsetDateTime,
        now: OffsetDateTime,
    ) {
        reader
            .queryCases(
                """
                select *
                from admin_operation_cases
                where source_type = ? and state <> 'RESOLVED'
                for update
                """.trimIndent(),
                listOf(sourceType.name),
            ).filterNot { it.sourceKey in activeKeys || it.lastObservedAt.isAfter(generatedAt) }
            .forEach { candidate -> resolveCandidate(candidate, now) }
    }

    private fun resolveCandidate(
        candidate: AdminOperationCase,
        now: OffsetDateTime,
    ) {
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
            events.append(
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

    private fun lockBySourceIdentity(
        sourceType: AdminOperationSourceType,
        sourceKey: String,
    ): AdminOperationCase =
        reader
            .queryCases(
                """
                select *
                from admin_operation_cases
                where source_type = ? and source_key = ?
                for update
                """.trimIndent(),
                listOf(sourceType.name, sourceKey),
            ).single()

    private data class CaseInsertion(
        val caseId: UUID,
        val inserted: Boolean,
    )

    private companion object {
        const val SIGNAL_OPENED = "SIGNAL_OPENED"
        const val SIGNAL_REOPENED = "SIGNAL_REOPENED"
        const val SIGNAL_CLEARED = "SIGNAL_CLEARED"
    }
}
