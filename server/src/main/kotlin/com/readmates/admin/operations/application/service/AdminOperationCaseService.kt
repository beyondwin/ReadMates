package com.readmates.admin.operations.application.service

import com.readmates.admin.operations.application.AdminOperationError
import com.readmates.admin.operations.application.AdminOperationException
import com.readmates.admin.operations.application.model.AdminOperationAction
import com.readmates.admin.operations.application.model.AdminOperationCase
import com.readmates.admin.operations.application.model.AdminOperationCaseFilter
import com.readmates.admin.operations.application.model.AdminOperationCaseState
import com.readmates.admin.operations.application.model.AdminOperationSourceFreshness
import com.readmates.admin.operations.application.model.AdminOperationSourceStatus
import com.readmates.admin.operations.application.model.AdminOperationSourceType
import com.readmates.admin.operations.application.model.AdminOperationTransitionCommand
import com.readmates.admin.operations.application.port.`in`.AcknowledgeAdminOperationCaseUseCase
import com.readmates.admin.operations.application.port.`in`.AdminOperationCaseDetail
import com.readmates.admin.operations.application.port.`in`.AdminOperationCasePage
import com.readmates.admin.operations.application.port.`in`.AdminOperationCaseView
import com.readmates.admin.operations.application.port.`in`.AdminOperationMutationCommand
import com.readmates.admin.operations.application.port.`in`.GetAdminOperationCaseUseCase
import com.readmates.admin.operations.application.port.`in`.ListAdminOperationCasesUseCase
import com.readmates.admin.operations.application.port.`in`.ResolveAdminOperationCaseUseCase
import com.readmates.admin.operations.application.port.`in`.SnoozeAdminOperationCaseUseCase
import com.readmates.admin.operations.application.port.`in`.SnoozeAdminOperationCommand
import com.readmates.admin.operations.application.port.out.AdminOperationCaseUpdateResult
import com.readmates.admin.operations.application.port.out.AdminOperationLifecycleResult
import com.readmates.admin.operations.application.port.out.AdminOperationMetricsPort
import com.readmates.admin.operations.application.port.out.AdminOperationSignalProvider
import com.readmates.admin.operations.application.port.out.AdminOperationSignalVerification
import com.readmates.admin.operations.application.port.out.LoadAdminOperationCasesPort
import com.readmates.admin.operations.application.port.out.NoOpAdminOperationMetricsPort
import com.readmates.admin.operations.application.port.out.WriteAdminOperationCasesPort
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.stereotype.Service
import java.time.Clock
import java.time.Duration
import java.time.OffsetDateTime
import java.util.UUID

@Service
class AdminOperationCaseService(
    private val reconciliation: AdminOperationReconciliationService,
    private val providers: List<AdminOperationSignalProvider>,
    private val caseReader: LoadAdminOperationCasesPort,
    private val caseWriter: WriteAdminOperationCasesPort,
    private val clock: Clock,
    metrics: AdminOperationMetricsPort? = null,
) : ListAdminOperationCasesUseCase,
    GetAdminOperationCaseUseCase,
    AcknowledgeAdminOperationCaseUseCase,
    SnoozeAdminOperationCaseUseCase,
    ResolveAdminOperationCaseUseCase {
    private val policy = AdminOperationCasePolicy()
    private val caseMetrics = AdminOperationCaseMetrics(metrics ?: NoOpAdminOperationMetricsPort)

    override fun list(
        admin: CurrentPlatformAdmin,
        filter: AdminOperationCaseFilter,
        page: PageRequest,
    ): AdminOperationCasePage {
        val reconciliationResult = reconciliation.reconcile(admin)
        val sources = caseReader.sourceFreshness()
        val sourceByType = sources.associateBy { it.sourceType }
        val cases = caseReader.list(filter, page, admin.userId)
        val generatedAt = reconciliationResult.generatedAt
        cases.items.forEach { caseMetrics.recordAge(it, generatedAt) }
        return AdminOperationCasePage(
            generatedAt = generatedAt,
            counts = caseReader.counts(admin.userId),
            sources = sources,
            cases = cases.map { case -> case.toView(admin, sourceByType) },
        )
    }

    override fun get(
        admin: CurrentPlatformAdmin,
        caseId: UUID,
    ): AdminOperationCaseDetail {
        val case = caseReader.get(caseId) ?: throw AdminOperationException(AdminOperationError.CASE_NOT_FOUND)
        val sourceByType = caseReader.sourceFreshness().associateBy { it.sourceType }
        return AdminOperationCaseDetail(
            case = case.toView(admin, sourceByType),
            history = caseReader.history(caseId, HISTORY_LIMIT),
        )
    }

    override fun acknowledge(
        admin: CurrentPlatformAdmin,
        command: AdminOperationMutationCommand,
    ): AdminOperationCase {
        val current = loadMutableCase(admin, command, AdminOperationAction.ACKNOWLEDGE)
        requireAction(admin, current, AdminOperationAction.ACKNOWLEDGE)
        return transition(
            current = current,
            admin = admin,
            action = AdminOperationAction.ACKNOWLEDGE,
            snoozedUntil = null,
            reasonCode = OPERATOR_ACKNOWLEDGED,
        )
    }

    override fun snooze(
        admin: CurrentPlatformAdmin,
        command: SnoozeAdminOperationCommand,
    ): AdminOperationCase {
        val mutation = AdminOperationMutationCommand(command.caseId, command.expectedVersion)
        val current = loadMutableCase(admin, mutation, AdminOperationAction.SNOOZE)
        requireAction(admin, current, AdminOperationAction.SNOOZE)
        val now = OffsetDateTime.now(clock)
        try {
            policy.validateSnooze(now, command.snoozedUntil)
        } catch (exception: AdminOperationException) {
            caseMetrics.recordLifecycle(AdminOperationAction.SNOOZE, AdminOperationLifecycleResult.INVALID_REQUEST)
            throw exception
        }
        return transition(
            current = current,
            admin = admin,
            action = AdminOperationAction.SNOOZE,
            snoozedUntil = command.snoozedUntil,
            reasonCode = OPERATOR_SNOOZED,
            now = now,
        )
    }

    override fun resolve(
        admin: CurrentPlatformAdmin,
        command: AdminOperationMutationCommand,
    ): AdminOperationCase {
        val current = loadMutableCase(admin, command, AdminOperationAction.RESOLVE)
        if (current.state == AdminOperationCaseState.RESOLVED) {
            caseMetrics.recordLifecycle(AdminOperationAction.RESOLVE, AdminOperationLifecycleResult.SUCCEEDED)
            return current
        }
        requireAction(admin, current, AdminOperationAction.RESOLVE)
        when (verifySource(admin, current)) {
            AdminOperationSignalVerification.ACTIVE ->
                fail(
                    AdminOperationAction.RESOLVE,
                    AdminOperationLifecycleResult.STILL_ACTIVE,
                    AdminOperationError.CASE_STILL_ACTIVE,
                )
            AdminOperationSignalVerification.UNAVAILABLE ->
                fail(
                    AdminOperationAction.RESOLVE,
                    AdminOperationLifecycleResult.SOURCE_UNAVAILABLE,
                    AdminOperationError.CASE_SOURCE_UNAVAILABLE,
                )
            AdminOperationSignalVerification.ABSENT -> Unit
        }
        return transition(
            current = current,
            admin = admin,
            action = AdminOperationAction.RESOLVE,
            snoozedUntil = null,
            reasonCode = OPERATOR_RESOLVED,
        )
    }

    private fun loadMutableCase(
        admin: CurrentPlatformAdmin,
        command: AdminOperationMutationCommand,
        action: AdminOperationAction,
    ): AdminOperationCase {
        if (admin.role !in MUTATING_ROLES) {
            fail(action, AdminOperationLifecycleResult.PERMISSION_DENIED, AdminOperationError.PERMISSION_DENIED)
        }
        val current =
            caseReader.get(command.caseId)
                ?: fail(action, AdminOperationLifecycleResult.NOT_FOUND, AdminOperationError.CASE_NOT_FOUND)
        if (current.version != command.expectedVersion) {
            fail(action, AdminOperationLifecycleResult.VERSION_CONFLICT, AdminOperationError.CASE_VERSION_CONFLICT)
        }
        return current
    }

    private fun requireAction(
        admin: CurrentPlatformAdmin,
        case: AdminOperationCase,
        action: AdminOperationAction,
    ) {
        if (action !in policy.allowedActions(admin.role, case.state)) {
            fail(action, AdminOperationLifecycleResult.PERMISSION_DENIED, AdminOperationError.PERMISSION_DENIED)
        }
    }

    private fun verifySource(
        admin: CurrentPlatformAdmin,
        case: AdminOperationCase,
    ): AdminOperationSignalVerification {
        val provider =
            providers.singleOrNull { it.sourceType == case.sourceType }
                ?: fail(
                    AdminOperationAction.RESOLVE,
                    AdminOperationLifecycleResult.SOURCE_UNAVAILABLE,
                    AdminOperationError.CASE_SOURCE_UNAVAILABLE,
                )
        return runCatching { provider.verify(admin, case.sourceKey) }
            .getOrElse {
                fail(
                    AdminOperationAction.RESOLVE,
                    AdminOperationLifecycleResult.SOURCE_UNAVAILABLE,
                    AdminOperationError.CASE_SOURCE_UNAVAILABLE,
                )
            }
    }

    private fun transition(
        current: AdminOperationCase,
        admin: CurrentPlatformAdmin,
        action: AdminOperationAction,
        snoozedUntil: OffsetDateTime?,
        reasonCode: String,
        now: OffsetDateTime = OffsetDateTime.now(clock),
    ): AdminOperationCase {
        policy.validateReasonCode(reasonCode)
        val result =
            caseWriter.transition(
                AdminOperationTransitionCommand(
                    caseId = current.id,
                    expectedVersion = current.version,
                    action = action,
                    actorAdminId = admin.userId,
                    snoozedUntil = snoozedUntil,
                    reasonCode = reasonCode,
                    now = now,
                ),
            )
        return when (result) {
            is AdminOperationCaseUpdateResult.Updated -> {
                caseMetrics.recordLifecycle(action, AdminOperationLifecycleResult.SUCCEEDED)
                result.case
            }
            AdminOperationCaseUpdateResult.NotFound ->
                fail(action, AdminOperationLifecycleResult.NOT_FOUND, AdminOperationError.CASE_NOT_FOUND)
            AdminOperationCaseUpdateResult.VersionConflict ->
                fail(action, AdminOperationLifecycleResult.VERSION_CONFLICT, AdminOperationError.CASE_VERSION_CONFLICT)
        }
    }

    private fun AdminOperationCase.toView(
        admin: CurrentPlatformAdmin,
        sourceByType: Map<AdminOperationSourceType, AdminOperationSourceFreshness>,
    ): AdminOperationCaseView =
        AdminOperationCaseView(
            case = this,
            allowedActions = policy.allowedActions(admin.role, state),
            source = sourceByType[sourceType] ?: unavailableFreshness(sourceType, OffsetDateTime.now(clock)),
        )

    private fun fail(
        action: AdminOperationAction,
        result: AdminOperationLifecycleResult,
        error: AdminOperationError,
    ): Nothing {
        caseMetrics.recordLifecycle(action, result)
        throw AdminOperationException(error)
    }

    private companion object {
        const val HISTORY_LIMIT = 100
        const val OPERATOR_ACKNOWLEDGED = "OPERATOR_ACKNOWLEDGED"
        const val OPERATOR_SNOOZED = "OPERATOR_SNOOZED"
        const val OPERATOR_RESOLVED = "OPERATOR_RESOLVED"
        val MUTATING_ROLES = setOf(PlatformAdminRole.OWNER, PlatformAdminRole.OPERATOR)
    }
}

private class AdminOperationCaseMetrics(
    private val metrics: AdminOperationMetricsPort,
) {
    fun recordAge(
        case: AdminOperationCase,
        generatedAt: OffsetDateTime,
    ) {
        val seconds = Duration.between(case.firstObservedAt, generatedAt).seconds.coerceAtLeast(0)
        runCatching { metrics.recordCaseAge(case.sourceType, case.severity, seconds) }
    }

    fun recordLifecycle(
        action: AdminOperationAction,
        result: AdminOperationLifecycleResult,
    ) {
        runCatching { metrics.recordLifecycle(action, result) }
    }
}

private fun unavailableFreshness(
    sourceType: AdminOperationSourceType,
    now: OffsetDateTime,
) = AdminOperationSourceFreshness(
    sourceType = sourceType,
    status = AdminOperationSourceStatus.UNAVAILABLE,
    generatedAt = now,
    lastSuccessfulAt = null,
    authoritative = false,
)

private fun <T, R> CursorPage<T>.map(transform: (T) -> R): CursorPage<R> =
    CursorPage(
        items = items.map(transform),
        nextCursor = nextCursor,
    )
