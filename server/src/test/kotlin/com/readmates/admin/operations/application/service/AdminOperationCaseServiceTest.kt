package com.readmates.admin.operations.application.service

import com.readmates.admin.operations.application.AdminOperationError
import com.readmates.admin.operations.application.AdminOperationException
import com.readmates.admin.operations.application.model.AdminOperationAction
import com.readmates.admin.operations.application.model.AdminOperationAssigneeFilter
import com.readmates.admin.operations.application.model.AdminOperationCase
import com.readmates.admin.operations.application.model.AdminOperationCaseCounts
import com.readmates.admin.operations.application.model.AdminOperationCaseEvent
import com.readmates.admin.operations.application.model.AdminOperationCaseFilter
import com.readmates.admin.operations.application.model.AdminOperationCaseState
import com.readmates.admin.operations.application.model.AdminOperationSeverity
import com.readmates.admin.operations.application.model.AdminOperationSignalBatch
import com.readmates.admin.operations.application.model.AdminOperationSourceFreshness
import com.readmates.admin.operations.application.model.AdminOperationSourceStatus
import com.readmates.admin.operations.application.model.AdminOperationSourceType
import com.readmates.admin.operations.application.model.AdminOperationTransitionCommand
import com.readmates.admin.operations.application.port.`in`.AdminOperationMutationCommand
import com.readmates.admin.operations.application.port.`in`.SnoozeAdminOperationCommand
import com.readmates.admin.operations.application.port.out.AdminOperationCaseUpdateResult
import com.readmates.admin.operations.application.port.out.AdminOperationLifecycleResult
import com.readmates.admin.operations.application.port.out.AdminOperationMetricsPort
import com.readmates.admin.operations.application.port.out.AdminOperationSignalProvider
import com.readmates.admin.operations.application.port.out.AdminOperationSignalVerification
import com.readmates.admin.operations.application.port.out.LoadAdminOperationCasesPort
import com.readmates.admin.operations.application.port.out.WriteAdminOperationCasesPort
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentPlatformAdmin
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

class AdminOperationCaseServiceTest {
    @Test
    fun `list reconciles then returns cases plus every source freshness`() {
        val store = RecordingCaseStore(case())
        val providers = AdminOperationSourceType.entries.map(::availableProvider)
        val metrics = RecordingMetrics()
        val service = service(store = store, providers = providers, metrics = metrics)

        val result = service.list(owner, AdminOperationCaseFilter(), PAGE)

        assertThat(result.generatedAt).isEqualTo(NOW)
        assertThat(result.counts).isEqualTo(COUNTS)
        assertThat(result.sources.map { it.sourceType }).containsExactlyElementsOf(AdminOperationSourceType.entries)
        val view = result.cases.items.single()
        assertThat(view.source.sourceType).isEqualTo(AdminOperationSourceType.NOTIFICATION)
        assertThat(view.allowedActions)
            .containsExactlyInAnyOrder(
                AdminOperationAction.ACKNOWLEDGE,
                AdminOperationAction.SNOOZE,
                AdminOperationAction.RESOLVE,
            )
        assertThat(store.calls.indexOf("list:${owner.userId}"))
            .isGreaterThan(store.calls.indexOf("reconcile:NOTIFICATION"))
        assertThat(metrics.caseAges).containsExactly(
            Triple(AdminOperationSourceType.NOTIFICATION, AdminOperationSeverity.CRITICAL, 14_400L),
        )
    }

    @Test
    fun `support can list and inspect but acknowledge is forbidden`() {
        val store = RecordingCaseStore(case(), freshness = listOf(freshness()))
        val provider = availableProvider(AdminOperationSourceType.NOTIFICATION)
        val service = service(store = store, providers = listOf(provider))

        val page = service.list(support, AdminOperationCaseFilter(), PAGE)
        val detail = service.get(support, CASE_ID)

        val pageView = page.cases.items.single()
        assertThat(pageView.allowedActions).isEmpty()
        assertThat(detail.case.allowedActions).isEmpty()
        assertThatThrownBy {
            service.acknowledge(support, AdminOperationMutationCommand(CASE_ID, expectedVersion = 4))
        }.isInstanceOfSatisfying(AdminOperationException::class.java) { exception ->
            assertThat(exception.error).isEqualTo(AdminOperationError.PERMISSION_DENIED)
        }
        assertThat(store.transitions).isEmpty()
    }

    @Test
    fun `acknowledge writes event and increments version once`() {
        val store = RecordingCaseStore(case())
        val metrics = RecordingMetrics()
        val service = service(store = store, metrics = metrics)

        val result = service.acknowledge(operator, AdminOperationMutationCommand(CASE_ID, expectedVersion = 4))

        assertThat(result.state).isEqualTo(AdminOperationCaseState.ACKNOWLEDGED)
        assertThat(result.version).isEqualTo(5)
        assertThat(result.assigneeAdminId).isEqualTo(operator.userId)
        val transition = store.transitions.single()
        assertThat(transition.action).isEqualTo(AdminOperationAction.ACKNOWLEDGE)
        assertThat(transition.reasonCode).isEqualTo("OPERATOR_ACKNOWLEDGED")
        assertThat(transition.actorAdminId).isEqualTo(operator.userId)
        val event = store.events.single()
        assertThat(event.action).isEqualTo(AdminOperationAction.ACKNOWLEDGE)
        assertThat(event.caseVersion).isEqualTo(5)
        assertThat(metrics.lifecycle).containsExactly(
            AdminOperationAction.ACKNOWLEDGE to AdminOperationLifecycleResult.SUCCEEDED,
        )
    }

    @Test
    fun `snooze validates server clock and seven day maximum`() {
        val store = RecordingCaseStore(case())
        val service = service(store = store)

        assertError(AdminOperationError.INVALID_SNOOZE_WINDOW) {
            service.snooze(operator, SnoozeAdminOperationCommand(CASE_ID, 4, NOW))
        }
        assertError(AdminOperationError.INVALID_SNOOZE_WINDOW) {
            service.snooze(operator, SnoozeAdminOperationCommand(CASE_ID, 4, NOW.plusDays(7).plusNanos(1)))
        }

        val result = service.snooze(operator, SnoozeAdminOperationCommand(CASE_ID, 4, NOW.plusDays(7)))

        assertThat(result.state).isEqualTo(AdminOperationCaseState.SNOOZED)
        val transition = store.transitions.single()
        assertThat(transition.now).isEqualTo(NOW)
        assertThat(transition.snoozedUntil).isEqualTo(NOW.plusDays(7))
        assertThat(transition.reasonCode).isEqualTo("OPERATOR_SNOOZED")
    }

    @Test
    fun `resolve verifies exact provider identity before transition`() {
        val store = RecordingCaseStore(case(sourceType = AdminOperationSourceType.NOTIFICATION))
        val unrelated = VerifyingProvider(AdminOperationSourceType.AI_JOB, AdminOperationSignalVerification.ACTIVE)
        val matching = VerifyingProvider(AdminOperationSourceType.NOTIFICATION, AdminOperationSignalVerification.ABSENT)
        val service = service(store = store, providers = listOf(unrelated, matching))

        val result = service.resolve(owner, AdminOperationMutationCommand(CASE_ID, 4))

        assertThat(result.state).isEqualTo(AdminOperationCaseState.RESOLVED)
        assertThat(unrelated.verifications).isEmpty()
        assertThat(matching.verifications).containsExactly(owner to SOURCE_KEY)
        assertThat(store.transitions.single().reasonCode).isEqualTo("OPERATOR_RESOLVED")
    }

    @Test
    fun `active signal returns CASE_STILL_ACTIVE`() {
        val store = RecordingCaseStore(case())
        val metrics = RecordingMetrics()
        val provider = VerifyingProvider(AdminOperationSourceType.NOTIFICATION, AdminOperationSignalVerification.ACTIVE)
        val service = service(store = store, providers = listOf(provider), metrics = metrics)

        assertError(AdminOperationError.CASE_STILL_ACTIVE) {
            service.resolve(operator, AdminOperationMutationCommand(CASE_ID, 4))
        }

        assertThat(store.transitions).isEmpty()
        assertThat(store.events).isEmpty()
        assertThat(metrics.lifecycle).containsExactly(
            AdminOperationAction.RESOLVE to AdminOperationLifecycleResult.STILL_ACTIVE,
        )
    }

    @Test
    fun `unavailable verification returns CASE_SOURCE_UNAVAILABLE`() {
        val store = RecordingCaseStore(case())
        val metrics = RecordingMetrics()
        val provider =
            VerifyingProvider(
                AdminOperationSourceType.NOTIFICATION,
                AdminOperationSignalVerification.UNAVAILABLE,
            )
        val service = service(store = store, providers = listOf(provider), metrics = metrics)

        assertError(AdminOperationError.CASE_SOURCE_UNAVAILABLE) {
            service.resolve(operator, AdminOperationMutationCommand(CASE_ID, 4))
        }

        assertThat(store.transitions).isEmpty()
        assertThat(metrics.lifecycle).containsExactly(
            AdminOperationAction.RESOLVE to AdminOperationLifecycleResult.SOURCE_UNAVAILABLE,
        )
    }

    @Test
    fun `stale expected version returns CASE_VERSION_CONFLICT without event`() {
        val store = RecordingCaseStore(case())
        val provider = VerifyingProvider(AdminOperationSourceType.NOTIFICATION, AdminOperationSignalVerification.ABSENT)
        val metrics = RecordingMetrics()
        val service = service(store = store, providers = listOf(provider), metrics = metrics)

        assertError(AdminOperationError.CASE_VERSION_CONFLICT) {
            service.resolve(operator, AdminOperationMutationCommand(CASE_ID, expectedVersion = 3))
        }

        assertThat(provider.verifications).isEmpty()
        assertThat(store.transitions).isEmpty()
        assertThat(store.events).isEmpty()
        assertThat(metrics.lifecycle).containsExactly(
            AdminOperationAction.RESOLVE to AdminOperationLifecycleResult.VERSION_CONFLICT,
        )
    }

    @Test
    fun `list returns durable last successful time when one provider is unavailable`() {
        val previousSuccess = NOW.minusHours(2)
        val store =
            RecordingCaseStore(
                case(),
                freshness =
                    listOf(
                        freshness(
                            status = AdminOperationSourceStatus.AVAILABLE,
                            generatedAt = previousSuccess,
                            lastSuccessfulAt = previousSuccess,
                        ),
                    ),
            )
        val provider =
            VerifyingProvider(
                sourceType = AdminOperationSourceType.NOTIFICATION,
                verification = AdminOperationSignalVerification.UNAVAILABLE,
                collectionFailure = IllegalStateException("opaque-provider-failure"),
            )
        val service = service(store = store, providers = listOf(provider))

        val result = service.list(owner, AdminOperationCaseFilter(), PAGE)

        val source = result.sources.single()
        assertThat(source.status).isEqualTo(AdminOperationSourceStatus.UNAVAILABLE)
        assertThat(source.lastSuccessfulAt).isEqualTo(previousSuccess)
        assertThat(result.cases.items).hasSize(1)
    }

    @Test
    fun `list passes authenticated admin id for exact ME filtering`() {
        val store = RecordingCaseStore(case(), freshness = listOf(freshness()))
        val service = service(store = store)
        val filter = AdminOperationCaseFilter(assignee = AdminOperationAssigneeFilter.ME)

        service.list(operator, filter, PAGE)

        assertThat(store.listRequests).containsExactly(Triple(filter, PAGE, operator.userId))
    }

    @Test
    fun `resolved request is idempotent only at the current version`() {
        val resolved =
            case(
                state = AdminOperationCaseState.RESOLVED,
                resolvedAt = NOW.minusMinutes(3),
            )
        val store = RecordingCaseStore(resolved)
        val provider = VerifyingProvider(AdminOperationSourceType.NOTIFICATION, AdminOperationSignalVerification.ABSENT)
        val service = service(store = store, providers = listOf(provider))

        assertThat(service.resolve(operator, AdminOperationMutationCommand(CASE_ID, 4))).isEqualTo(resolved)
        assertError(AdminOperationError.CASE_VERSION_CONFLICT) {
            service.resolve(operator, AdminOperationMutationCommand(CASE_ID, 3))
        }
        assertThat(provider.verifications).isEmpty()
        assertThat(store.transitions).isEmpty()
        assertThat(store.events).isEmpty()
    }

    @Test
    fun `provider exception maps to content free source unavailable error`() {
        val rawProviderDetail = "opaque-private-provider-detail"
        val store = RecordingCaseStore(case())
        val metrics = RecordingMetrics()
        val provider =
            VerifyingProvider(
                sourceType = AdminOperationSourceType.NOTIFICATION,
                verification = AdminOperationSignalVerification.ABSENT,
                verificationFailure = IllegalStateException(rawProviderDetail),
            )
        val service = service(store = store, providers = listOf(provider), metrics = metrics)

        val exception =
            runCatching { service.resolve(operator, AdminOperationMutationCommand(CASE_ID, 4)) }
                .exceptionOrNull()

        assertThat(exception).isInstanceOf(AdminOperationException::class.java)
        assertThat((exception as AdminOperationException).error).isEqualTo(AdminOperationError.CASE_SOURCE_UNAVAILABLE)
        assertThat(exception.toString()).doesNotContain(rawProviderDetail)
        assertThat(metrics.toString()).doesNotContain(rawProviderDetail)
        assertThat(store.transitions).isEmpty()
    }

    private fun service(
        store: RecordingCaseStore,
        providers: List<AdminOperationSignalProvider> = emptyList(),
        metrics: AdminOperationMetricsPort = RecordingMetrics(),
    ): AdminOperationCaseService {
        val reconciliation =
            AdminOperationReconciliationService(
                providers = providers,
                cases = store,
                clock = CLOCK,
                metrics = metrics,
            )
        return AdminOperationCaseService(
            reconciliation = reconciliation,
            providers = providers,
            caseReader = store,
            caseWriter = store,
            clock = CLOCK,
            metrics = metrics,
        )
    }

    private fun availableProvider(sourceType: AdminOperationSourceType): AdminOperationSignalProvider =
        VerifyingProvider(
            sourceType = sourceType,
            verification = AdminOperationSignalVerification.ABSENT,
            batch =
                AdminOperationSignalBatch(
                    sourceType = sourceType,
                    status = AdminOperationSourceStatus.AVAILABLE,
                    generatedAt = NOW,
                    authoritative = true,
                    signals = emptyList(),
                ),
        )

    private fun assertError(
        expected: AdminOperationError,
        block: () -> Unit,
    ) {
        assertThatThrownBy(block)
            .isInstanceOfSatisfying(AdminOperationException::class.java) { exception ->
                assertThat(exception.error).isEqualTo(expected)
            }
    }

    private companion object {
        val NOW: OffsetDateTime = OffsetDateTime.parse("2026-08-04T12:00:00Z")
        val CLOCK: Clock = Clock.fixed(NOW.toInstant(), ZoneOffset.UTC)
        val CASE_ID: UUID = UUID.fromString("50000000-0000-0000-0000-000000000001")
        val CLUB_ID: UUID = UUID.fromString("50000000-0000-0000-0000-000000000002")
        val OWNER_ID: UUID = UUID.fromString("50000000-0000-0000-0000-000000000003")
        val OPERATOR_ID: UUID = UUID.fromString("50000000-0000-0000-0000-000000000004")
        val SUPPORT_ID: UUID = UUID.fromString("50000000-0000-0000-0000-000000000005")
        const val SOURCE_KEY = "NOTIFICATION:PLATFORM_BACKLOG"
        val PAGE = PageRequest(limit = 20, cursor = emptyMap())
        val COUNTS = AdminOperationCaseCounts(open = 1, critical = 1, assignedToMe = 0, snoozed = 0)
        val owner = CurrentPlatformAdmin(OWNER_ID, "owner@example.test", PlatformAdminRole.OWNER)
        val operator = CurrentPlatformAdmin(OPERATOR_ID, "operator@example.test", PlatformAdminRole.OPERATOR)
        val support = CurrentPlatformAdmin(SUPPORT_ID, "support@example.test", PlatformAdminRole.SUPPORT)
    }
}

private fun case(
    sourceType: AdminOperationSourceType = AdminOperationSourceType.NOTIFICATION,
    state: AdminOperationCaseState = AdminOperationCaseState.OPEN,
    resolvedAt: OffsetDateTime? = null,
): AdminOperationCase =
    AdminOperationCase(
        id = UUID.fromString("50000000-0000-0000-0000-000000000001"),
        sourceType = sourceType,
        sourceKey = "NOTIFICATION:PLATFORM_BACKLOG",
        clubId = UUID.fromString("50000000-0000-0000-0000-000000000002"),
        state = state,
        severity = AdminOperationSeverity.CRITICAL,
        summaryCode = "NOTIFICATION_PLATFORM_BACKLOG",
        firstObservedAt = OffsetDateTime.parse("2026-08-04T08:00:00Z"),
        lastObservedAt = OffsetDateTime.parse("2026-08-04T11:00:00Z"),
        snoozedUntil = null,
        assigneeAdminId = null,
        resolvedAt = resolvedAt,
        reopenCount = 0,
        version = 4,
        impactCount = 3,
        detailHref = "/admin/notifications?focus=outbox_backlog",
    )

private fun freshness(
    status: AdminOperationSourceStatus = AdminOperationSourceStatus.AVAILABLE,
    generatedAt: OffsetDateTime = OffsetDateTime.parse("2026-08-04T12:00:00Z"),
    lastSuccessfulAt: OffsetDateTime? = generatedAt,
): AdminOperationSourceFreshness =
    AdminOperationSourceFreshness(
        sourceType = AdminOperationSourceType.NOTIFICATION,
        status = status,
        generatedAt = generatedAt,
        lastSuccessfulAt = lastSuccessfulAt,
        authoritative = status == AdminOperationSourceStatus.AVAILABLE,
    )

private class RecordingCaseStore(
    initialCase: AdminOperationCase,
    freshness: List<AdminOperationSourceFreshness> = emptyList(),
) : LoadAdminOperationCasesPort,
    WriteAdminOperationCasesPort {
    private val cases = linkedMapOf(initialCase.id to initialCase)
    private val sourceFreshness = freshness.associateByTo(mutableMapOf()) { it.sourceType }
    val calls = mutableListOf<String>()
    val listRequests = mutableListOf<Triple<AdminOperationCaseFilter, PageRequest, UUID>>()
    val transitions = mutableListOf<AdminOperationTransitionCommand>()
    val events = mutableListOf<AdminOperationCaseEvent>()

    override fun list(
        filter: AdminOperationCaseFilter,
        page: PageRequest,
        adminId: UUID,
    ): CursorPage<AdminOperationCase> {
        calls += "list:$adminId"
        listRequests += Triple(filter, page, adminId)
        return CursorPage(cases.values.toList(), null)
    }

    override fun counts(adminId: UUID): AdminOperationCaseCounts {
        calls += "counts:$adminId"
        return AdminOperationCaseCounts(open = 1, critical = 1, assignedToMe = 0, snoozed = 0)
    }

    override fun get(caseId: UUID): AdminOperationCase? = cases[caseId]

    override fun history(
        caseId: UUID,
        limit: Int,
    ): List<AdminOperationCaseEvent> = events.filter { it.caseId == caseId }.take(limit)

    override fun sourceFreshness(): List<AdminOperationSourceFreshness> =
        sourceFreshness.values
            .sortedBy { it.sourceType.ordinal }

    override fun reconcile(
        batch: AdminOperationSignalBatch,
        now: OffsetDateTime,
    ): List<AdminOperationCase> {
        calls += "reconcile:${batch.sourceType}"
        return emptyList()
    }

    override fun recordSourceFreshness(freshness: AdminOperationSourceFreshness) {
        calls += "freshness:${freshness.sourceType}"
        val previous = sourceFreshness[freshness.sourceType]
        sourceFreshness[freshness.sourceType] =
            freshness.copy(
                lastSuccessfulAt = listOfNotNull(previous?.lastSuccessfulAt, freshness.lastSuccessfulAt).maxOrNull(),
            )
    }

    override fun transition(command: AdminOperationTransitionCommand): AdminOperationCaseUpdateResult {
        transitions += command
        val current = cases[command.caseId]
        return when {
            current == null -> AdminOperationCaseUpdateResult.NotFound
            current.version != command.expectedVersion -> AdminOperationCaseUpdateResult.VersionConflict
            else -> transitionCurrent(current, command)
        }
    }

    private fun transitionCurrent(
        current: AdminOperationCase,
        command: AdminOperationTransitionCommand,
    ): AdminOperationCaseUpdateResult {
        val targetState =
            when (command.action) {
                AdminOperationAction.ACKNOWLEDGE -> AdminOperationCaseState.ACKNOWLEDGED
                AdminOperationAction.SNOOZE -> AdminOperationCaseState.SNOOZED
                AdminOperationAction.RESOLVE -> AdminOperationCaseState.RESOLVED
            }
        val updated =
            current.copy(
                state = targetState,
                snoozedUntil = command.snoozedUntil,
                assigneeAdminId =
                    if (command.action == AdminOperationAction.ACKNOWLEDGE) {
                        current.assigneeAdminId ?: command.actorAdminId
                    } else {
                        current.assigneeAdminId
                    },
                resolvedAt = command.now.takeIf { command.action == AdminOperationAction.RESOLVE },
                version = current.version + 1,
            )
        cases[command.caseId] = updated
        events +=
            AdminOperationCaseEvent(
                id = UUID.randomUUID(),
                caseId = current.id,
                fromState = current.state,
                toState = targetState,
                action = command.action,
                actorAdminId = command.actorAdminId,
                reasonCode = command.reasonCode,
                occurredAt = command.now,
                caseVersion = updated.version,
            )
        return AdminOperationCaseUpdateResult.Updated(updated)
    }
}

private class VerifyingProvider(
    override val sourceType: AdminOperationSourceType,
    private val verification: AdminOperationSignalVerification,
    private val batch: AdminOperationSignalBatch? = null,
    private val collectionFailure: RuntimeException? = null,
    private val verificationFailure: RuntimeException? = null,
) : AdminOperationSignalProvider {
    val verifications = mutableListOf<Pair<CurrentPlatformAdmin, String>>()

    override fun collect(admin: CurrentPlatformAdmin): AdminOperationSignalBatch {
        collectionFailure?.let { throw it }
        return requireNotNull(batch)
    }

    override fun verify(
        admin: CurrentPlatformAdmin,
        sourceKey: String,
    ): AdminOperationSignalVerification {
        verifications += admin to sourceKey
        verificationFailure?.let { throw it }
        return verification
    }
}

private class RecordingMetrics : AdminOperationMetricsPort {
    val lifecycle = mutableListOf<Pair<AdminOperationAction, AdminOperationLifecycleResult>>()
    val caseAges = mutableListOf<Triple<AdminOperationSourceType, AdminOperationSeverity, Long>>()

    override fun recordReconciliation(
        source: AdminOperationSourceType,
        status: AdminOperationSourceStatus,
    ) = Unit

    override fun recordLifecycle(
        action: AdminOperationAction,
        result: AdminOperationLifecycleResult,
    ) {
        lifecycle += action to result
    }

    override fun recordCaseAge(
        source: AdminOperationSourceType,
        severity: AdminOperationSeverity,
        seconds: Long,
    ) {
        caseAges += Triple(source, severity, seconds)
    }

    override fun toString(): String = "RecordingMetrics(lifecycle=$lifecycle)"
}
