package com.readmates.publication.application.service

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.publication.adapter.out.persistence.JdbcPublicConvergenceAdapter
import com.readmates.publication.application.model.ProviderAttemptResult
import com.readmates.publication.application.model.ProviderAttemptStatus
import com.readmates.publication.application.model.ProviderResultCategory
import com.readmates.publication.application.port.out.PublicCachePurgeCommand
import com.readmates.publication.application.port.out.PublicCachePurgePort
import com.readmates.publication.config.PublicConvergenceProperties
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import com.readmates.support.ReadmatesDbIntegrationTest
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.parallel.Execution
import org.junit.jupiter.api.parallel.ExecutionMode
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@ReadmatesDbIntegrationTest
@Execution(ExecutionMode.SAME_THREAD)
class PublicProjectionConvergenceIntegrationTest(
    @Autowired private val jdbcTemplate: JdbcTemplate,
    @Autowired private val store: JdbcPublicConvergenceAdapter,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val convergenceIds = mutableListOf<UUID>()
    private val receiptIds = mutableListOf<UUID>()

    @AfterEach
    fun cleanUp() {
        convergenceIds.forEach { convergenceId ->
            jdbcTemplate.update(
                "delete from public_convergence_work where convergence_id = ?",
                convergenceId.toString(),
            )
            jdbcTemplate.update(
                "delete from public_mutation_convergence_links where convergence_id = ?",
                convergenceId.toString(),
            )
        }
        receiptIds.forEach { receiptId ->
            jdbcTemplate.update("delete from host_session_mutation_receipts where id = ?", receiptId.toString())
        }
    }

    @Test
    fun `two workers create one pending and terminal attempt without changing the mutation receipt`() {
        val fixture = insertFixture()
        val receiptBefore = receiptBytes(fixture.receiptId)
        val provider = RecordingProvider(success())
        val registry = SimpleMeterRegistry()
        val service = service(provider = provider, metrics = PublicConvergenceMetrics(registry))
        val ready = CountDownLatch(2)
        val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)

        try {
            val results =
                listOf("worker-a", "worker-b").map { owner ->
                    executor.submit<Boolean> {
                        ready.countDown()
                        check(start.await(5, TimeUnit.SECONDS))
                        service.processNext(owner)
                    }
                }
            check(ready.await(5, TimeUnit.SECONDS))
            start.countDown()

            assertThat(results.map { it.get(10, TimeUnit.SECONDS) }.count { it }).isEqualTo(1)
            assertThat(eventRows(fixture.convergenceId)).containsExactly(
                "1:0:PENDING:null",
                "1:1:SUCCEEDED:PURGED",
            )
            assertThat(provider.physicalTokens).hasSize(1)
            assertThat(provider.logicalTokens).hasSize(1)
            assertThat(receiptBytes(fixture.receiptId)).isEqualTo(receiptBefore)
            assertThat(
                registry.meters.flatMap { meter -> meter.id.tags.map { tag -> tag.key } }.toSet(),
            ).containsOnly("status", "retryable")
            assertThat(
                registry.meters.flatMap { meter -> meter.id.tags.map { tag -> tag.value } },
            ).doesNotContain(fixture.convergenceId.toString(), fixture.sessionId.toString(), fixture.clubId.toString())
        } finally {
            executor.shutdownNow()
        }
    }

    @Test
    fun `failed work waits for bounded backoff then succeeds under a higher attempt number`() {
        val fixture = insertFixture()
        val clock = MutableClock(NOW)
        val provider = RecordingProvider(temporaryFailure(), success())
        val service = service(clock = clock, provider = provider)

        assertThat(service.processNext("worker-a")).isTrue()
        assertThat(service.processNext("worker-a")).isFalse()
        assertThat(eventRows(fixture.convergenceId)).containsExactly(
            "1:0:PENDING:null",
            "1:1:FAILED:TEMPORARY_FAILURE",
        )

        clock.advance(Duration.ofSeconds(10))
        assertThat(service.processNext("worker-b")).isTrue()
        assertThat(eventRows(fixture.convergenceId)).containsExactly(
            "1:0:PENDING:null",
            "1:1:FAILED:TEMPORARY_FAILURE",
            "2:0:PENDING:null",
            "2:1:SUCCEEDED:PURGED",
        )
        assertThat(provider.logicalTokens).hasSize(2)
    }

    @Test
    fun `expired lease replays the same provider token after a crash and appends one terminal event`() {
        val fixture = insertFixture()
        val clock = MutableClock(NOW)
        val provider = RecordingProvider(success())
        val service = service(clock = clock, provider = provider)
        val claim =
            checkNotNull(
                store.claimNext("crashed-worker", clock.instant(), Duration.ofSeconds(30), maxAttempts = 3),
            )
        val command = PublicCachePurgeCommand.from(claim)

        assertThat(provider.requestPurge(command)).isEqualTo(success())
        assertThat(eventRows(fixture.convergenceId)).containsExactly("1:0:PENDING:null")

        clock.advance(Duration.ofSeconds(31))
        assertThat(service.processNext("recovery-worker")).isTrue()
        assertThat(provider.physicalTokens).hasSize(2)
        assertThat(provider.logicalTokens).containsExactly(command.idempotencyToken)
        assertThat(eventRows(fixture.convergenceId)).containsExactly(
            "1:0:PENDING:null",
            "1:1:SUCCEEDED:PURGED",
        )
    }

    @Test
    fun `host view and retry are club scoped and bounded by max attempts`() {
        val fixture = insertFixture()
        val clock = MutableClock(NOW)
        val provider = RecordingProvider(temporaryFailure(), temporaryFailure(), temporaryFailure())
        val service = service(clock = clock, provider = provider)
        val host = member(fixture.clubId, isHost = true)

        assertThat(
            service(provider = RecordingProvider(success()), enabled = false)
                .view(host, fixture.sessionId),
        ).isNull()
        assertThat(
            service(provider = RecordingProvider(success()), enabled = false)
                .retry(host, fixture.sessionId, fixture.convergenceId),
        ).isNull()

        assertThat(service.processNext("worker-1")).isTrue()
        val firstFailure = checkNotNull(service.view(host, fixture.sessionId))
        assertThat(firstFailure.status).isEqualTo("FAILED")
        assertThat(firstFailure.originResult).isEqualTo("APPLIED")
        assertThat(firstFailure.committedGeneration).isEqualTo(7)
        assertThat(firstFailure.retryable).isTrue()

        val queuedRetry = checkNotNull(service.retry(host, fixture.sessionId, fixture.convergenceId))
        assertThat(queuedRetry.convergenceId).isEqualTo(fixture.convergenceId)
        assertThat(queuedRetry.status).isEqualTo("PENDING")
        assertThat(queuedRetry.retryable).isFalse()
        assertThat(eventRows(fixture.convergenceId)).containsExactly(
            "1:0:PENDING:null",
            "1:1:FAILED:TEMPORARY_FAILURE",
            "2:0:PENDING:null",
        )
        assertThat(service.processNext("worker-2")).isTrue()
        clock.advance(Duration.ofSeconds(20))
        assertThat(service.processNext("worker-3")).isTrue()
        assertThat(checkNotNull(service.view(host, fixture.sessionId)).retryable).isFalse()
        assertThat(service.retry(host, fixture.sessionId, fixture.convergenceId)).isNull()

        assertThat(service.view(member(UUID.randomUUID(), isHost = true), fixture.sessionId)).isNull()
        assertThatThrownBy { service.view(member(fixture.clubId, isHost = false), fixture.sessionId) }
            .isInstanceOf(AccessDeniedException::class.java)
    }

    private fun service(
        clock: Clock = MutableClock(NOW),
        provider: PublicCachePurgePort,
        metrics: PublicConvergenceMetrics = PublicConvergenceMetrics(SimpleMeterRegistry()),
        enabled: Boolean = true,
    ) = PublicConvergenceService(
        convergencePort = store,
        purgePort = provider,
        properties =
            PublicConvergenceProperties(
                enabled = enabled,
                maxAttempts = 3,
                leaseDuration = Duration.ofSeconds(30),
                initialBackoff = Duration.ofSeconds(10),
                maxBackoff = Duration.ofSeconds(40),
            ),
        clock = clock,
        metrics = metrics,
    )

    private fun insertFixture(): Fixture {
        val fixture = Fixture(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID())
        convergenceIds += fixture.convergenceId
        receiptIds += fixture.receiptId
        jdbcTemplate.update(
            """
            insert into host_session_mutation_receipts (
              id, club_id, actor_membership_id, operation, resource_id,
              session_revision, exposure_revision, participant_set_revision,
              record_draft_revision, live_record_revision, publication_revision,
              notification_decision, dispatch_receipt_id, created_at
            ) values (?, ?, ?, 'SESSION_PUBLICATION', ?, 3, 2, 4, null, 1, 5, 'NOT_SENT', null, ?)
            """.trimIndent(),
            fixture.receiptId.toString(),
            fixture.clubId.toString(),
            UUID.randomUUID().toString(),
            fixture.sessionId.toString(),
            NOW.atOffset(ZoneOffset.UTC).toLocalDateTime(),
        )
        jdbcTemplate.update(
            """
            insert into public_mutation_convergence_links (
              mutation_receipt_id, convergence_id, club_id_snapshot, session_id_snapshot,
              publication_id_snapshot, committed_generation, committed_club_generation,
              live_record_revision, origin_readable, created_at
            ) values (?, ?, ?, ?, ?, 7, 9, 1, true, ?)
            """.trimIndent(),
            fixture.receiptId.toString(),
            fixture.convergenceId.toString(),
            fixture.clubId.toString(),
            fixture.sessionId.toString(),
            fixture.publicationId.toString(),
            NOW.atOffset(ZoneOffset.UTC).toLocalDateTime(),
        )
        jdbcTemplate.update(
            """
            insert into public_convergence_work (
              convergence_id, club_id_snapshot, session_id_snapshot, publication_id_snapshot,
              next_attempt_no, available_at, retention_until, created_at, updated_at
            ) values (?, ?, ?, ?, 1, ?, ?, ?, ?)
            """.trimIndent(),
            fixture.convergenceId.toString(),
            fixture.clubId.toString(),
            fixture.sessionId.toString(),
            fixture.publicationId.toString(),
            NOW.atOffset(ZoneOffset.UTC).toLocalDateTime(),
            NOW.plus(Duration.ofDays(30)).atOffset(ZoneOffset.UTC).toLocalDateTime(),
            NOW.atOffset(ZoneOffset.UTC).toLocalDateTime(),
            NOW.atOffset(ZoneOffset.UTC).toLocalDateTime(),
        )
        return fixture
    }

    private fun eventRows(convergenceId: UUID): List<String> =
        jdbcTemplate.query(
            """
            select attempt_no, event_seq, status, result_category
            from public_convergence_events
            where convergence_id = ?
            order by attempt_no, event_seq
            """.trimIndent(),
            { rs, _ ->
                listOf(
                    rs.getInt("attempt_no"),
                    rs.getInt("event_seq"),
                    rs.getString("status"),
                    rs.getString("result_category"),
                ).joinToString(":")
            },
            convergenceId.toString(),
        )

    private fun receiptBytes(receiptId: UUID): Map<String, Any?> =
        checkNotNull(
            jdbcTemplate.queryForMap(
                """
                select id, club_id, actor_membership_id, operation, resource_id,
                       session_revision, exposure_revision, participant_set_revision,
                       record_draft_revision, live_record_revision, publication_revision,
                       notification_decision, dispatch_receipt_id, created_at
                from host_session_mutation_receipts where id = ?
                """.trimIndent(),
                receiptId.toString(),
            ),
        )

    private fun member(
        clubId: UUID,
        isHost: Boolean,
    ) = CurrentMember(
        userId = UUID.randomUUID(),
        membershipId = UUID.randomUUID(),
        clubId = clubId,
        clubSlug = "fixture-club",
        email = "fixture@example.com",
        displayName = "Fixture",
        accountName = "fixture",
        role = if (isHost) MembershipRole.HOST else MembershipRole.MEMBER,
        membershipStatus = MembershipStatus.ACTIVE,
    )

    private data class Fixture(
        val convergenceId: UUID,
        val receiptId: UUID,
        val clubId: UUID,
        val sessionId: UUID,
        val publicationId: UUID = UUID.randomUUID(),
    )

    private class RecordingProvider(
        vararg results: ProviderAttemptResult,
    ) : PublicCachePurgePort {
        private val remaining = ConcurrentLinkedQueue(results.toList())
        private val replay = ConcurrentHashMap<String, ProviderAttemptResult>()
        val physicalTokens = CopyOnWriteArrayList<String>()
        val logicalTokens: List<String>
            get() = replay.keys().toList()

        override fun requestPurge(command: PublicCachePurgeCommand): ProviderAttemptResult {
            physicalTokens += command.idempotencyToken
            return replay.computeIfAbsent(command.idempotencyToken) {
                checkNotNull(remaining.poll()) { "No provider result configured" }
            }
        }
    }

    private class MutableClock(
        private var now: Instant,
    ) : Clock() {
        override fun getZone(): ZoneId = ZoneOffset.UTC

        override fun withZone(zone: ZoneId): Clock = this

        override fun instant(): Instant = now

        fun advance(duration: Duration) {
            now = now.plus(duration)
        }
    }

    companion object {
        private val NOW: Instant = Instant.parse("2000-01-01T00:00:00Z")

        private fun success() =
            ProviderAttemptResult(
                ProviderAttemptStatus.SUCCEEDED,
                ProviderResultCategory.PURGED,
                retryable = false,
            )

        private fun temporaryFailure() =
            ProviderAttemptResult(
                ProviderAttemptStatus.FAILED,
                ProviderResultCategory.TEMPORARY_FAILURE,
                retryable = true,
            )
    }
}
