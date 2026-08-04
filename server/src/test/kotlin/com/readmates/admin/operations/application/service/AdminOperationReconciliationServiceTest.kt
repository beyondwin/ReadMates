package com.readmates.admin.operations.application.service

import com.readmates.admin.operations.application.model.AdminOperationAction
import com.readmates.admin.operations.application.model.AdminOperationCase
import com.readmates.admin.operations.application.model.AdminOperationSeverity
import com.readmates.admin.operations.application.model.AdminOperationSignal
import com.readmates.admin.operations.application.model.AdminOperationSignalBatch
import com.readmates.admin.operations.application.model.AdminOperationSourceFreshness
import com.readmates.admin.operations.application.model.AdminOperationSourceStatus
import com.readmates.admin.operations.application.model.AdminOperationSourceType
import com.readmates.admin.operations.application.model.AdminOperationTransitionCommand
import com.readmates.admin.operations.application.port.out.AdminOperationCaseUpdateResult
import com.readmates.admin.operations.application.port.out.AdminOperationLifecycleResult
import com.readmates.admin.operations.application.port.out.AdminOperationMetricsPort
import com.readmates.admin.operations.application.port.out.AdminOperationSignalProvider
import com.readmates.admin.operations.application.port.out.AdminOperationSignalVerification
import com.readmates.admin.operations.application.port.out.WriteAdminOperationCasesPort
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.security.CurrentPlatformAdmin
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.EnumSource
import java.time.Clock
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

class AdminOperationReconciliationServiceTest {
    private val now = OffsetDateTime.parse("2026-08-04T10:30:00Z")
    private val clock = Clock.fixed(now.toInstant(), ZoneOffset.UTC)
    private val admin =
        CurrentPlatformAdmin(
            userId = UUID.fromString("10000000-0000-0000-0000-000000000001"),
            email = "admin-operation-actor@example.invalid",
            role = PlatformAdminRole.OPERATOR,
        )

    @Test
    fun `one provider failure preserves successful source cases and reports unavailable freshness`() {
        val previousSuccess = now.minusHours(2)
        val writer =
            RecordingWriter(
                initialFreshness =
                    listOf(
                        freshness(
                            source = AdminOperationSourceType.AI_JOB,
                            status = AdminOperationSourceStatus.AVAILABLE,
                            generatedAt = previousSuccess,
                            lastSuccessfulAt = previousSuccess,
                            authoritative = true,
                        ),
                    ),
            )
        val rawErrorSentinel = "provider-private-error-must-not-escape"
        val failed =
            StubProvider(
                sourceType = AdminOperationSourceType.AI_JOB,
                failure = IllegalStateException(rawErrorSentinel),
            )
        val successful =
            StubProvider(
                sourceType = AdminOperationSourceType.NOTIFICATION,
                batch =
                    batch(
                        source = AdminOperationSourceType.NOTIFICATION,
                        signals = listOf(signal(AdminOperationSourceType.NOTIFICATION)),
                    ),
            )
        val metrics = RecordingMetrics()
        val service = service(listOf(successful, failed), writer, metrics)

        val result = service.reconcile(admin)

        assertThat(result.sources.map { it.sourceType to it.status }).containsExactly(
            AdminOperationSourceType.AI_JOB to AdminOperationSourceStatus.UNAVAILABLE,
            AdminOperationSourceType.NOTIFICATION to AdminOperationSourceStatus.AVAILABLE,
        )
        assertThat(writer.reconciled.map { it.sourceType }).containsExactly(AdminOperationSourceType.NOTIFICATION)
        assertThat(writer.activeKeys.getValue(AdminOperationSourceType.NOTIFICATION))
            .containsExactly("NOTIFICATION:PLATFORM_BACKLOG")
        assertThat(writer.freshnessBySource.getValue(AdminOperationSourceType.AI_JOB).lastSuccessfulAt)
            .isEqualTo(previousSuccess)
        assertThat(metrics.reconciliations).containsExactly(
            AdminOperationSourceType.AI_JOB to AdminOperationSourceStatus.UNAVAILABLE,
            AdminOperationSourceType.NOTIFICATION to AdminOperationSourceStatus.AVAILABLE,
        )
        assertThat(result.toString()).doesNotContain(rawErrorSentinel)
        assertThat(metrics.toString()).doesNotContain(rawErrorSentinel)
    }

    @Test
    fun `disabled AI is reported without persistence reconcile`() {
        val writer = RecordingWriter()
        val metrics = RecordingMetrics()
        val service =
            service(
                providers =
                    listOf(
                        StubProvider(
                            sourceType = AdminOperationSourceType.AI_JOB,
                            batch =
                                batch(
                                    source = AdminOperationSourceType.AI_JOB,
                                    status = AdminOperationSourceStatus.DISABLED,
                                    authoritative = false,
                                ),
                        ),
                    ),
                writer = writer,
                metrics = metrics,
            )

        val result = service.reconcile(admin)

        assertThat(result.sources).containsExactly(
            freshness(
                source = AdminOperationSourceType.AI_JOB,
                status = AdminOperationSourceStatus.DISABLED,
                generatedAt = now,
                lastSuccessfulAt = null,
                authoritative = false,
            ),
        )
        assertThat(writer.reconciled).isEmpty()
        assertThat(writer.freshnessBySource.getValue(AdminOperationSourceType.AI_JOB).status)
            .isEqualTo(AdminOperationSourceStatus.DISABLED)
        assertThat(metrics.reconciliations).containsExactly(
            AdminOperationSourceType.AI_JOB to AdminOperationSourceStatus.DISABLED,
        )
    }

    @Test
    fun `duplicate identities inside one batch fail closed instead of last-write-wins`() {
        val writer = RecordingWriter()
        val duplicate = signal(AdminOperationSourceType.CLUB_READINESS)
        val service =
            service(
                providers =
                    listOf(
                        StubProvider(
                            sourceType = AdminOperationSourceType.CLUB_READINESS,
                            batch =
                                batch(
                                    source = AdminOperationSourceType.CLUB_READINESS,
                                    signals = listOf(duplicate, duplicate.copy(impactCount = 7)),
                                ),
                        ),
                    ),
                writer = writer,
            )

        val result = service.reconcile(admin)

        assertThat(result.sources.single().status).isEqualTo(AdminOperationSourceStatus.UNAVAILABLE)
        assertThat(writer.reconciled).isEmpty()
        assertThat(writer.freshnessBySource.getValue(AdminOperationSourceType.CLUB_READINESS).status)
            .isEqualTo(AdminOperationSourceStatus.UNAVAILABLE)
    }

    @Test
    fun `authoritative empty batch can resolve source cases but partial empty batch cannot`() {
        val writer = RecordingWriter()
        writer.activeKeys[AdminOperationSourceType.CLUB_READINESS] = linkedSetOf("CLUB_READINESS:${UUID_1}")
        writer.activeKeys[AdminOperationSourceType.NOTIFICATION] = linkedSetOf("NOTIFICATION:CLUB:${UUID_2}")
        val service =
            service(
                providers =
                    listOf(
                        StubProvider(
                            sourceType = AdminOperationSourceType.NOTIFICATION,
                            batch =
                                batch(
                                    source = AdminOperationSourceType.NOTIFICATION,
                                    status = AdminOperationSourceStatus.PARTIAL,
                                    authoritative = false,
                                ),
                        ),
                        StubProvider(
                            sourceType = AdminOperationSourceType.CLUB_READINESS,
                            batch = batch(source = AdminOperationSourceType.CLUB_READINESS),
                        ),
                    ),
                writer = writer,
            )

        service.reconcile(admin)

        assertThat(writer.activeKeys.getValue(AdminOperationSourceType.CLUB_READINESS)).isEmpty()
        assertThat(writer.activeKeys.getValue(AdminOperationSourceType.NOTIFICATION))
            .containsExactly("NOTIFICATION:CLUB:${UUID_2}")
    }

    @Test
    fun `providers run in deterministic source order for stable evidence`() {
        val collected = mutableListOf<AdminOperationSourceType>()
        val providers =
            AdminOperationSourceType.entries
                .reversed()
                .map { source ->
                    StubProvider(
                        sourceType = source,
                        batch = batch(source = source),
                        onCollect = { collected += source },
                    )
                }
        val service = service(providers, RecordingWriter())

        val result = service.reconcile(admin)

        val expected = AdminOperationSourceType.entries.sortedBy { it.name }
        assertThat(collected).containsExactlyElementsOf(expected)
        assertThat(result.sources.map { it.sourceType }).containsExactlyElementsOf(expected)
        assertThat(providers).allSatisfy { provider -> assertThat(provider.collectedAdmins).containsExactly(admin) }
        assertThat(result.generatedAt).isEqualTo(now)
    }

    @Test
    fun `case reconciliation failure propagates after durable successful source freshness`() {
        val failure = IllegalStateException("case-write-failed")
        val writer = RecordingWriter(reconciliationFailure = failure)
        val metrics = RecordingMetrics()
        val service =
            service(
                providers =
                    listOf(
                        StubProvider(
                            sourceType = AdminOperationSourceType.CLUB_READINESS,
                            batch =
                                batch(
                                    source = AdminOperationSourceType.CLUB_READINESS,
                                    signals = listOf(signal(AdminOperationSourceType.CLUB_READINESS)),
                                ),
                        ),
                    ),
                writer = writer,
                metrics = metrics,
            )

        assertThatThrownBy { service.reconcile(admin) }.isSameAs(failure)

        assertThat(writer.persistenceEvents).containsExactly("freshness:CLUB_READINESS", "reconcile:CLUB_READINESS")
        assertThat(writer.freshnessBySource.getValue(AdminOperationSourceType.CLUB_READINESS)).isEqualTo(
            freshness(
                source = AdminOperationSourceType.CLUB_READINESS,
                status = AdminOperationSourceStatus.AVAILABLE,
                generatedAt = now,
                lastSuccessfulAt = now,
                authoritative = true,
            ),
        )
        assertThat(metrics.reconciliations).isEmpty()
    }

    @Test
    fun `freshness write failure propagates before case reconciliation`() {
        val failure = IllegalStateException("freshness-write-failed")
        val writer = RecordingWriter(freshnessFailure = failure)
        val metrics = RecordingMetrics()
        val service =
            service(
                providers =
                    listOf(
                        StubProvider(
                            sourceType = AdminOperationSourceType.CLUB_READINESS,
                            batch = batch(source = AdminOperationSourceType.CLUB_READINESS),
                        ),
                    ),
                writer = writer,
                metrics = metrics,
            )

        assertThatThrownBy { service.reconcile(admin) }.isSameAs(failure)

        assertThat(writer.persistenceEvents).containsExactly("freshness:CLUB_READINESS")
        assertThat(writer.reconciled).isEmpty()
        assertThat(writer.freshnessBySource).isEmpty()
        assertThat(metrics.reconciliations).isEmpty()
    }

    @ParameterizedTest(name = "{0}")
    @EnumSource(InvalidBatchKind::class)
    fun `invalid or unsafe signal batches fail closed before case persistence`(kind: InvalidBatchKind) {
        val invalid = invalidBatch(kind)
        val writer = RecordingWriter()
        val service =
            service(
                listOf(StubProvider(AdminOperationSourceType.CLUB_READINESS, batch = invalid)),
                writer,
            )

        val result = service.reconcile(admin)

        assertThat(result.sources.single().status).isEqualTo(AdminOperationSourceStatus.UNAVAILABLE)
        assertThat(writer.reconciled).describedAs("invalid batch kind: $kind").isEmpty()
        assertThat(writer.freshnessBySource.getValue(AdminOperationSourceType.CLUB_READINESS).status)
            .isEqualTo(AdminOperationSourceStatus.UNAVAILABLE)
    }

    private fun service(
        providers: List<AdminOperationSignalProvider>,
        writer: WriteAdminOperationCasesPort,
        metrics: AdminOperationMetricsPort = RecordingMetrics(),
    ): AdminOperationReconciliationService =
        AdminOperationReconciliationService(
            providers = providers,
            cases = writer,
            clock = clock,
            metrics = metrics,
        )

    private fun signal(source: AdminOperationSourceType): AdminOperationSignal =
        when (source) {
            AdminOperationSourceType.CLUB_READINESS ->
                AdminOperationSignal(
                    sourceType = source,
                    sourceKey = "CLUB_READINESS:$UUID_1",
                    clubId = UUID.fromString(UUID_1),
                    severity = AdminOperationSeverity.WARNING,
                    summaryCode = "CLUB_SETUP_REQUIRED",
                    impactCount = 1,
                    detailHref = "/admin/clubs/$UUID_1",
                    observedAt = now,
                )
            AdminOperationSourceType.NOTIFICATION ->
                AdminOperationSignal(
                    sourceType = source,
                    sourceKey = "NOTIFICATION:PLATFORM_BACKLOG",
                    clubId = null,
                    severity = AdminOperationSeverity.CRITICAL,
                    summaryCode = "NOTIFICATION_PLATFORM_BACKLOG",
                    impactCount = 2,
                    detailHref = "/admin/notifications?focus=outbox_backlog",
                    observedAt = now,
                )
            AdminOperationSourceType.AI_JOB ->
                AdminOperationSignal(
                    sourceType = source,
                    sourceKey = "AI_JOB:$UUID_1",
                    clubId = UUID.fromString(UUID_2),
                    severity = AdminOperationSeverity.CRITICAL,
                    summaryCode = "AI_JOB_FAILED",
                    impactCount = 1,
                    detailHref = "/admin/ai-ops?clubId=$UUID_2",
                    observedAt = now,
                )
            AdminOperationSourceType.CLOSING_RISK ->
                AdminOperationSignal(
                    sourceType = source,
                    sourceKey = "CLOSING_RISK:$UUID_1",
                    clubId = UUID.fromString(UUID_2),
                    severity = AdminOperationSeverity.WARNING,
                    summaryCode = "SESSION_CLOSING_BLOCKED",
                    impactCount = 1,
                    detailHref = "/clubs/sample-club/app/host/sessions/$UUID_1/closing",
                    observedAt = now,
                )
        }

    private fun batch(
        source: AdminOperationSourceType,
        status: AdminOperationSourceStatus = AdminOperationSourceStatus.AVAILABLE,
        authoritative: Boolean = true,
        signals: List<AdminOperationSignal> = emptyList(),
    ) = AdminOperationSignalBatch(
        sourceType = source,
        status = status,
        generatedAt = now,
        authoritative = authoritative,
        signals = signals,
    )

    private fun invalidBatch(kind: InvalidBatchKind): AdminOperationSignalBatch {
        val valid = signal(AdminOperationSourceType.CLUB_READINESS)
        return when (kind) {
            InvalidBatchKind.BATCH_SOURCE_MISMATCH -> batch(source = AdminOperationSourceType.NOTIFICATION)
            InvalidBatchKind.SIGNAL_SOURCE_MISMATCH ->
                batch(
                    source = AdminOperationSourceType.CLUB_READINESS,
                    signals = listOf(valid.copy(sourceType = AdminOperationSourceType.NOTIFICATION)),
                )
            InvalidBatchKind.BLANK_SOURCE_KEY -> batchWith(valid.copy(sourceKey = " "))
            InvalidBatchKind.INVALID_SOURCE_KEY -> batchWith(valid.copy(sourceKey = "CLUB_READINESS:not-a-uuid"))
            InvalidBatchKind.BLANK_SUMMARY_CODE -> batchWith(valid.copy(summaryCode = " "))
            InvalidBatchKind.INVALID_SUMMARY_CODE -> batchWith(valid.copy(summaryCode = "RAW_PROVIDER_ERROR"))
            InvalidBatchKind.NEGATIVE_IMPACT -> batchWith(valid.copy(impactCount = -1))
            InvalidBatchKind.ABSOLUTE_HREF -> batchWith(valid.copy(detailHref = "https://private.invalid/admin"))
            InvalidBatchKind.PROTOCOL_RELATIVE_HREF -> batchWith(valid.copy(detailHref = "//private.invalid/admin"))
            InvalidBatchKind.TRAVERSAL_HREF -> batchWith(valid.copy(detailHref = "/admin/../private"))
            InvalidBatchKind.NONEMPTY_UNAVAILABLE ->
                batch(
                    source = AdminOperationSourceType.CLUB_READINESS,
                    status = AdminOperationSourceStatus.UNAVAILABLE,
                    authoritative = false,
                    signals = listOf(valid),
                )
            InvalidBatchKind.AUTHORITATIVE_PARTIAL ->
                batch(
                    source = AdminOperationSourceType.CLUB_READINESS,
                    status = AdminOperationSourceStatus.PARTIAL,
                    authoritative = true,
                )
            InvalidBatchKind.NONEMPTY_DISABLED ->
                batch(
                    source = AdminOperationSourceType.CLUB_READINESS,
                    status = AdminOperationSourceStatus.DISABLED,
                    authoritative = false,
                    signals = listOf(valid),
                )
        }
    }

    private fun batchWith(signal: AdminOperationSignal): AdminOperationSignalBatch =
        batch(
            source = AdminOperationSourceType.CLUB_READINESS,
            signals = listOf(signal),
        )

    private fun freshness(
        source: AdminOperationSourceType,
        status: AdminOperationSourceStatus,
        generatedAt: OffsetDateTime,
        lastSuccessfulAt: OffsetDateTime?,
        authoritative: Boolean,
    ) = AdminOperationSourceFreshness(
        sourceType = source,
        status = status,
        generatedAt = generatedAt,
        lastSuccessfulAt = lastSuccessfulAt,
        authoritative = authoritative,
    )

    private class StubProvider(
        override val sourceType: AdminOperationSourceType,
        private val batch: AdminOperationSignalBatch? = null,
        private val failure: RuntimeException? = null,
        private val onCollect: () -> Unit = {},
    ) : AdminOperationSignalProvider {
        val collectedAdmins = mutableListOf<CurrentPlatformAdmin>()

        override fun collect(admin: CurrentPlatformAdmin): AdminOperationSignalBatch {
            collectedAdmins += admin
            onCollect()
            failure?.let { throw it }
            return requireNotNull(batch)
        }

        override fun verify(
            admin: CurrentPlatformAdmin,
            sourceKey: String,
        ) = AdminOperationSignalVerification.UNAVAILABLE
    }

    private class RecordingWriter(
        initialFreshness: List<AdminOperationSourceFreshness> = emptyList(),
        private val reconciliationFailure: RuntimeException? = null,
        private val freshnessFailure: RuntimeException? = null,
    ) : WriteAdminOperationCasesPort {
        val reconciled = mutableListOf<AdminOperationSignalBatch>()
        val activeKeys = mutableMapOf<AdminOperationSourceType, LinkedHashSet<String>>()
        val freshnessBySource = initialFreshness.associateByTo(mutableMapOf()) { it.sourceType }
        val persistenceEvents = mutableListOf<String>()

        override fun reconcile(
            batch: AdminOperationSignalBatch,
            now: OffsetDateTime,
        ): List<AdminOperationCase> {
            persistenceEvents += "reconcile:${batch.sourceType}"
            reconciled += batch
            reconciliationFailure?.let { throw it }
            val keys = activeKeys.getOrPut(batch.sourceType) { linkedSetOf() }
            keys += batch.signals.map { it.sourceKey }
            if (batch.status == AdminOperationSourceStatus.AVAILABLE && batch.authoritative) {
                keys.retainAll(batch.signals.map { it.sourceKey }.toSet())
            }
            return emptyList()
        }

        override fun recordSourceFreshness(freshness: AdminOperationSourceFreshness) {
            persistenceEvents += "freshness:${freshness.sourceType}"
            freshnessFailure?.let { throw it }
            val previous = freshnessBySource[freshness.sourceType]
            freshnessBySource[freshness.sourceType] =
                freshness.copy(
                    lastSuccessfulAt =
                        listOfNotNull(previous?.lastSuccessfulAt, freshness.lastSuccessfulAt).maxOrNull(),
                )
        }

        override fun transition(command: AdminOperationTransitionCommand): AdminOperationCaseUpdateResult {
            error("not used")
        }
    }

    private class RecordingMetrics : AdminOperationMetricsPort {
        val reconciliations = mutableListOf<Pair<AdminOperationSourceType, AdminOperationSourceStatus>>()

        override fun recordReconciliation(
            source: AdminOperationSourceType,
            status: AdminOperationSourceStatus,
        ) {
            reconciliations += source to status
        }

        override fun recordLifecycle(
            action: AdminOperationAction,
            result: AdminOperationLifecycleResult,
        ) = Unit

        override fun recordCaseAge(
            source: AdminOperationSourceType,
            severity: AdminOperationSeverity,
            seconds: Long,
        ) = Unit

        override fun toString(): String = "RecordingMetrics(reconciliations=$reconciliations)"
    }

    private companion object {
        const val UUID_1 = "20000000-0000-0000-0000-000000000001"
        const val UUID_2 = "20000000-0000-0000-0000-000000000002"
    }

    enum class InvalidBatchKind {
        BATCH_SOURCE_MISMATCH,
        SIGNAL_SOURCE_MISMATCH,
        BLANK_SOURCE_KEY,
        INVALID_SOURCE_KEY,
        BLANK_SUMMARY_CODE,
        INVALID_SUMMARY_CODE,
        NEGATIVE_IMPACT,
        ABSOLUTE_HREF,
        PROTOCOL_RELATIVE_HREF,
        TRAVERSAL_HREF,
        NONEMPTY_UNAVAILABLE,
        AUTHORITATIVE_PARTIAL,
        NONEMPTY_DISABLED,
    }
}
