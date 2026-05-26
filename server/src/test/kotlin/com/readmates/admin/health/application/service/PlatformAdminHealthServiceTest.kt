package com.readmates.admin.health.application.service

import com.readmates.admin.health.application.model.HealthCard
import com.readmates.admin.health.application.model.HealthCardSource
import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.model.PlatformHealthSnapshot
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executor
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class PlatformAdminHealthServiceTest {
    private val now: Instant = Instant.parse("2026-05-26T00:00:00Z")
    private val clock: Clock = Clock.fixed(now, ZoneOffset.UTC)
    private val directExecutor = Executor { command -> command.run() }

    @Test
    fun `currentSnapshot computes lazily on first call and caches result`() {
        val provider = CountingProvider("a")
        val service = PlatformAdminHealthService(listOf(provider), clock, directExecutor)

        val first = service.currentSnapshot()
        val second = service.currentSnapshot()

        assertThat(first).isSameAs(second)
        assertThat(provider.calls).isEqualTo(1)
    }

    @Test
    fun `snapshot preserves provider order and schema metadata`() {
        val service =
            PlatformAdminHealthService(
                providers =
                    listOf(
                        StaticProvider("redis", HealthCardStatus.OK),
                        StaticProvider("db_pool", HealthCardStatus.WARN),
                        StaticProvider("kafka_lag", HealthCardStatus.CRIT),
                    ),
                clock = clock,
                executor = directExecutor,
            )

        val snapshot = service.currentSnapshot()

        assertThat(snapshot.schema).isEqualTo(PlatformHealthSnapshot.SCHEMA)
        assertThat(snapshot.generatedAt).isEqualTo(now)
        assertThat(snapshot.cards.map { it.id }).containsExactly("redis", "db_pool", "kafka_lag")
    }

    @Test
    fun `provider throwing yields unknown card and other cards still survive`() {
        val service =
            PlatformAdminHealthService(
                providers =
                    listOf(
                        StaticProvider("redis", HealthCardStatus.OK),
                        ThrowingProvider("kafka_lag"),
                        StaticProvider("db_pool", HealthCardStatus.OK),
                    ),
                clock = clock,
                executor = directExecutor,
            )

        val snapshot = service.currentSnapshot()

        assertThat(snapshot.cards).hasSize(3)
        assertThat(snapshot.cards.map { it.id }).containsExactly("redis", "kafka_lag", "db_pool")
        val failed = snapshot.cards.first { it.id == "kafka_lag" }
        assertThat(failed.status).isEqualTo(HealthCardStatus.UNKNOWN)
        assertThat(failed.reason).isEqualTo("provider_error")
        assertThat(failed.lastCheckedAt).isEqualTo(now)
        assertThat(snapshot.cards.first { it.id == "redis" }.status).isEqualTo(HealthCardStatus.OK)
        assertThat(snapshot.cards.first { it.id == "db_pool" }.status).isEqualTo(HealthCardStatus.OK)
    }

    @Test
    fun `refresh recomputes and replaces cached snapshot`() {
        val provider = CountingProvider("redis")
        val service = PlatformAdminHealthService(listOf(provider), clock, directExecutor)

        val first = service.currentSnapshot()
        val refreshed = service.refresh()

        assertThat(provider.calls).isEqualTo(2)
        assertThat(refreshed).isNotSameAs(first)
        assertThat(service.currentSnapshot()).isSameAs(refreshed)
    }

    @Test
    fun `scheduledRefresh replaces cache with unknown card when provider throws`() {
        val flakyProvider = FlakyProvider("kafka_lag")
        val service = PlatformAdminHealthService(listOf(flakyProvider), clock, directExecutor)

        val initial = service.currentSnapshot()
        flakyProvider.failNextCompletely = true
        service.scheduledRefresh()

        val refreshed = service.currentSnapshot()
        assertThat(refreshed).isNotSameAs(initial)
        assertThat(refreshed.cards.first().id).isEqualTo("kafka_lag")
        assertThat(refreshed.cards.first().status).isEqualTo(HealthCardStatus.UNKNOWN)
        assertThat(refreshed.cards.first().reason).isEqualTo("provider_error")
    }

    @Test
    fun `refresh computes providers concurrently while preserving provider order`() {
        val executor = Executors.newFixedThreadPool(2)
        val bothStarted = CountDownLatch(2)
        val release = CountDownLatch(1)
        val service =
            PlatformAdminHealthService(
                providers =
                    listOf(
                        BlockingProvider("first", bothStarted, release),
                        BlockingProvider("second", bothStarted, release),
                    ),
                clock = clock,
                executor = executor,
            )

        try {
            val refresh = CompletableFuture.supplyAsync { service.refresh() }

            assertThat(bothStarted.await(1, TimeUnit.SECONDS)).isTrue()
            release.countDown()

            assertThat(refresh.get(1, TimeUnit.SECONDS).cards.map { it.id })
                .containsExactly("first", "second")
        } finally {
            executor.shutdownNow()
        }
    }

    @Test
    fun `timed out provider becomes unknown card without blocking other providers`() {
        val executor = Executors.newFixedThreadPool(2)
        val release = CountDownLatch(1)
        val service =
            PlatformAdminHealthService(
                providers =
                    listOf(
                        BlockingProvider("stuck", CountDownLatch(1), release),
                        StaticProvider("redis", HealthCardStatus.OK),
                    ),
                clock = clock,
                executor = executor,
            )

        try {
            val snapshot = service.refresh()

            assertThat(snapshot.cards.map { it.id }).containsExactly("stuck", "redis")
            assertThat(snapshot.cards.first().status).isEqualTo(HealthCardStatus.UNKNOWN)
            assertThat(snapshot.cards.first().reason).isEqualTo("provider_timeout")
            assertThat(snapshot.cards[1].status).isEqualTo(HealthCardStatus.OK)
        } finally {
            release.countDown()
            executor.shutdownNow()
        }
    }

    private inner class CountingProvider(
        override val cardId: String,
    ) : HealthCardProvider {
        var calls = 0

        override fun compute(): HealthCard {
            calls += 1
            return HealthCard(
                id = cardId,
                title = cardId,
                status = HealthCardStatus.OK,
                metric = null,
                thresholds = null,
                lastCheckedAt = now,
                source = HealthCardSource.IN_PROCESS,
                drill = null,
                reason = null,
            )
        }
    }

    private inner class StaticProvider(
        override val cardId: String,
        private val status: HealthCardStatus,
    ) : HealthCardProvider {
        override fun compute(): HealthCard =
            HealthCard(
                id = cardId,
                title = cardId,
                status = status,
                metric = null,
                thresholds = null,
                lastCheckedAt = now,
                source = HealthCardSource.IN_PROCESS,
                drill = null,
                reason = null,
            )
    }

    private class ThrowingProvider(
        override val cardId: String,
    ) : HealthCardProvider {
        override fun compute(): HealthCard = error("boom from $cardId")
    }

    private inner class FlakyProvider(
        override val cardId: String,
    ) : HealthCardProvider {
        var failNextCompletely: Boolean = false

        override fun compute(): HealthCard =
            if (failNextCompletely) {
                error("flaky compute failure")
            } else {
                HealthCard(
                    id = cardId,
                    title = cardId,
                    status = HealthCardStatus.OK,
                    metric = null,
                    thresholds = null,
                    lastCheckedAt = now,
                    source = HealthCardSource.IN_PROCESS,
                    drill = null,
                    reason = null,
                )
            }
    }

    private inner class BlockingProvider(
        override val cardId: String,
        private val bothStarted: CountDownLatch,
        private val release: CountDownLatch,
    ) : HealthCardProvider {
        override fun compute(): HealthCard {
            bothStarted.countDown()
            release.await()
            return HealthCard(
                id = cardId,
                title = cardId,
                status = HealthCardStatus.OK,
                metric = null,
                thresholds = null,
                lastCheckedAt = now,
                source = HealthCardSource.IN_PROCESS,
                drill = null,
                reason = null,
            )
        }
    }
}
