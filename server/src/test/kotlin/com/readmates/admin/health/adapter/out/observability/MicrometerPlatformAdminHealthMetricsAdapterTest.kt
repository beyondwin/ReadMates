package com.readmates.admin.health.adapter.out.observability

import com.readmates.admin.health.application.model.PlatformHealthRefreshTrigger
import com.readmates.admin.health.application.port.out.PlatformHealthProvider
import com.readmates.admin.health.application.port.out.PlatformHealthProviderOutcome
import com.readmates.admin.health.application.port.out.PlatformHealthRefreshResult
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Duration
import java.util.concurrent.TimeUnit

class MicrometerPlatformAdminHealthMetricsAdapterTest {
    @Test
    fun `records exact bounded provider overlap duration and current stale age meters`() {
        val registry = SimpleMeterRegistry()
        val adapter = MicrometerPlatformAdminHealthMetricsAdapter(registry)

        PlatformHealthProvider.entries.forEach { provider ->
            PlatformHealthProviderOutcome.entries.forEach { result ->
                adapter.recordProviderOutcome(provider, result)
            }
        }
        PlatformHealthRefreshTrigger.entries.forEach(adapter::recordRefreshOverlap)
        PlatformHealthRefreshResult.entries.forEach { result ->
            adapter.recordRefreshDuration(result, Duration.ofMillis(250))
        }
        adapter.updateStaleAge(12)
        adapter.updateStaleAge(7)

        assertThat(registry.meters.map { meter -> meter.id.name }.toSet())
            .containsExactlyInAnyOrder(
                "readmates.admin.health.provider.outcomes",
                "readmates.admin.health.refresh.overlap",
                "readmates.admin.health.refresh.duration",
                "readmates.admin.health.snapshot.stale.age.seconds",
            )
        assertThat(tagKeys(registry, "readmates.admin.health.provider.outcomes"))
            .containsExactlyInAnyOrder("provider", "result")
        assertThat(tagValues(registry, "readmates.admin.health.provider.outcomes", "provider"))
            .containsExactlyInAnyOrderElementsOf(PlatformHealthProvider.entries.map(PlatformHealthProvider::cardId))
        assertThat(tagValues(registry, "readmates.admin.health.provider.outcomes", "result"))
            .containsExactlyInAnyOrderElementsOf(PlatformHealthProviderOutcome.entries.map(Enum<*>::name))
        assertThat(tagKeys(registry, "readmates.admin.health.refresh.overlap")).containsExactly("trigger")
        assertThat(tagValues(registry, "readmates.admin.health.refresh.overlap", "trigger"))
            .containsExactlyInAnyOrder("LAZY", "SCHEDULED")
        assertThat(tagKeys(registry, "readmates.admin.health.refresh.duration")).containsExactly("result")
        assertThat(tagValues(registry, "readmates.admin.health.refresh.duration", "result"))
            .containsExactlyInAnyOrder("FRESH", "STALE", "UNAVAILABLE")
        assertThat(tagKeys(registry, "readmates.admin.health.snapshot.stale.age.seconds")).isEmpty()
        assertThat(registry.get("readmates.admin.health.snapshot.stale.age.seconds").gauge().value()).isEqualTo(7.0)

        val timeout =
            registry
                .get("readmates.admin.health.provider.outcomes")
                .tags("provider", "redis", "result", "TIMEOUT")
                .counter()
        val rejection =
            registry
                .get("readmates.admin.health.provider.outcomes")
                .tags("provider", "db_pool", "result", "REJECTED")
                .counter()
        assertThat(timeout.count()).isEqualTo(1.0)
        assertThat(rejection.count()).isEqualTo(1.0)
        val freshDuration =
            registry
                .get("readmates.admin.health.refresh.duration")
                .tag("result", "FRESH")
                .timer()
        assertThat(freshDuration.count()).isEqualTo(1)
        assertThat(freshDuration.totalTime(TimeUnit.MILLISECONDS)).isEqualTo(250.0)
    }

    @Test
    fun `fixed meters are reused and stale age is clamped to zero`() {
        val registry = SimpleMeterRegistry()
        val adapter = MicrometerPlatformAdminHealthMetricsAdapter(registry)

        repeat(2) {
            adapter.recordProviderOutcome(PlatformHealthProvider.REDIS, PlatformHealthProviderOutcome.SUCCESS)
            adapter.recordRefreshOverlap(PlatformHealthRefreshTrigger.LAZY)
            adapter.recordRefreshDuration(PlatformHealthRefreshResult.FRESH, Duration.ofSeconds(1))
        }
        adapter.updateStaleAge(-1)

        assertThat(
            registry
                .find("readmates.admin.health.provider.outcomes")
                .tags("provider", "redis", "result", "SUCCESS")
                .meters()
                .count(),
        ).isEqualTo(1)
        assertThat(
            registry
                .get("readmates.admin.health.provider.outcomes")
                .tags("provider", "redis", "result", "SUCCESS")
                .counter()
                .count(),
        ).isEqualTo(2.0)
        assertThat(registry.get("readmates.admin.health.snapshot.stale.age.seconds").gauge().value()).isZero()
    }

    private fun tagKeys(
        registry: SimpleMeterRegistry,
        name: String,
    ): Set<String> =
        registry
            .find(name)
            .meters()
            .flatMap { meter -> meter.id.tags.map { tag -> tag.key } }
            .toSet()

    private fun tagValues(
        registry: SimpleMeterRegistry,
        name: String,
        key: String,
    ): Set<String> =
        registry
            .find(name)
            .meters()
            .flatMap { meter ->
                meter.id.tags
                    .filter { tag -> tag.key == key }
                    .map { tag -> tag.value }
            }.toSet()
}
