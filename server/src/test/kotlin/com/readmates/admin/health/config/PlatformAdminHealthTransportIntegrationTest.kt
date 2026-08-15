package com.readmates.admin.health.config

import com.readmates.admin.health.application.model.HealthCard
import com.readmates.admin.health.application.model.HealthCardSource
import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.model.PlatformHealthRefreshState
import com.readmates.admin.health.application.model.PlatformHealthRefreshTrigger
import com.readmates.admin.health.application.port.out.PlatformAdminHealthMetricsPort
import com.readmates.admin.health.application.port.out.PlatformHealthProvider
import com.readmates.admin.health.application.port.out.PlatformHealthProviderOutcome
import com.readmates.admin.health.application.port.out.PlatformHealthRefreshResult
import com.readmates.admin.health.application.port.out.PrometheusQueryPort
import com.readmates.admin.health.application.service.HealthCardProvider
import com.readmates.admin.health.application.service.PlatformAdminHealthService
import com.readmates.admin.health.application.service.providers.KafkaLagHealthCardProvider
import com.sun.net.httpserver.HttpServer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import tools.jackson.databind.ObjectMapper
import java.net.InetSocketAddress
import java.nio.charset.StandardCharsets
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executor
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

class PlatformAdminHealthTransportIntegrationTest {
    private val now = Instant.parse("2026-08-09T00:00:00Z")
    private val clock = Clock.fixed(now, ZoneOffset.UTC)

    @Test
    fun `real transport timeout after last known good preserves exact snapshot and records one timeout`() {
        LocalPrometheusServer().use { server ->
            withHealthContext(server) { context ->
                val metrics = RecordingTransportMetrics()
                val transportProvider =
                    KafkaLagHealthCardProvider(context.getBean(PrometheusQueryPort::class.java), clock)
                val service =
                    service(
                        SeedLastKnownGoodProvider(transportProvider, lastKnownGoodCard()),
                        context,
                        metrics,
                    )
                val lastKnownGood = service.currentHealth()

                val stale = service.refresh(PlatformHealthRefreshTrigger.SCHEDULED).get(1, TimeUnit.SECONDS)

                assertThat(stale.refreshState).isEqualTo(PlatformHealthRefreshState.STALE)
                assertThat(stale.snapshot).isSameAs(lastKnownGood.snapshot)
                assertThat(stale.lastSuccessfulAt).isEqualTo(lastKnownGood.lastSuccessfulAt)
                assertThat(stale.lastSuccessfulAt).isEqualTo(now)
                assertThat(metrics.providerOutcomes)
                    .containsExactly(
                        PlatformHealthProvider.KAFKA_CONSUMER_LAG to PlatformHealthProviderOutcome.SUCCESS,
                        PlatformHealthProvider.KAFKA_CONSUMER_LAG to PlatformHealthProviderOutcome.TIMEOUT,
                    )
            }
        }
    }

    @Test
    fun `real transport timeout before first success returns deterministic unavailable failure card`() {
        LocalPrometheusServer().use { server ->
            withHealthContext(server) { context ->
                val metrics = RecordingTransportMetrics()
                val service =
                    service(
                        KafkaLagHealthCardProvider(context.getBean(PrometheusQueryPort::class.java), clock),
                        context,
                        metrics,
                    )

                val unavailable = service.currentHealth()

                assertThat(unavailable.refreshState).isEqualTo(PlatformHealthRefreshState.UNAVAILABLE)
                assertThat(unavailable.lastSuccessfulAt).isNull()
                val card = unavailable.snapshot.cards.single()
                assertThat(card.id).isEqualTo("kafka_consumer_lag")
                assertThat(card.title).isEqualTo("kafka_consumer_lag")
                assertThat(card.status).isEqualTo(HealthCardStatus.UNKNOWN)
                assertThat(card.source).isEqualTo(HealthCardSource.IN_PROCESS)
                assertThat(card.reason).isEqualTo("provider_timeout")
                assertThat(card.lastCheckedAt).isEqualTo(now)
                assertThat(metrics.providerOutcomes)
                    .containsExactly(
                        PlatformHealthProvider.KAFKA_CONSUMER_LAG to PlatformHealthProviderOutcome.TIMEOUT,
                    )
            }
        }
    }

    private fun service(
        provider: HealthCardProvider,
        context: org.springframework.context.ApplicationContext,
        metrics: PlatformAdminHealthMetricsPort,
    ): PlatformAdminHealthService =
        PlatformAdminHealthService(
            providers = listOf(provider),
            clock = clock,
            executor = context.getBean("platformAdminHealthExecutor", Executor::class.java),
            properties = context.getBean(PlatformAdminHealthProperties::class.java),
            metrics = metrics,
        )

    private fun lastKnownGoodCard(): HealthCard =
        HealthCard(
            id = PlatformHealthProvider.KAFKA_CONSUMER_LAG.cardId,
            title = "Kafka consumer lag",
            status = HealthCardStatus.OK,
            metric = null,
            thresholds = null,
            lastCheckedAt = now,
            source = HealthCardSource.PROMETHEUS,
            drill = null,
            reason = null,
        )

    private fun withHealthContext(
        server: LocalPrometheusServer,
        assertion: (org.springframework.context.ApplicationContext) -> Unit,
    ) {
        ApplicationContextRunner()
            .withUserConfiguration(PlatformAdminHealthConfig::class.java)
            .withBean(ObjectMapper::class.java, { ObjectMapper() })
            .withPropertyValues(
                "readmates.admin.health.provider-deadline=600ms",
                "readmates.admin.health.prometheus.base-url=${server.baseUrl}",
                "readmates.admin.health.prometheus.connect-timeout=50ms",
                "readmates.admin.health.prometheus.connection-request-timeout=50ms",
                "readmates.admin.health.prometheus.read-timeout=100ms",
            ).run { context ->
                assertThat(context).hasNotFailed()
                assertion(context)
            }
    }

    private class SeedLastKnownGoodProvider(
        private val delegate: HealthCardProvider,
        private val lastKnownGood: HealthCard,
    ) : HealthCardProvider {
        private val invocationCount = AtomicInteger()

        override val identity: PlatformHealthProvider = delegate.identity

        override fun compute(): HealthCard =
            if (invocationCount.incrementAndGet() == 1) {
                lastKnownGood
            } else {
                delegate.compute()
            }
    }

    private class LocalPrometheusServer : AutoCloseable {
        private val bodyRelease = CountDownLatch(1)
        private val executor: ExecutorService =
            Executors.newCachedThreadPool { runnable ->
                Thread(runnable, "admin-health-test-http").apply { isDaemon = true }
            }
        private val server =
            HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
                this.executor = this@LocalPrometheusServer.executor
                createContext("/api/v1/query") { exchange ->
                    val body = PROMETHEUS_SUCCESS_BODY.toByteArray(StandardCharsets.UTF_8)
                    exchange.responseHeaders.add("Content-Type", "application/json")
                    exchange.sendResponseHeaders(200, body.size.toLong())
                    bodyRelease.await()
                    exchange.responseBody.use { response -> response.write(body) }
                }
                start()
            }

        val baseUrl: String = "http://127.0.0.1:${server.address.port}"

        override fun close() {
            bodyRelease.countDown()
            server.stop(0)
            executor.shutdownNow()
        }

        private companion object {
            const val PROMETHEUS_SUCCESS_BODY =
                """{"status":"success","data":{"resultType":"vector","result":[{"metric":{},"value":[1717000000,"0"]}]}}"""
        }
    }
}

private class RecordingTransportMetrics : PlatformAdminHealthMetricsPort {
    val providerOutcomes = mutableListOf<Pair<PlatformHealthProvider, PlatformHealthProviderOutcome>>()

    override fun recordProviderOutcome(
        provider: PlatformHealthProvider,
        result: PlatformHealthProviderOutcome,
    ) {
        providerOutcomes += provider to result
    }

    override fun recordRefreshOverlap(trigger: PlatformHealthRefreshTrigger) = Unit

    override fun recordRefreshDuration(
        result: PlatformHealthRefreshResult,
        duration: Duration,
    ) = Unit

    override fun updateStaleAge(seconds: Long) = Unit
}
