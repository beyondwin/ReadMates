package com.readmates.admin.operations.adapter.out.persistence

import com.readmates.admin.operations.application.model.AdminOperationAction
import com.readmates.admin.operations.application.model.AdminOperationAssigneeFilter
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
import com.readmates.shared.paging.CursorCodec
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
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

private const val ACTOR_ID = "00000000-0000-0000-0000-00000000a201"
private const val OTHER_ACTOR_ID = "00000000-0000-0000-0000-00000000a202"
private const val CLEANUP_SQL = """
    delete from admin_operation_case_events;
    delete from admin_operation_cases;
    delete from admin_operation_source_status;
    delete from platform_admins where user_id = '$ACTOR_ID';
    delete from platform_admins where user_id = '$OTHER_ACTOR_ID';
    delete from users where id = '$ACTOR_ID';
    delete from users where id = '$OTHER_ACTOR_ID';
"""

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Sql(statements = [CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class JdbcAdminOperationCaseAdapterTest(
    @param:Autowired private val adapter: JdbcAdminOperationCaseAdapter,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `upsert keeps one case per source identity without advancing lifecycle version`() {
        val firstObservedAt = instant(hour = 1)
        val first = adapter.reconcile(batch(signal(observedAt = firstObservedAt)), firstObservedAt).single()
        val later = firstObservedAt.plusHours(2)

        val updated =
            adapter
                .reconcile(
                    batch(
                        signal(
                            severity = AdminOperationSeverity.CRITICAL,
                            impactCount = 7,
                            observedAt = later,
                        ),
                        generatedAt = later,
                    ),
                    later,
                ).single()

        assertThat(updated.id).isEqualTo(first.id)
        assertThat(updated.version).isZero()
        assertThat(updated.firstObservedAt).isEqualTo(firstObservedAt)
        assertThat(updated.lastObservedAt).isEqualTo(later)
        assertThat(updated.severity).isEqualTo(AdminOperationSeverity.CRITICAL)
        assertThat(updated.impactCount).isEqualTo(7)
        assertThat(rowCount("admin_operation_cases")).isEqualTo(1)
        assertThat(rowCount("admin_operation_case_events")).isEqualTo(1)
    }

    @Test
    fun `resolved case reopens and increments reopen count`() {
        seedActor()
        val observedAt = instant(hour = 2)
        val opened = adapter.reconcile(batch(signal(observedAt = observedAt)), observedAt).single()
        val resolvedAt = observedAt.plusHours(1)
        val resolved =
            adapter.transition(
                transition(
                    caseId = opened.id,
                    expectedVersion = opened.version,
                    action = AdminOperationAction.RESOLVE,
                    reasonCode = "OPERATOR_RESOLVED",
                    now = resolvedAt,
                ),
            ) as AdminOperationCaseUpdateResult.Updated

        val reopenedAt = resolvedAt.plusHours(1)
        val reopened =
            adapter
                .reconcile(
                    batch(signal(observedAt = reopenedAt), generatedAt = reopenedAt),
                    reopenedAt,
                ).single()

        assertThat(resolved.case.state).isEqualTo(AdminOperationCaseState.RESOLVED)
        assertThat(reopened.id).isEqualTo(opened.id)
        assertThat(reopened.state).isEqualTo(AdminOperationCaseState.OPEN)
        assertThat(reopened.reopenCount).isEqualTo(1)
        assertThat(reopened.version).isEqualTo(2)
        assertThat(adapter.history(opened.id, 10).map { it.reasonCode })
            .containsExactly("SIGNAL_REOPENED", "OPERATOR_RESOLVED", "SIGNAL_OPENED")
    }

    @Test
    fun `expired snoozed case reopens when its signal remains active`() {
        seedActor()
        val observedAt = instant(hour = 3)
        val opened = adapter.reconcile(batch(signal(observedAt = observedAt)), observedAt).single()
        val snoozedAt = observedAt.plusMinutes(5)
        val snoozed =
            adapter.transition(
                transition(
                    caseId = opened.id,
                    expectedVersion = opened.version,
                    action = AdminOperationAction.SNOOZE,
                    snoozedUntil = snoozedAt.plusHours(1),
                    reasonCode = "OPERATOR_SNOOZED",
                    now = snoozedAt,
                ),
            ) as AdminOperationCaseUpdateResult.Updated

        val observedAgainAt = snoozedAt.plusHours(2)
        val reopened =
            adapter
                .reconcile(
                    batch(signal(observedAt = observedAgainAt), generatedAt = observedAgainAt),
                    observedAgainAt,
                ).single()

        assertThat(snoozed.case.state).isEqualTo(AdminOperationCaseState.SNOOZED)
        assertThat(reopened.state).isEqualTo(AdminOperationCaseState.OPEN)
        assertThat(reopened.snoozedUntil).isNull()
        assertThat(reopened.reopenCount).isZero()
        assertThat(reopened.version).isEqualTo(2)
        assertThat(adapter.history(opened.id, 10).first().reasonCode).isEqualTo("SIGNAL_REOPENED")
    }

    @Test
    fun `unavailable source does not resolve an existing case`() {
        val observedAt = instant(hour = 4)
        val opened = adapter.reconcile(batch(signal(observedAt = observedAt)), observedAt).single()

        adapter.reconcile(
            batch(
                status = AdminOperationSourceStatus.UNAVAILABLE,
                authoritative = true,
                generatedAt = observedAt.plusHours(1),
            ),
            observedAt.plusHours(1),
        )

        assertThat(adapter.get(opened.id)?.state).isEqualTo(AdminOperationCaseState.OPEN)
        assertThat(adapter.get(opened.id)?.version).isZero()
        assertThat(adapter.history(opened.id, 10).map { it.reasonCode }).containsExactly("SIGNAL_OPENED")
    }

    @Test
    fun `authoritative available omission resolves an existing case`() {
        val observedAt = instant(hour = 4)
        val opened = adapter.reconcile(batch(signal(observedAt = observedAt)), observedAt).single()
        val clearedAt = observedAt.plusHours(1)

        adapter.reconcile(
            batch(generatedAt = clearedAt, authoritative = true),
            clearedAt,
        )

        assertThat(adapter.get(opened.id)?.state).isEqualTo(AdminOperationCaseState.RESOLVED)
        assertThat(adapter.get(opened.id)?.resolvedAt).isEqualTo(clearedAt)
        assertThat(adapter.history(opened.id, 10).map { it.reasonCode })
            .containsExactly("SIGNAL_CLEARED", "SIGNAL_OPENED")
    }

    @Test
    fun `partial omission does not resolve an existing case`() {
        val observedAt = instant(hour = 4)
        val opened = adapter.reconcile(batch(signal(observedAt = observedAt)), observedAt).single()

        adapter.reconcile(
            batch(
                status = AdminOperationSourceStatus.PARTIAL,
                generatedAt = observedAt.plusHours(1),
                authoritative = true,
            ),
            observedAt.plusHours(1),
        )

        assertThat(adapter.get(opened.id)?.state).isEqualTo(AdminOperationCaseState.OPEN)
        assertThat(adapter.history(opened.id, 10).map { it.reasonCode }).containsExactly("SIGNAL_OPENED")
    }

    @Test
    fun `non-authoritative available omission does not resolve an existing case`() {
        val observedAt = instant(hour = 4)
        val opened = adapter.reconcile(batch(signal(observedAt = observedAt)), observedAt).single()

        adapter.reconcile(
            batch(generatedAt = observedAt.plusHours(1), authoritative = false),
            observedAt.plusHours(1),
        )

        assertThat(adapter.get(opened.id)?.state).isEqualTo(AdminOperationCaseState.OPEN)
        assertThat(adapter.history(opened.id, 10).map { it.reasonCode }).containsExactly("SIGNAL_OPENED")
    }

    @Test
    fun `older authoritative omission does not resolve a newer observation`() {
        val newerObservedAt = instant(hour = 5)
        val opened = adapter.reconcile(batch(signal(observedAt = newerObservedAt)), newerObservedAt).single()

        adapter.reconcile(
            batch(generatedAt = newerObservedAt.minusHours(1), authoritative = true),
            newerObservedAt.plusHours(1),
        )

        assertThat(adapter.get(opened.id)?.state).isEqualTo(AdminOperationCaseState.OPEN)
        assertThat(adapter.get(opened.id)?.lastObservedAt).isEqualTo(newerObservedAt)
        assertThat(adapter.history(opened.id, 10).map { it.reasonCode }).containsExactly("SIGNAL_OPENED")
    }

    @Test
    fun `optimistic transition rejects stale expected version without event`() {
        seedActor()
        val observedAt = instant(hour = 5)
        val opened = adapter.reconcile(batch(signal(observedAt = observedAt)), observedAt).single()
        val acknowledged =
            adapter.transition(
                transition(
                    caseId = opened.id,
                    expectedVersion = opened.version,
                    action = AdminOperationAction.ACKNOWLEDGE,
                    reasonCode = "OPERATOR_ACKNOWLEDGED",
                    now = observedAt.plusMinutes(1),
                ),
            )

        val stale =
            adapter.transition(
                transition(
                    caseId = opened.id,
                    expectedVersion = opened.version,
                    action = AdminOperationAction.RESOLVE,
                    reasonCode = "OPERATOR_RESOLVED",
                    now = observedAt.plusMinutes(2),
                ),
            )

        assertThat(acknowledged).isInstanceOf(AdminOperationCaseUpdateResult.Updated::class.java)
        assertThat(stale).isEqualTo(AdminOperationCaseUpdateResult.VersionConflict)
        assertThat(adapter.get(opened.id)?.state).isEqualTo(AdminOperationCaseState.ACKNOWLEDGED)
        assertThat(rowCount("admin_operation_case_events")).isEqualTo(2)
    }

    @Test
    fun `cursor order is severity then first observed then id`() {
        val early = instant(hour = 6)
        val later = early.plusHours(1)
        val cases =
            adapter.reconcile(
                batch(
                    signal(
                        sourceKey = "warning-later",
                        severity = AdminOperationSeverity.WARNING,
                        observedAt = later,
                    ),
                    signal(
                        sourceKey = "info-early",
                        severity = AdminOperationSeverity.INFO,
                        observedAt = early,
                    ),
                    signal(
                        sourceKey = "critical-later",
                        severity = AdminOperationSeverity.CRITICAL,
                        observedAt = later,
                    ),
                    signal(
                        sourceKey = "warning-early",
                        severity = AdminOperationSeverity.WARNING,
                        observedAt = early,
                    ),
                    generatedAt = later,
                ),
                later,
            )
        assertThat(cases).hasSize(4)

        val firstPage =
            adapter.list(
                AdminOperationCaseFilter(),
                PageRequest(limit = 2, cursor = emptyMap()),
                UUID.fromString(ACTOR_ID),
            )
        val cursor = CursorCodec.decode(firstPage.nextCursor).orEmpty()
        val secondPage =
            adapter.list(
                AdminOperationCaseFilter(),
                PageRequest(limit = 2, cursor = cursor),
                UUID.fromString(ACTOR_ID),
            )

        assertThat(firstPage.items.map { it.sourceKey }).containsExactly("critical-later", "warning-early")
        assertThat(secondPage.items.map { it.sourceKey }).containsExactly("warning-later", "info-early")
        assertThat(cursor.keys).containsExactlyInAnyOrder("severityRank", "firstObservedAt", "id")
        assertThat(secondPage.nextCursor).isNull()
    }

    @Test
    fun `cursor uses id as tie-break for equal severity and first observed time`() {
        val observedAt = instant(hour = 6)
        insertCase("00000000-0000-0000-0000-00000000c003", "id-third", observedAt)
        insertCase("00000000-0000-0000-0000-00000000c001", "id-first", observedAt)
        insertCase("00000000-0000-0000-0000-00000000c002", "id-second", observedAt)

        val firstPage =
            adapter.list(
                AdminOperationCaseFilter(),
                PageRequest(limit = 2, cursor = emptyMap()),
                UUID.fromString(ACTOR_ID),
            )
        val cursor = CursorCodec.decode(firstPage.nextCursor).orEmpty()
        val secondPage =
            adapter.list(
                AdminOperationCaseFilter(),
                PageRequest(limit = 2, cursor = cursor),
                UUID.fromString(ACTOR_ID),
            )

        assertThat(firstPage.items.map { it.sourceKey }).containsExactly("id-first", "id-second")
        assertThat(cursor["id"]).isEqualTo("00000000-0000-0000-0000-00000000c002")
        assertThat(secondPage.items.map { it.sourceKey }).containsExactly("id-third")
        assertThat(secondPage.nextCursor).isNull()
    }

    @Test
    fun `assignee me excludes cases assigned to another admin`() {
        seedActor()
        seedActor(OTHER_ACTOR_ID, "other-admin-operation-actor@example.invalid")
        val observedAt = instant(hour = 6)
        val opened =
            adapter
                .reconcile(
                    batch(
                        signal(sourceKey = "assigned-to-me", observedAt = observedAt),
                        signal(sourceKey = "assigned-to-other", observedAt = observedAt),
                    ),
                    observedAt,
                ).associateBy { it.sourceKey }
        adapter.transition(
            transition(
                caseId = opened.getValue("assigned-to-me").id,
                expectedVersion = 0,
                action = AdminOperationAction.ACKNOWLEDGE,
                reasonCode = "OPERATOR_ACKNOWLEDGED",
                now = observedAt.plusMinutes(1),
            ),
        )
        adapter.transition(
            transition(
                caseId = opened.getValue("assigned-to-other").id,
                expectedVersion = 0,
                action = AdminOperationAction.ACKNOWLEDGE,
                reasonCode = "OPERATOR_ACKNOWLEDGED",
                now = observedAt.plusMinutes(1),
                actorId = UUID.fromString(OTHER_ACTOR_ID),
            ),
        )

        val assignedToMe =
            adapter.list(
                AdminOperationCaseFilter(assignee = AdminOperationAssigneeFilter.ME),
                PageRequest(limit = 10, cursor = emptyMap()),
                UUID.fromString(ACTOR_ID),
            )

        assertThat(assignedToMe.items.map { it.sourceKey }).containsExactly("assigned-to-me")
    }

    @Test
    fun `history is immutable and ordered newest first`() {
        seedActor()
        val observedAt = instant(hour = 7)
        val opened = adapter.reconcile(batch(signal(observedAt = observedAt)), observedAt).single()
        val acknowledged =
            adapter.transition(
                transition(
                    caseId = opened.id,
                    expectedVersion = 0,
                    action = AdminOperationAction.ACKNOWLEDGE,
                    reasonCode = "OPERATOR_ACKNOWLEDGED",
                    now = observedAt.plusMinutes(1),
                ),
            ) as AdminOperationCaseUpdateResult.Updated
        adapter.transition(
            transition(
                caseId = opened.id,
                expectedVersion = acknowledged.case.version,
                action = AdminOperationAction.RESOLVE,
                reasonCode = "OPERATOR_RESOLVED",
                now = observedAt.plusMinutes(2),
            ),
        )

        val history = adapter.history(opened.id, 10)

        assertThat(history.map { it.reasonCode })
            .containsExactly("OPERATOR_RESOLVED", "OPERATOR_ACKNOWLEDGED", "SIGNAL_OPENED")
        assertThat(history.map { it.caseVersion }).containsExactly(2, 1, 0)
        assertThat(history.map { it.id }).doesNotHaveDuplicates()
        assertThat(rowCount("admin_operation_case_events")).isEqualTo(3)
    }

    @Test
    fun `source status preserves last successful time across an unavailable attempt`() {
        val successfulAt = instant(hour = 8)
        adapter.recordSourceFreshness(
            AdminOperationSourceFreshness(
                sourceType = AdminOperationSourceType.NOTIFICATION,
                status = AdminOperationSourceStatus.AVAILABLE,
                generatedAt = successfulAt,
                lastSuccessfulAt = successfulAt,
                authoritative = true,
            ),
        )
        val unavailableAt = successfulAt.plusMinutes(10)
        adapter.recordSourceFreshness(
            AdminOperationSourceFreshness(
                sourceType = AdminOperationSourceType.NOTIFICATION,
                status = AdminOperationSourceStatus.UNAVAILABLE,
                generatedAt = unavailableAt,
                lastSuccessfulAt = null,
                authoritative = false,
            ),
        )

        val freshness = adapter.sourceFreshness().single()

        assertThat(freshness.status).isEqualTo(AdminOperationSourceStatus.UNAVAILABLE)
        assertThat(freshness.generatedAt).isEqualTo(unavailableAt)
        assertThat(freshness.lastSuccessfulAt).isEqualTo(successfulAt)
        assertThat(freshness.authoritative).isFalse()
        assertThat(rowCount("admin_operation_source_status")).isEqualTo(1)
    }

    @Test
    fun `out-of-order concurrent source attempts preserve the newest freshness`() {
        val olderAt = instant(hour = 8)
        val newerAt = olderAt.plusHours(1)
        val newerCommitted = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val newer =
                CompletableFuture.runAsync(
                    {
                        adapter.recordSourceFreshness(
                            AdminOperationSourceFreshness(
                                sourceType = AdminOperationSourceType.NOTIFICATION,
                                status = AdminOperationSourceStatus.AVAILABLE,
                                generatedAt = newerAt,
                                lastSuccessfulAt = newerAt,
                                authoritative = true,
                            ),
                        )
                        newerCommitted.countDown()
                    },
                    executor,
                )
            val older =
                CompletableFuture.runAsync(
                    {
                        check(newerCommitted.await(10, TimeUnit.SECONDS))
                        adapter.recordSourceFreshness(
                            AdminOperationSourceFreshness(
                                sourceType = AdminOperationSourceType.NOTIFICATION,
                                status = AdminOperationSourceStatus.UNAVAILABLE,
                                generatedAt = olderAt,
                                lastSuccessfulAt = olderAt,
                                authoritative = false,
                            ),
                        )
                    },
                    executor,
                )

            CompletableFuture.allOf(newer, older).get(10, TimeUnit.SECONDS)

            val freshness = adapter.sourceFreshness().single()
            assertThat(freshness.status).isEqualTo(AdminOperationSourceStatus.AVAILABLE)
            assertThat(freshness.generatedAt).isEqualTo(newerAt)
            assertThat(freshness.lastSuccessfulAt).isEqualTo(newerAt)
            assertThat(freshness.authoritative).isTrue()
        } finally {
            executor.shutdownNow()
        }
    }

    @Test
    fun `concurrent reconciliation preserves one source identity`() {
        val observedAt = instant(hour = 9)
        val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val attempts =
                (1..2).map {
                    CompletableFuture.supplyAsync(
                        {
                            check(start.await(10, TimeUnit.SECONDS))
                            adapter.reconcile(batch(signal(observedAt = observedAt)), observedAt).single()
                        },
                        executor,
                    )
                }

            start.countDown()
            val reconciled = attempts.map { it.get(10, TimeUnit.SECONDS) }

            assertThat(reconciled.map { it.id }.distinct()).hasSize(1)
            assertThat(rowCount("admin_operation_cases")).isEqualTo(1)
            assertThat(rowCount("admin_operation_case_events")).isEqualTo(1)
            assertThat(adapter.get(reconciled.first().id)?.version).isZero()
        } finally {
            executor.shutdownNow()
        }
    }

    @Test
    fun `out-of-order concurrent observations preserve the newest case projection`() {
        val olderAt = instant(hour = 9)
        val newerAt = olderAt.plusHours(1)
        val newerCommitted = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val newer =
                CompletableFuture.runAsync(
                    {
                        adapter.reconcile(
                            batch(
                                signal(
                                    severity = AdminOperationSeverity.CRITICAL,
                                    impactCount = 11,
                                    detailHref = "/admin/notifications/newer",
                                    observedAt = newerAt,
                                ),
                                generatedAt = newerAt,
                            ),
                            newerAt,
                        )
                        newerCommitted.countDown()
                    },
                    executor,
                )
            val older =
                CompletableFuture.runAsync(
                    {
                        check(newerCommitted.await(10, TimeUnit.SECONDS))
                        adapter.reconcile(
                            batch(
                                signal(
                                    severity = AdminOperationSeverity.INFO,
                                    impactCount = 1,
                                    detailHref = "/admin/notifications/older",
                                    observedAt = olderAt,
                                ),
                                generatedAt = olderAt,
                            ),
                            newerAt.plusHours(1),
                        )
                    },
                    executor,
                )

            CompletableFuture.allOf(newer, older).get(10, TimeUnit.SECONDS)

            val persisted =
                adapter
                    .list(AdminOperationCaseFilter(), PageRequest(10, emptyMap()), UUID.fromString(ACTOR_ID))
                    .items
                    .single()
            assertThat(persisted.lastObservedAt).isEqualTo(newerAt)
            assertThat(persisted.severity).isEqualTo(AdminOperationSeverity.CRITICAL)
            assertThat(persisted.impactCount).isEqualTo(11)
            assertThat(persisted.detailHref).isEqualTo("/admin/notifications/newer")
        } finally {
            executor.shutdownNow()
        }
    }

    private fun seedActor() {
        seedActor(ACTOR_ID, "admin-operation-actor@example.invalid")
    }

    private fun seedActor(
        actorId: String,
        email: String,
    ) {
        jdbcTemplate.update(
            """
            insert into users (id, email, name, short_name, auth_provider)
            values (?, ?, 'Operation Actor', 'Actor', 'GOOGLE')
            """.trimIndent(),
            actorId,
            email,
        )
    }

    private fun insertCase(
        id: String,
        sourceKey: String,
        observedAt: OffsetDateTime,
    ) {
        jdbcTemplate.update(
            """
            insert into admin_operation_cases (
              id, source_type, source_key, state, severity, safe_summary_code,
              first_observed_at, last_observed_at, impact_count, detail_href
            )
            values (?, 'NOTIFICATION', ?, 'OPEN', 'WARNING', 'NOTIFICATION_DELIVERY_BACKLOG', ?, ?, 1, ?)
            """.trimIndent(),
            id,
            sourceKey,
            observedAt.toLocalDateTime(),
            observedAt.toLocalDateTime(),
            "/admin/notifications/$sourceKey",
        )
    }

    private fun rowCount(table: String): Int =
        requireNotNull(
            jdbcTemplate.queryForObject("select count(*) from $table", Int::class.java),
        )

    private fun transition(
        caseId: UUID,
        expectedVersion: Long,
        action: AdminOperationAction,
        reasonCode: String,
        now: OffsetDateTime,
        snoozedUntil: OffsetDateTime? = null,
        actorId: UUID = UUID.fromString(ACTOR_ID),
    ) = AdminOperationTransitionCommand(
        caseId = caseId,
        expectedVersion = expectedVersion,
        action = action,
        actorAdminId = actorId,
        snoozedUntil = snoozedUntil,
        reasonCode = reasonCode,
        now = now,
    )

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
        detailHref: String = "/admin/notifications",
        observedAt: OffsetDateTime = instant(),
    ) = AdminOperationSignal(
        sourceType = AdminOperationSourceType.NOTIFICATION,
        sourceKey = sourceKey,
        clubId = null,
        severity = severity,
        summaryCode = "NOTIFICATION_DELIVERY_BACKLOG",
        impactCount = impactCount,
        detailHref = detailHref,
        observedAt = observedAt,
    )

    private fun instant(hour: Int = 0): OffsetDateTime = OffsetDateTime.of(2026, 8, 4, hour, 0, 0, 0, ZoneOffset.UTC)
}
