package com.readmates.admin.health.application.service.providers

import com.readmates.admin.health.application.model.DeployAttemptStripEntry
import com.readmates.admin.health.application.port.out.DeployLedgerPort
import com.readmates.admin.health.application.port.out.PlatformHealthProvider
import com.readmates.admin.health.application.port.out.PromQueryResult
import com.readmates.admin.health.application.port.out.PrometheusQueryPort
import com.readmates.admin.health.application.service.HealthCardProvider
import com.readmates.shared.adapter.out.resilience.OutboundCircuitBreakers
import com.readmates.shared.adapter.out.resilience.OutboundResilienceProperties
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.ObjectProvider
import java.time.Clock
import java.time.Duration

class PlatformHealthProviderIdentityTest {
    @Test
    fun `production provider inventory is a bijection with typed provider identities`() {
        val providers = productionProviders()

        assertThat(providers.map(HealthCardProvider::identity))
            .containsExactlyInAnyOrderElementsOf(PlatformHealthProvider.entries)
        assertThat(providers.map(HealthCardProvider::cardId)).doesNotHaveDuplicates()
    }

    private fun productionProviders(): List<HealthCardProvider> {
        val clock = Clock.systemUTC()
        val prometheus =
            object : PrometheusQueryPort {
                override fun query(promql: String): PromQueryResult = PromQueryResult(emptyList())
            }
        val deployLedger =
            object : DeployLedgerPort {
                override fun tailLatestAttempts(limit: Int): List<DeployAttemptStripEntry> = emptyList()
            }
        val readings = localReadings()
        return listOf(
            AiProviderAvailabilityCardProvider(prometheus, clock),
            DbPoolHealthCardProvider(readings, clock),
            DeployAttemptsStripCardProvider(deployLedger, clock),
            KafkaLagHealthCardProvider(prometheus, clock),
            NotificationDispatchSuccessCardProvider(prometheus, clock),
            OutboundResilienceHealthCardProvider(outboundCircuitBreakers(), clock),
            OutboxBacklogHealthCardProvider(readings, clock),
            RedisHealthCardProvider(readings, clock),
        )
    }

    private fun outboundCircuitBreakers(): OutboundCircuitBreakers =
        OutboundCircuitBreakers(
            properties =
                OutboundResilienceProperties(
                    slidingWindowSize = 2,
                    minimumNumberOfCalls = 2,
                    waitDurationInOpenState = Duration.ofSeconds(60),
                ),
            meterRegistryProvider =
                object : ObjectProvider<MeterRegistry> {
                    private val registry = SimpleMeterRegistry()

                    override fun getObject(): MeterRegistry = registry

                    override fun getObject(vararg args: Any?): MeterRegistry = registry

                    override fun getIfAvailable(): MeterRegistry = registry

                    override fun getIfUnique(): MeterRegistry = registry
                },
        )
}
