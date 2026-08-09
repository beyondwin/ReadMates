package com.readmates.admin.health.application.service

import com.readmates.admin.health.application.model.HealthCard
import com.readmates.admin.health.application.model.HealthCardSource
import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.model.PlatformHealthRefreshState
import com.readmates.admin.health.application.model.PlatformHealthRefreshTrigger
import com.readmates.admin.health.application.model.PlatformHealthView
import com.readmates.admin.health.config.PlatformAdminHealthProperties
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatCode
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.Collections
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CountDownLatch
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executor
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

class PlatformAdminHealthServiceTest {
    private val initialNow: Instant = Instant.parse("2026-08-09T00:00:00Z")
    private val clock = MutableClock(initialNow)
    private val directExecutor = Executor { command -> command.run() }

    @Test
    fun `twenty concurrent lazy and scheduled triggers share the exact in-flight future and one provider wave`() {
        val providerStarted = CountDownLatch(1)
        val releaseProvider = CountDownLatch(1)
        val providerCalls = AtomicInteger()
        val providerExecutor = Executors.newSingleThreadExecutor()
        val callerExecutor = Executors.newFixedThreadPool(20)
        val callersReady = CyclicBarrier(21)
        val futures = Collections.synchronizedList(mutableListOf<CompletableFuture<*>>())
        val callsReturned = CountDownLatch(20)
        val service =
            service(
                providers =
                    listOf(
                        provider("redis") {
                            providerCalls.incrementAndGet()
                            providerStarted.countDown()
                            check(releaseProvider.await(1, TimeUnit.SECONDS))
                            card("redis", HealthCardStatus.OK)
                        },
                    ),
                executor = providerExecutor,
            )

        try {
            repeat(20) { index ->
                callerExecutor.execute {
                    callersReady.await(1, TimeUnit.SECONDS)
                    val trigger =
                        if (index % 2 == 0) {
                            PlatformHealthRefreshTrigger.LAZY
                        } else {
                            PlatformHealthRefreshTrigger.SCHEDULED
                        }
                    futures.add(service.refresh(trigger))
                    callsReturned.countDown()
                }
            }

            callersReady.await(1, TimeUnit.SECONDS)
            assertThat(providerStarted.await(1, TimeUnit.SECONDS)).isTrue()
            assertThat(callsReturned.await(1, TimeUnit.SECONDS)).isTrue()
            assertThat(providerCalls.get()).isEqualTo(1)
            assertThat(futures).hasSize(20)
            assertThat(futures).allMatch { future -> future === futures.first() }

            releaseProvider.countDown()
            assertThat(futures.first().get(1, TimeUnit.SECONDS)).isNotNull()
        } finally {
            releaseProvider.countDown()
            callerExecutor.shutdownNow()
            providerExecutor.shutdownNow()
        }
    }

    @Test
    fun `stale cached read starts one lazy refresh and returns the last known good snapshot without waiting`() {
        val providerStarted = CountDownLatch(1)
        val releaseProvider = CountDownLatch(1)
        val block = AtomicReference(false)
        val providerExecutor = Executors.newSingleThreadExecutor()
        val service =
            service(
                providers =
                    listOf(
                        provider("redis") {
                            if (block.get()) {
                                providerStarted.countDown()
                                check(releaseProvider.await(1, TimeUnit.SECONDS))
                            }
                            card("redis", HealthCardStatus.OK)
                        },
                    ),
                executor = providerExecutor,
            )

        try {
            val lastKnownGood = service.currentHealth()
            block.set(true)
            clock.advance(Duration.ofSeconds(30))

            val cachedRead = CompletableFuture.supplyAsync(service::currentHealth)

            assertThat(providerStarted.await(1, TimeUnit.SECONDS)).isTrue()
            val returned = cachedRead.get(250, TimeUnit.MILLISECONDS)
            assertThat(returned.snapshot).isSameAs(lastKnownGood.snapshot)
            assertThat(returned.refreshState).isEqualTo(PlatformHealthRefreshState.REFRESHING)
            assertThat(returned.staleAgeSeconds).isEqualTo(30)
        } finally {
            releaseProvider.countDown()
            providerExecutor.shutdownNow()
        }
    }

    @Test
    fun `failed wave inside freshness starts exactly one lazy recovery and returns cached health immediately`() {
        val recoveryStarted = CountDownLatch(1)
        val releaseRecovery = CountDownLatch(1)
        val providerCalls = AtomicInteger()
        val providerExecutor = Executors.newSingleThreadExecutor()
        val service =
            service(
                providers =
                    listOf(
                        provider("redis") {
                            when (providerCalls.incrementAndGet()) {
                                1 -> card("redis", HealthCardStatus.OK, "last-known-good")
                                2 -> error("failed wave")
                                else -> {
                                    recoveryStarted.countDown()
                                    check(releaseRecovery.await(1, TimeUnit.SECONDS))
                                    card("redis", HealthCardStatus.OK, "recovered")
                                }
                            }
                        },
                    ),
                executor = providerExecutor,
            )

        try {
            val lastKnownGood = service.currentHealth()
            clock.advance(Duration.ofSeconds(10))
            val stale = service.refresh(PlatformHealthRefreshTrigger.SCHEDULED).get(1, TimeUnit.SECONDS)
            assertThat(stale.refreshState).isEqualTo(PlatformHealthRefreshState.STALE)

            val cachedRead = CompletableFuture.supplyAsync(service::currentHealth)

            assertThat(recoveryStarted.await(1, TimeUnit.SECONDS)).isTrue()
            val returned = cachedRead.get(250, TimeUnit.MILLISECONDS)
            assertThat(returned.snapshot).isSameAs(lastKnownGood.snapshot)
            assertThat(returned.refreshState).isEqualTo(PlatformHealthRefreshState.REFRESHING)
            assertThat(service.currentHealth().snapshot).isSameAs(lastKnownGood.snapshot)
            assertThat(providerCalls.get()).isEqualTo(3)
        } finally {
            releaseRecovery.countDown()
            providerExecutor.shutdownNow()
        }
    }

    @Test
    fun `failed future is cleared before completion is observable so immediate refresh starts recovery`() {
        val failedProviderStarted = CountDownLatch(1)
        val releaseFailedProvider = CountDownLatch(1)
        val failedCompletionObserved = CountDownLatch(1)
        val releaseFailedCompletion = CountDownLatch(1)
        val recoveryStarted = CountDownLatch(1)
        val releaseRecovery = CountDownLatch(1)
        val providerCalls = AtomicInteger()
        val providerExecutor = Executors.newFixedThreadPool(2)
        val service =
            service(
                providers =
                    listOf(
                        provider("redis") {
                            when (providerCalls.incrementAndGet()) {
                                1 -> card("redis", HealthCardStatus.OK, "last-known-good")
                                2 -> {
                                    failedProviderStarted.countDown()
                                    check(releaseFailedProvider.await(1, TimeUnit.SECONDS))
                                    error("failed wave")
                                }
                                else -> {
                                    recoveryStarted.countDown()
                                    check(releaseRecovery.await(1, TimeUnit.SECONDS))
                                    card("redis", HealthCardStatus.OK, "recovered")
                                }
                            }
                        },
                    ),
                executor = providerExecutor,
            )

        try {
            service.currentHealth()
            clock.advance(Duration.ofSeconds(10))
            val failedRefresh = service.refresh(PlatformHealthRefreshTrigger.SCHEDULED)
            assertThat(failedProviderStarted.await(1, TimeUnit.SECONDS)).isTrue()
            failedRefresh.whenComplete { _, _ ->
                failedCompletionObserved.countDown()
                check(releaseFailedCompletion.await(1, TimeUnit.SECONDS))
            }

            releaseFailedProvider.countDown()
            assertThat(failedCompletionObserved.await(1, TimeUnit.SECONDS)).isTrue()
            assertThat(failedRefresh.get(250, TimeUnit.MILLISECONDS).refreshState)
                .isEqualTo(PlatformHealthRefreshState.STALE)

            val recovery = service.refresh(PlatformHealthRefreshTrigger.LAZY)

            assertThat(recovery).isNotSameAs(failedRefresh)
            assertThat(recoveryStarted.await(1, TimeUnit.SECONDS)).isTrue()
            assertThat(recovery.isDone).isFalse()
            assertThat(providerCalls.get()).isEqualTo(3)
        } finally {
            releaseFailedProvider.countDown()
            releaseFailedCompletion.countDown()
            releaseRecovery.countDown()
            providerExecutor.shutdownNow()
        }
    }

    @Test
    fun `failed wave after a full success preserves the whole previous snapshot as stale`() {
        val releaseHungProvider = CountDownLatch(1)
        val fail = AtomicReference(false)
        val providerExecutor = Executors.newFixedThreadPool(2)
        val service =
            service(
                providers =
                    listOf(
                        provider("stuck") {
                            if (fail.get()) {
                                check(releaseHungProvider.await(1, TimeUnit.SECONDS))
                                card("stuck", HealthCardStatus.CRIT, "late")
                            } else {
                                card("stuck", HealthCardStatus.OK, "old-stuck")
                            }
                        },
                        provider("redis") {
                            if (fail.get()) {
                                card("redis", HealthCardStatus.CRIT, "new-redis")
                            } else {
                                card("redis", HealthCardStatus.OK, "old-redis")
                            }
                        },
                    ),
                executor = providerExecutor,
                providerDeadline = Duration.ofMillis(75),
            )

        try {
            val lastKnownGood = service.currentHealth()
            fail.set(true)
            clock.advance(Duration.ofSeconds(31))

            val stale = service.refresh(PlatformHealthRefreshTrigger.SCHEDULED).get(1, TimeUnit.SECONDS)

            assertThat(stale.refreshState).isEqualTo(PlatformHealthRefreshState.STALE)
            assertThat(stale.snapshot).isSameAs(lastKnownGood.snapshot)
            assertThat(stale.snapshot.cards.map(HealthCard::title)).containsExactly("old-stuck", "old-redis")
            assertThat(stale.lastSuccessfulAt).isEqualTo(initialNow)
        } finally {
            releaseHungProvider.countDown()
            providerExecutor.shutdownNow()
        }
    }

    @Test
    fun `failed first wave returns successful cards and deterministic unknown failures as unavailable`() {
        val releaseHungProvider = CountDownLatch(1)
        val providerExecutor = Executors.newFixedThreadPool(2)
        val service =
            service(
                providers =
                    listOf(
                        provider("stuck") {
                            check(releaseHungProvider.await(1, TimeUnit.SECONDS))
                            card("stuck", HealthCardStatus.OK, "too-late")
                        },
                        provider("redis") { card("redis", HealthCardStatus.OK, "Redis") },
                    ),
                executor = providerExecutor,
                providerDeadline = Duration.ofMillis(75),
            )

        try {
            val unavailable = service.currentHealth()

            assertThat(unavailable.refreshState).isEqualTo(PlatformHealthRefreshState.UNAVAILABLE)
            assertThat(unavailable.lastSuccessfulAt).isNull()
            assertThat(unavailable.snapshot.cards.map(HealthCard::id)).containsExactly("stuck", "redis")
            assertThat(unavailable.snapshot.cards[0])
                .usingRecursiveComparison()
                .isEqualTo(
                    HealthCard(
                        id = "stuck",
                        title = "stuck",
                        status = HealthCardStatus.UNKNOWN,
                        metric = null,
                        thresholds = null,
                        lastCheckedAt = initialNow,
                        source = HealthCardSource.IN_PROCESS,
                        drill = null,
                        reason = "provider_timeout",
                    ),
                )
            assertThat(unavailable.snapshot.cards[1].title).isEqualTo("Redis")
            assertThat(unavailable.snapshot.cards[1].status).isEqualTo(HealthCardStatus.OK)
        } finally {
            releaseHungProvider.countDown()
            providerExecutor.shutdownNow()
        }
    }

    @Test
    fun `synchronous executor rejection becomes typed fallback and never escapes request thread`() {
        val rejectingExecutor = Executor { throw RejectedExecutionException("queue full") }
        val unavailableService =
            service(
                providers = listOf(provider("redis") { card("redis") }, provider("db_pool") { card("db_pool") }),
                executor = rejectingExecutor,
            )

        lateinit var refresh: CompletableFuture<PlatformHealthView>
        assertThatCode {
            refresh = unavailableService.refresh(PlatformHealthRefreshTrigger.LAZY)
        }.doesNotThrowAnyException()

        val unavailable = refresh.get(1, TimeUnit.SECONDS)
        assertThat(unavailable.refreshState).isEqualTo(PlatformHealthRefreshState.UNAVAILABLE)
        assertThat(unavailable.snapshot.cards.map(HealthCard::reason))
            .containsExactly("provider_rejected", "provider_rejected")

        val executorDelegate = AtomicReference(directExecutor)
        val switchingExecutor = Executor { command -> executorDelegate.get().execute(command) }
        val staleService = service(listOf(provider("redis") { card("redis") }), switchingExecutor)
        val lastKnownGood = staleService.currentHealth()
        clock.advance(Duration.ofSeconds(30))
        executorDelegate.set(rejectingExecutor)

        val stale = staleService.currentHealth()

        assertThat(stale.refreshState).isEqualTo(PlatformHealthRefreshState.STALE)
        assertThat(stale.snapshot).isSameAs(lastKnownGood.snapshot)
    }

    @Test
    fun `late supplier completion after timeout cannot replace the stale last known good state`() {
        val timedOutProviderStarted = CountDownLatch(1)
        val releaseTimedOutProvider = CountDownLatch(1)
        val timedOutProviderFinished = CountDownLatch(1)
        val recoveryStarted = CountDownLatch(1)
        val releaseRecovery = CountDownLatch(1)
        val providerCalls = AtomicInteger()
        val providerExecutor = Executors.newSingleThreadExecutor()
        val service =
            service(
                providers =
                    listOf(
                        provider("redis") {
                            when (providerCalls.incrementAndGet()) {
                                1 -> card("redis", HealthCardStatus.OK, "last-known-good")
                                2 -> {
                                    timedOutProviderStarted.countDown()
                                    check(releaseTimedOutProvider.await(1, TimeUnit.SECONDS))
                                    timedOutProviderFinished.countDown()
                                    card("redis", HealthCardStatus.CRIT, "late-new")
                                }
                                else -> {
                                    recoveryStarted.countDown()
                                    check(releaseRecovery.await(1, TimeUnit.SECONDS))
                                    card("redis", HealthCardStatus.OK, "recovered")
                                }
                            }
                        },
                    ),
                executor = providerExecutor,
                providerDeadline = Duration.ofMillis(75),
            )

        try {
            val lastKnownGood = service.currentHealth()
            clock.advance(Duration.ofSeconds(31))
            val stale = service.refresh(PlatformHealthRefreshTrigger.SCHEDULED).get(1, TimeUnit.SECONDS)
            assertThat(timedOutProviderStarted.await(1, TimeUnit.SECONDS)).isTrue()
            assertThat(stale.snapshot).isSameAs(lastKnownGood.snapshot)

            releaseTimedOutProvider.countDown()
            assertThat(timedOutProviderFinished.await(1, TimeUnit.SECONDS)).isTrue()

            val afterLateCompletion = service.currentHealth()
            assertThat(recoveryStarted.await(1, TimeUnit.SECONDS)).isTrue()
            assertThat(afterLateCompletion.snapshot).isSameAs(lastKnownGood.snapshot)
            val visibleCard = afterLateCompletion.snapshot.cards.single()
            assertThat(visibleCard.title).isEqualTo("last-known-good")
        } finally {
            releaseTimedOutProvider.countDown()
            releaseRecovery.countDown()
            providerExecutor.shutdownNow()
        }
    }

    @Test
    fun `provider returned unknown is a successful invocation that advances last successful time`() {
        val service =
            service(
                providers = listOf(provider("redis") { card("redis", HealthCardStatus.UNKNOWN) }),
                executor = directExecutor,
            )

        val initial = service.currentHealth()
        clock.advance(Duration.ofSeconds(5))
        val refreshed = service.refresh(PlatformHealthRefreshTrigger.SCHEDULED).get(1, TimeUnit.SECONDS)

        assertThat(initial.refreshState).isEqualTo(PlatformHealthRefreshState.FRESH)
        assertThat(refreshed.refreshState).isEqualTo(PlatformHealthRefreshState.FRESH)
        assertThat(refreshed.lastSuccessfulAt).isEqualTo(initialNow.plusSeconds(5))
        assertThat(
            refreshed.snapshot.cards
                .single()
                .status,
        ).isEqualTo(HealthCardStatus.UNKNOWN)
    }

    @Test
    fun `exceptional in-flight future is cleared by exact CAS and next refresh recovers`() {
        val executorDelegate = AtomicReference<Executor>(Executor { throw IllegalStateException("broken executor") })
        val switchingExecutor = Executor { command -> executorDelegate.get().execute(command) }
        val service = service(listOf(provider("redis") { card("redis") }), switchingExecutor)

        val failed = service.refresh(PlatformHealthRefreshTrigger.LAZY)
        assertThatThrownBy { failed.get(1, TimeUnit.SECONDS) }
            .hasCauseInstanceOf(IllegalStateException::class.java)

        clock.advance(Duration.ofSeconds(5))
        executorDelegate.set(directExecutor)
        val recovered = service.refresh(PlatformHealthRefreshTrigger.SCHEDULED).get(1, TimeUnit.SECONDS)

        assertThat(recovered.refreshState).isEqualTo(PlatformHealthRefreshState.FRESH)
        assertThat(recovered.lastSuccessfulAt).isEqualTo(initialNow.plusSeconds(5))
        val recoveredCard = recovered.snapshot.cards.single()
        assertThat(recoveredCard.status).isEqualTo(HealthCardStatus.OK)
    }

    @Test
    fun `stale age uses injected clock at exact expiry boundary and is never negative`() {
        val block = AtomicReference(false)
        val providerStarted = CountDownLatch(1)
        val releaseProvider = CountDownLatch(1)
        val providerExecutor = Executors.newSingleThreadExecutor()
        val service =
            service(
                providers =
                    listOf(
                        provider("redis") {
                            if (block.get()) {
                                providerStarted.countDown()
                                check(releaseProvider.await(1, TimeUnit.SECONDS))
                            }
                            card("redis")
                        },
                    ),
                executor = providerExecutor,
            )

        try {
            service.currentHealth()
            clock.set(initialNow.plusSeconds(29))
            assertThat(service.currentHealth().refreshState).isEqualTo(PlatformHealthRefreshState.FRESH)
            assertThat(service.currentHealth().staleAgeSeconds).isEqualTo(29)

            block.set(true)
            clock.set(initialNow.plusSeconds(30))
            val atBoundary = service.currentHealth()
            assertThat(providerStarted.await(1, TimeUnit.SECONDS)).isTrue()
            assertThat(atBoundary.refreshState).isEqualTo(PlatformHealthRefreshState.REFRESHING)
            assertThat(atBoundary.staleAgeSeconds).isEqualTo(30)

            clock.set(initialNow.minusSeconds(10))
            assertThat(service.currentHealth().staleAgeSeconds).isZero()
        } finally {
            releaseProvider.countDown()
            providerExecutor.shutdownNow()
        }
    }

    @Test
    fun `provider exception is typed as error without hiding successful cards before first success`() {
        val service =
            service(
                providers =
                    listOf(
                        provider("kafka_lag") { error("boom") },
                        provider("redis") { card("redis") },
                    ),
                executor = directExecutor,
            )

        val unavailable = service.currentHealth()

        assertThat(unavailable.refreshState).isEqualTo(PlatformHealthRefreshState.UNAVAILABLE)
        assertThat(unavailable.snapshot.cards.map(HealthCard::reason)).containsExactly("provider_error", null)
    }

    private fun service(
        providers: List<HealthCardProvider>,
        executor: Executor,
        providerDeadline: Duration = Duration.ofMillis(100),
    ): PlatformAdminHealthService =
        PlatformAdminHealthService(
            providers = providers,
            clock = clock,
            executor = executor,
            properties =
                PlatformAdminHealthProperties(
                    refreshInterval = Duration.ofSeconds(10),
                    freshness = Duration.ofSeconds(30),
                    providerDeadline = providerDeadline,
                    prometheus =
                        PlatformAdminHealthProperties.Prometheus(
                            connectTimeout = Duration.ofMillis(50).coerceAtMost(providerDeadline),
                            connectionRequestTimeout = Duration.ofMillis(50).coerceAtMost(providerDeadline),
                            readTimeout = Duration.ofMillis(50).coerceAtMost(providerDeadline),
                        ),
                ),
        )

    private fun provider(
        id: String,
        compute: () -> HealthCard,
    ): HealthCardProvider =
        object : HealthCardProvider {
            override val cardId: String = id

            override fun compute(): HealthCard = compute()
        }

    private fun card(
        id: String,
        status: HealthCardStatus = HealthCardStatus.OK,
        title: String = id,
    ): HealthCard =
        HealthCard(
            id = id,
            title = title,
            status = status,
            metric = null,
            thresholds = null,
            lastCheckedAt = clock.instant(),
            source = HealthCardSource.IN_PROCESS,
            drill = null,
            reason = null,
        )
}

private class MutableClock(
    initial: Instant,
) : Clock() {
    private val current = AtomicReference(initial)

    override fun getZone(): ZoneId = ZoneOffset.UTC

    override fun withZone(zone: ZoneId): Clock = this

    override fun instant(): Instant = current.get()

    fun set(instant: Instant) {
        current.set(instant)
    }

    fun advance(duration: Duration) {
        current.updateAndGet { instant -> instant.plus(duration) }
    }
}
