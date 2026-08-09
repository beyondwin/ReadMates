package com.readmates.admin.health.application.service

import com.readmates.admin.health.application.model.HealthCard
import com.readmates.admin.health.application.model.HealthCardSource
import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.model.PlatformHealthRefreshState
import com.readmates.admin.health.application.model.PlatformHealthRefreshTrigger
import com.readmates.admin.health.application.model.PlatformHealthSnapshot
import com.readmates.admin.health.application.model.PlatformHealthView
import com.readmates.admin.health.application.port.`in`.ReadPlatformAdminHealthUseCase
import com.readmates.admin.health.application.port.`in`.RefreshPlatformAdminHealthUseCase
import com.readmates.admin.health.application.port.out.PlatformAdminHealthMetricsPort
import com.readmates.admin.health.application.port.out.PlatformHealthProvider
import com.readmates.admin.health.application.port.out.PlatformHealthProviderOutcome
import com.readmates.admin.health.application.port.out.PlatformHealthRefreshResult
import com.readmates.admin.health.config.PlatformAdminHealthProperties
import com.readmates.shared.architecture.ReadOnlyApplicationService
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.stereotype.Service
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executor
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

@ReadOnlyApplicationService
@Service
class PlatformAdminHealthService(
    private val providers: List<HealthCardProvider>,
    private val clock: Clock,
    @param:Qualifier("platformAdminHealthExecutor")
    private val executor: Executor,
    private val properties: PlatformAdminHealthProperties,
    private val metrics: PlatformAdminHealthMetricsPort,
) : ReadPlatformAdminHealthUseCase,
    RefreshPlatformAdminHealthUseCase {
    private val state = AtomicReference(HealthState())
    private val inFlight = AtomicReference<CompletableFuture<PlatformHealthView>?>()

    override fun currentHealth(): PlatformHealthView {
        val view =
            state.get().let { current ->
                current.snapshot?.let { snapshot -> currentHealth(current, snapshot) }
                    ?: refresh(PlatformHealthRefreshTrigger.LAZY).join()
            }
        recordMetric { updateStaleAge(view.staleAgeSeconds) }
        return view
    }

    private fun currentHealth(
        current: HealthState,
        snapshot: PlatformHealthSnapshot,
    ): PlatformHealthView {
        val now = clock.instant()
        val staleAge = staleAgeSeconds(current.lastSuccessfulAt, now)
        val isStale =
            current.refreshState == PlatformHealthRefreshState.STALE ||
                current.lastSuccessfulAt == null ||
                !Duration.between(current.lastSuccessfulAt, now).isNegative &&
                Duration.between(current.lastSuccessfulAt, now) >= properties.freshness

        return if (isStale) {
            staleHealth(current, snapshot, now, staleAge)
        } else {
            PlatformHealthView(
                snapshot = snapshot,
                lastSuccessfulAt = current.lastSuccessfulAt,
                refreshState =
                    if (inFlight.get() == null) {
                        current.refreshState
                    } else {
                        PlatformHealthRefreshState.REFRESHING
                    },
                staleAgeSeconds = staleAge,
            )
        }
    }

    private fun staleHealth(
        current: HealthState,
        snapshot: PlatformHealthSnapshot,
        now: Instant,
        staleAge: Long,
    ): PlatformHealthView {
        val triggeredRefresh = refresh(PlatformHealthRefreshTrigger.LAZY)
        return when {
            !triggeredRefresh.isDone ->
                PlatformHealthView(
                    snapshot = snapshot,
                    lastSuccessfulAt = current.lastSuccessfulAt,
                    refreshState = PlatformHealthRefreshState.REFRESHING,
                    staleAgeSeconds = staleAge,
                )
            triggeredRefresh.isCompletedExceptionally ->
                current
                    .copy(
                        refreshState =
                            if (current.lastSuccessfulAt == null) {
                                PlatformHealthRefreshState.UNAVAILABLE
                            } else {
                                PlatformHealthRefreshState.STALE
                            },
                    ).toView(now)
            else -> triggeredRefresh.join()
        }
    }

    @Suppress("TooGenericExceptionCaught")
    override fun refresh(trigger: PlatformHealthRefreshTrigger): CompletableFuture<PlatformHealthView> {
        while (true) {
            inFlight.get()?.let { existing ->
                recordMetric { recordRefreshOverlap(trigger) }
                return existing
            }
            val exactFuture = CompletableFuture<PlatformHealthView>()
            if (!inFlight.compareAndSet(null, exactFuture)) {
                continue
            }

            try {
                startProviderWave().whenComplete { view, failure ->
                    inFlight.compareAndSet(exactFuture, null)
                    if (failure == null) {
                        exactFuture.complete(view)
                    } else {
                        exactFuture.completeExceptionally(failure)
                    }
                }
            } catch (failure: Exception) {
                inFlight.compareAndSet(exactFuture, null)
                exactFuture.completeExceptionally(failure)
            }
            return exactFuture
        }
    }

    private fun startProviderWave(): CompletableFuture<PlatformHealthView> {
        val waveStartedAt = clock.instant()
        val providerResults = providers.map { provider -> providerResult(provider, waveStartedAt) }
        return CompletableFuture
            .allOf(*providerResults.toTypedArray())
            .thenApply {
                completeWave(
                    waveStartedAt = waveStartedAt,
                    results = providerResults.map(CompletableFuture<ProviderResult>::join),
                )
            }
    }

    private fun providerResult(
        provider: HealthCardProvider,
        waveStartedAt: Instant,
    ): CompletableFuture<ProviderResult> =
        try {
            val result =
                CompletableFuture.supplyAsync<ProviderResult>(
                    { ProviderResult.Success(provider, provider.compute()) },
                    executor,
                )
            result
                .completeOnTimeout(
                    ProviderResult.Failure(provider, ProviderFailureKind.TIMEOUT, waveStartedAt),
                    properties.providerDeadline.toMillis(),
                    TimeUnit.MILLISECONDS,
                ).exceptionally {
                    ProviderResult.Failure(provider, ProviderFailureKind.ERROR, waveStartedAt)
                }
        } catch (_: RejectedExecutionException) {
            CompletableFuture.completedFuture(
                ProviderResult.Failure(provider, ProviderFailureKind.REJECTED, waveStartedAt),
            )
        }

    private fun completeWave(
        waveStartedAt: Instant,
        results: List<ProviderResult>,
    ): PlatformHealthView {
        val completedAt = clock.instant()
        val allSuccessful = results.all { result -> result is ProviderResult.Success }
        val nextState =
            if (allSuccessful) {
                HealthState(
                    snapshot =
                        PlatformHealthSnapshot(
                            schema = PlatformHealthSnapshot.SCHEMA,
                            generatedAt = waveStartedAt,
                            cards = results.map(ProviderResult::card),
                        ),
                    lastSuccessfulAt = completedAt,
                    refreshState = PlatformHealthRefreshState.FRESH,
                )
            } else {
                failedState(waveStartedAt, results)
            }
        state.set(nextState)
        results.forEach { result ->
            PlatformHealthProvider.fromCardId(result.cardId())?.let { provider ->
                recordMetric { recordProviderOutcome(provider, result.outcome()) }
            }
        }
        recordMetric {
            recordRefreshDuration(
                result =
                    when (nextState.refreshState) {
                        PlatformHealthRefreshState.FRESH -> PlatformHealthRefreshResult.FRESH
                        PlatformHealthRefreshState.STALE -> PlatformHealthRefreshResult.STALE
                        PlatformHealthRefreshState.UNAVAILABLE -> PlatformHealthRefreshResult.UNAVAILABLE
                        PlatformHealthRefreshState.REFRESHING -> error("Refresh wave cannot complete as REFRESHING")
                    },
                duration =
                    Duration.between(waveStartedAt, completedAt).let { duration ->
                        if (duration.isNegative) Duration.ZERO else duration
                    },
            )
        }
        val view = nextState.toView(completedAt)
        recordMetric { updateStaleAge(view.staleAgeSeconds) }
        return view
    }

    private fun failedState(
        waveStartedAt: Instant,
        results: List<ProviderResult>,
    ): HealthState {
        val previous = state.get()
        if (previous.lastSuccessfulAt != null && previous.snapshot != null) {
            return previous.copy(refreshState = PlatformHealthRefreshState.STALE)
        }
        return HealthState(
            snapshot =
                PlatformHealthSnapshot(
                    schema = PlatformHealthSnapshot.SCHEMA,
                    generatedAt = waveStartedAt,
                    cards = results.map(ProviderResult::card),
                ),
            lastSuccessfulAt = null,
            refreshState = PlatformHealthRefreshState.UNAVAILABLE,
        )
    }

    private fun HealthState.toView(now: Instant): PlatformHealthView =
        PlatformHealthView(
            snapshot = requireNotNull(snapshot),
            lastSuccessfulAt = lastSuccessfulAt,
            refreshState = refreshState,
            staleAgeSeconds = staleAgeSeconds(lastSuccessfulAt, now),
        )

    private fun staleAgeSeconds(
        lastSuccessfulAt: Instant?,
        now: Instant,
    ): Long =
        lastSuccessfulAt
            ?.let { successfulAt -> Duration.between(successfulAt, now).seconds.coerceAtLeast(0) }
            ?: 0

    @Suppress("SwallowedException")
    private inline fun recordMetric(record: PlatformAdminHealthMetricsPort.() -> Unit) {
        try {
            metrics.record()
        } catch (_: RuntimeException) {
            // Observability is fail-open: metric backend failures must not change health behavior.
        }
    }

    private data class HealthState(
        val snapshot: PlatformHealthSnapshot? = null,
        val lastSuccessfulAt: Instant? = null,
        val refreshState: PlatformHealthRefreshState = PlatformHealthRefreshState.UNAVAILABLE,
    )

    private sealed interface ProviderResult {
        fun card(): HealthCard

        fun cardId(): String

        fun outcome(): PlatformHealthProviderOutcome

        data class Success(
            val provider: HealthCardProvider,
            val healthCard: HealthCard,
        ) : ProviderResult {
            override fun card(): HealthCard = healthCard

            override fun cardId(): String = provider.cardId

            override fun outcome(): PlatformHealthProviderOutcome = PlatformHealthProviderOutcome.SUCCESS
        }

        data class Failure(
            val provider: HealthCardProvider,
            val kind: ProviderFailureKind,
            val checkedAt: Instant,
        ) : ProviderResult {
            override fun card(): HealthCard =
                HealthCard(
                    id = provider.cardId,
                    title = provider.cardId,
                    status = HealthCardStatus.UNKNOWN,
                    metric = null,
                    thresholds = null,
                    lastCheckedAt = checkedAt,
                    source = HealthCardSource.IN_PROCESS,
                    drill = null,
                    reason = kind.reason,
                )

            override fun cardId(): String = provider.cardId

            override fun outcome(): PlatformHealthProviderOutcome = kind.metricOutcome
        }
    }

    private enum class ProviderFailureKind(
        val reason: String,
        val metricOutcome: PlatformHealthProviderOutcome,
    ) {
        ERROR("provider_error", PlatformHealthProviderOutcome.ERROR),
        TIMEOUT("provider_timeout", PlatformHealthProviderOutcome.TIMEOUT),
        REJECTED("provider_rejected", PlatformHealthProviderOutcome.REJECTED),
    }
}
