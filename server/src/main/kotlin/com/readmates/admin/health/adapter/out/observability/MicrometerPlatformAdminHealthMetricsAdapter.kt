package com.readmates.admin.health.adapter.out.observability

import com.readmates.admin.health.application.model.PlatformHealthRefreshTrigger
import com.readmates.admin.health.application.port.out.PlatformAdminHealthMetricsPort
import com.readmates.admin.health.application.port.out.PlatformHealthProvider
import com.readmates.admin.health.application.port.out.PlatformHealthProviderOutcome
import com.readmates.admin.health.application.port.out.PlatformHealthRefreshResult
import io.micrometer.core.instrument.Counter
import io.micrometer.core.instrument.Gauge
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.Timer
import org.springframework.stereotype.Component
import java.time.Duration
import java.util.concurrent.atomic.AtomicLong

@Component
class MicrometerPlatformAdminHealthMetricsAdapter(
    meterRegistry: MeterRegistry,
) : PlatformAdminHealthMetricsPort {
    private val providerOutcomes =
        PlatformHealthProvider.entries
            .flatMap { provider ->
                PlatformHealthProviderOutcome.entries.map { result ->
                    (provider to result) to
                        Counter
                            .builder(PROVIDER_OUTCOME_METRIC)
                            .tag(PROVIDER_TAG, provider.cardId)
                            .tag(RESULT_TAG, result.name)
                            .register(meterRegistry)
                }
            }.toMap()
    private val refreshOverlaps =
        PlatformHealthRefreshTrigger.entries.associateWith { trigger ->
            Counter
                .builder(REFRESH_OVERLAP_METRIC)
                .tag(TRIGGER_TAG, trigger.name)
                .register(meterRegistry)
        }
    private val refreshDurations =
        PlatformHealthRefreshResult.entries.associateWith { result ->
            Timer
                .builder(REFRESH_DURATION_METRIC)
                .tag(RESULT_TAG, result.name)
                .register(meterRegistry)
        }
    private val staleAge =
        AtomicLong().also { value ->
            Gauge
                .builder(STALE_AGE_METRIC, value) { current -> current.get().toDouble() }
                .register(meterRegistry)
        }

    override fun recordProviderOutcome(
        provider: PlatformHealthProvider,
        result: PlatformHealthProviderOutcome,
    ) {
        providerOutcomes.getValue(provider to result).increment()
    }

    override fun recordRefreshOverlap(trigger: PlatformHealthRefreshTrigger) {
        refreshOverlaps.getValue(trigger).increment()
    }

    override fun recordRefreshDuration(
        result: PlatformHealthRefreshResult,
        duration: Duration,
    ) {
        refreshDurations.getValue(result).record(nonNegative(duration))
    }

    override fun updateStaleAge(seconds: Long) {
        staleAge.set(seconds.coerceAtLeast(0))
    }

    private fun nonNegative(duration: Duration): Duration = if (duration.isNegative) Duration.ZERO else duration

    private companion object {
        const val PROVIDER_OUTCOME_METRIC = "readmates.admin.health.provider.outcomes"
        const val REFRESH_OVERLAP_METRIC = "readmates.admin.health.refresh.overlap"
        const val REFRESH_DURATION_METRIC = "readmates.admin.health.refresh.duration"
        const val STALE_AGE_METRIC = "readmates.admin.health.snapshot.stale.age.seconds"
        const val PROVIDER_TAG = "provider"
        const val RESULT_TAG = "result"
        const val TRIGGER_TAG = "trigger"
    }
}
