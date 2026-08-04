package com.readmates.admin.operations.adapter.out.persistence

import com.readmates.admin.operations.application.model.AdminOperationAction
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
import com.readmates.shared.paging.PageRequest
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.jdbc.Sql
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

private const val EQUAL_TIME_ACTOR_ID = "00000000-0000-0000-0000-00000000a201"
private const val EQUAL_TIME_CLEANUP_SQL = """
    delete from admin_operation_case_events;
    delete from admin_operation_cases;
    delete from admin_operation_source_status;
    delete from platform_admins where user_id = '$EQUAL_TIME_ACTOR_ID';
    delete from users where id = '$EQUAL_TIME_ACTOR_ID';
"""

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Sql(statements = [EQUAL_TIME_CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [EQUAL_TIME_CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class JdbcAdminOperationEqualTimeReconciliationTest(
    @param:Autowired private val adapter: JdbcAdminOperationCaseAdapter,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `equal-time authoritative omission does not resolve an active observation`() {
        val observedAt = instant(hour = 5)
        val opened = adapter.reconcile(batch(signal(observedAt = observedAt)), observedAt).single()

        adapter.reconcile(
            batch(generatedAt = observedAt, authoritative = true),
            observedAt.plusHours(1),
        )

        assertThat(adapter.get(opened.id)?.state).isEqualTo(AdminOperationCaseState.OPEN)
        assertThat(adapter.get(opened.id)?.lastObservedAt).isEqualTo(observedAt)
        assertThat(adapter.history(opened.id, 10).map { it.reasonCode }).containsExactly("SIGNAL_OPENED")
    }

    @Test
    fun `equal-time freshness conflicts converge conservatively in both arrival orders`() {
        val attemptedAt = instant(hour = 8)
        val earlierSuccess = attemptedAt.minusHours(1)
        val laterSuccess = attemptedAt

        recordEqualFreshnessConflict(
            sourceType = AdminOperationSourceType.NOTIFICATION,
            attemptedAt = attemptedAt,
            earlierSuccess = earlierSuccess,
            laterSuccess = laterSuccess,
            unavailableFirst = false,
        )
        recordEqualFreshnessConflict(
            sourceType = AdminOperationSourceType.AI_JOB,
            attemptedAt = attemptedAt,
            earlierSuccess = earlierSuccess,
            laterSuccess = laterSuccess,
            unavailableFirst = true,
        )

        val freshness = adapter.sourceFreshness().associateBy { it.sourceType }
        listOf(AdminOperationSourceType.NOTIFICATION, AdminOperationSourceType.AI_JOB).forEach { sourceType ->
            assertThat(freshness.getValue(sourceType).status).isEqualTo(AdminOperationSourceStatus.UNAVAILABLE)
            assertThat(freshness.getValue(sourceType).generatedAt).isEqualTo(attemptedAt)
            assertThat(freshness.getValue(sourceType).lastSuccessfulAt).isEqualTo(laterSuccess)
            assertThat(freshness.getValue(sourceType).authoritative).isFalse()
        }
    }

    @Test
    fun `equal-time case projections converge by stable comparator in both arrival orders`() {
        val observedAt = instant(hour = 10)
        assertEqualObservationOrdersConverge(
            prefix = "severity",
            preferred =
                signal(
                    severity = AdminOperationSeverity.CRITICAL,
                    impactCount = 1,
                    summaryCode = "Z_SUMMARY",
                    detailHref = "/admin/notifications/z",
                    observedAt = observedAt,
                ),
            other =
                signal(
                    severity = AdminOperationSeverity.WARNING,
                    impactCount = 99,
                    summaryCode = "A_SUMMARY",
                    detailHref = "/admin/notifications/a",
                    observedAt = observedAt,
                ),
        )
        assertEqualObservationOrdersConverge(
            prefix = "impact",
            preferred =
                signal(
                    severity = AdminOperationSeverity.WARNING,
                    impactCount = 10,
                    summaryCode = "Z_SUMMARY",
                    detailHref = "/admin/notifications/z",
                    observedAt = observedAt,
                ),
            other =
                signal(
                    severity = AdminOperationSeverity.WARNING,
                    impactCount = 2,
                    summaryCode = "A_SUMMARY",
                    detailHref = "/admin/notifications/a",
                    observedAt = observedAt,
                ),
        )
        assertEqualObservationOrdersConverge(
            prefix = "stable",
            preferred =
                signal(
                    severity = AdminOperationSeverity.WARNING,
                    impactCount = 5,
                    summaryCode = "SAME_SUMMARY",
                    detailHref = "/admin/notifications/a",
                    observedAt = observedAt,
                ),
            other =
                signal(
                    severity = AdminOperationSeverity.WARNING,
                    impactCount = 5,
                    summaryCode = "SAME_SUMMARY",
                    detailHref = "/admin/notifications/z",
                    observedAt = observedAt,
                ),
        )
    }

    @Test
    fun `equal-time observation does not reopen a resolved case or append an event`() {
        seedActor()
        val observedAt = instant(hour = 10)
        val opened = adapter.reconcile(batch(signal(observedAt = observedAt)), observedAt).single()
        val resolved =
            adapter.transition(
                AdminOperationTransitionCommand(
                    caseId = opened.id,
                    expectedVersion = opened.version,
                    action = AdminOperationAction.RESOLVE,
                    actorAdminId = UUID.fromString(EQUAL_TIME_ACTOR_ID),
                    snoozedUntil = null,
                    reasonCode = "OPERATOR_RESOLVED",
                    now = observedAt.plusMinutes(1),
                ),
            ) as AdminOperationCaseUpdateResult.Updated

        adapter.reconcile(
            batch(
                signal(
                    severity = AdminOperationSeverity.CRITICAL,
                    impactCount = 9,
                    observedAt = observedAt,
                ),
                generatedAt = observedAt,
            ),
            observedAt.plusMinutes(2),
        )

        val persisted = requireNotNull(adapter.get(opened.id))
        assertThat(persisted.state).isEqualTo(AdminOperationCaseState.RESOLVED)
        assertThat(persisted.reopenCount).isZero()
        assertThat(persisted.version).isEqualTo(resolved.case.version)
        assertThat(
            jdbcTemplate.queryForObject(
                "select resolution_code from admin_operation_cases where id = ?",
                String::class.java,
                opened.id.toString(),
            ),
        ).isEqualTo("OPERATOR_RESOLVED")
        assertThat(adapter.history(opened.id, 10).map { it.reasonCode })
            .containsExactly("OPERATOR_RESOLVED", "SIGNAL_OPENED")
    }

    private fun recordEqualFreshnessConflict(
        sourceType: AdminOperationSourceType,
        attemptedAt: OffsetDateTime,
        earlierSuccess: OffsetDateTime,
        laterSuccess: OffsetDateTime,
        unavailableFirst: Boolean,
    ) {
        val available =
            AdminOperationSourceFreshness(
                sourceType = sourceType,
                status = AdminOperationSourceStatus.AVAILABLE,
                generatedAt = attemptedAt,
                lastSuccessfulAt = laterSuccess,
                authoritative = true,
            )
        val unavailable =
            AdminOperationSourceFreshness(
                sourceType = sourceType,
                status = AdminOperationSourceStatus.UNAVAILABLE,
                generatedAt = attemptedAt,
                lastSuccessfulAt = earlierSuccess,
                authoritative = false,
            )
        if (unavailableFirst) {
            adapter.recordSourceFreshness(unavailable)
            adapter.recordSourceFreshness(available)
        } else {
            adapter.recordSourceFreshness(available)
            adapter.recordSourceFreshness(unavailable)
        }
    }

    private fun assertEqualObservationOrdersConverge(
        prefix: String,
        preferred: AdminOperationSignal,
        other: AdminOperationSignal,
    ) {
        listOf(
            "preferred-first" to listOf(preferred, other),
            "preferred-last" to listOf(other, preferred),
        ).forEach { (suffix, orderedSignals) ->
            val sourceKey = "$prefix-$suffix"
            orderedSignals.forEach { projection ->
                adapter.reconcile(
                    batch(projection.copy(sourceKey = sourceKey), generatedAt = projection.observedAt),
                    projection.observedAt,
                )
            }
            val persisted =
                adapter
                    .list(
                        AdminOperationCaseFilter(),
                        PageRequest(20, emptyMap()),
                        UUID.fromString(EQUAL_TIME_ACTOR_ID),
                    ).items
                    .single { it.sourceKey == sourceKey }
            assertThat(persisted.severity).isEqualTo(preferred.severity)
            assertThat(persisted.impactCount).isEqualTo(preferred.impactCount)
            assertThat(persisted.summaryCode).isEqualTo(preferred.summaryCode)
            assertThat(persisted.detailHref).isEqualTo(preferred.detailHref)
            assertThat(persisted.version).isZero()
            assertThat(adapter.history(persisted.id, 10).map { it.reasonCode }).containsExactly("SIGNAL_OPENED")
        }
    }

    private fun seedActor() {
        jdbcTemplate.update(
            """
            insert into users (id, email, name, short_name, auth_provider)
            values (?, 'equal-time-admin@example.invalid', 'Operation Actor', 'Actor', 'GOOGLE')
            """.trimIndent(),
            EQUAL_TIME_ACTOR_ID,
        )
    }

    private fun batch(
        vararg signals: AdminOperationSignal,
        status: AdminOperationSourceStatus = AdminOperationSourceStatus.AVAILABLE,
        generatedAt: OffsetDateTime = signals.maxOfOrNull { it.observedAt } ?: instant(),
        authoritative: Boolean = true,
    ) = AdminOperationSignalBatch(
        sourceType = AdminOperationSourceType.NOTIFICATION,
        status = status,
        generatedAt = generatedAt,
        authoritative = authoritative,
        signals = signals.toList(),
    )

    private fun signal(
        sourceKey: String = "delivery-backlog:test",
        severity: AdminOperationSeverity = AdminOperationSeverity.WARNING,
        impactCount: Int = 2,
        summaryCode: String = "NOTIFICATION_DELIVERY_BACKLOG",
        detailHref: String = "/admin/notifications",
        observedAt: OffsetDateTime = instant(),
    ) = AdminOperationSignal(
        sourceType = AdminOperationSourceType.NOTIFICATION,
        sourceKey = sourceKey,
        clubId = null,
        severity = severity,
        summaryCode = summaryCode,
        impactCount = impactCount,
        detailHref = detailHref,
        observedAt = observedAt,
    )

    private fun instant(hour: Int = 0): OffsetDateTime = OffsetDateTime.of(2026, 8, 4, hour, 0, 0, 0, ZoneOffset.UTC)
}
