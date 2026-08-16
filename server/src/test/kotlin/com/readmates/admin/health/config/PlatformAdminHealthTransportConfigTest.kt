package com.readmates.admin.health.config

import com.readmates.admin.health.application.port.out.PrometheusQueryException
import com.readmates.admin.health.application.port.out.PrometheusQueryFailureKind
import com.readmates.admin.health.application.port.out.PrometheusQueryPort
import com.sun.net.httpserver.HttpServer
import org.apache.hc.client5.http.classic.methods.HttpGet
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient
import org.apache.hc.client5.http.protocol.HttpClientContext
import org.apache.hc.core5.http.io.support.ClassicResponseBuilder
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.assertj.core.api.Assertions.catchThrowable
import org.junit.jupiter.api.Test
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import tools.jackson.databind.ObjectMapper
import java.net.InetSocketAddress
import java.nio.charset.StandardCharsets
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import kotlin.system.measureTimeMillis

class PlatformAdminHealthTransportConfigTest {
    @Test
    fun `production prometheus transport enforces configured read timeout`() {
        WithholdingBodyServer().use { server ->
            ApplicationContextRunner()
                .withUserConfiguration(PlatformAdminHealthConfig::class.java)
                .withBean(ObjectMapper::class.java, { ObjectMapper() })
                .withPropertyValues(
                    "readmates.admin.health.provider-deadline=${PROVIDER_DEADLINE_MILLIS}ms",
                    "readmates.admin.health.prometheus.base-url=${server.baseUrl}",
                    "readmates.admin.health.prometheus.connect-timeout=100ms",
                    "readmates.admin.health.prometheus.connection-request-timeout=100ms",
                    "readmates.admin.health.prometheus.read-timeout=${READ_TIMEOUT_MILLIS}ms",
                ).run { context ->
                    assertThat(context).hasNotFailed()
                    val port = context.getBean(PrometheusQueryPort::class.java)
                    val properties = context.getBean(PlatformAdminHealthProperties::class.java)
                    val thrown = catchThrowable { port.query("up") }

                    assertThat(properties.prometheus.readTimeout.compareTo(properties.providerDeadline)).isNegative()
                    assertThat(thrown)
                        .isInstanceOf(PrometheusQueryException::class.java)
                        .extracting("kind")
                        .isEqualTo(PrometheusQueryFailureKind.TIMEOUT)
                    assertThat(server.bodyWriteStarted()).isFalse()
                }
        }
    }

    @Test
    fun `connection request timeout is enforced when the local route pool is starved`() {
        PoolStarvationServer().use { server ->
            ApplicationContextRunner()
                .withUserConfiguration(PlatformAdminHealthConfig::class.java)
                .withBean(ObjectMapper::class.java, { ObjectMapper() })
                .withPropertyValues(
                    "readmates.admin.health.provider-deadline=5s",
                    "readmates.admin.health.prometheus.base-url=${server.baseUrl}",
                    "readmates.admin.health.prometheus.connect-timeout=100ms",
                    "readmates.admin.health.prometheus.connection-request-timeout=100ms",
                    "readmates.admin.health.prometheus.read-timeout=5s",
                ).run { context ->
                    assertThat(context).hasNotFailed()
                    val port = context.getBean(PrometheusQueryPort::class.java)
                    val occupyingCalls =
                        (1..DEFAULT_MAX_CONNECTIONS_PER_ROUTE).map {
                            CompletableFuture.supplyAsync { catchThrowable { port.query("up") } }
                        }
                    assertThat(server.awaitAccepted(DEFAULT_MAX_CONNECTIONS_PER_ROUTE)).isTrue()

                    var thrown: Throwable? = null
                    val elapsedMillis = measureTimeMillis { thrown = catchThrowable { port.query("up") } }

                    assertFailure(thrown, PrometheusQueryFailureKind.TIMEOUT)
                    assertThat(elapsedMillis).isLessThan(POOL_TIMEOUT_UPPER_BOUND_MILLIS)
                    assertThat(server.acceptedRequests()).isEqualTo(DEFAULT_MAX_CONNECTIONS_PER_ROUTE)
                    server.releaseBodies()
                    occupyingCalls.forEach { call -> assertThat(call.get(1, TimeUnit.SECONDS)).isNull() }
                }
        }
    }

    @Test
    fun `application context close makes the managed closeable http client unusable`() {
        val server = immediateSuccessServer()
        server.start()
        try {
            val capturedClient = AtomicReference<CloseableHttpClient>()
            ApplicationContextRunner()
                .withUserConfiguration(PlatformAdminHealthConfig::class.java)
                .withBean(ObjectMapper::class.java, { ObjectMapper() })
                .withPropertyValues(
                    "readmates.admin.health.prometheus.base-url=http://127.0.0.1:${server.address.port}",
                ).run { context ->
                    assertThat(context).hasNotFailed()
                    capturedClient.set(context.getBean(CloseableHttpClient::class.java))
                }

            assertThatThrownBy {
                capturedClient.get().execute(
                    HttpGet("http://127.0.0.1:${server.address.port}/api/v1/query?query=up"),
                    HttpClientContext.create(),
                ) { response -> ClassicResponseBuilder.copy(response).build() }
            }.isInstanceOf(IllegalStateException::class.java)
        } finally {
            server.stop(0)
        }
    }

    private fun immediateSuccessServer(): HttpServer =
        HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
            createContext("/api/v1/query") { exchange ->
                val body = PROMETHEUS_SUCCESS_BODY.toByteArray(StandardCharsets.UTF_8)
                exchange.responseHeaders.add("Content-Type", "application/json")
                exchange.sendResponseHeaders(200, body.size.toLong())
                exchange.responseBody.use { it.write(body) }
            }
        }

    private fun assertFailure(
        thrown: Throwable?,
        expectedKind: PrometheusQueryFailureKind,
    ) {
        assertThat(thrown)
            .isInstanceOf(PrometheusQueryException::class.java)
            .extracting("kind")
            .isEqualTo(expectedKind)
    }

    private class WithholdingBodyServer : AutoCloseable {
        private val bodyRelease = CountDownLatch(1)
        private val bodyWriteStarted = AtomicBoolean()
        private val server =
            HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
                createContext("/api/v1/query") { exchange ->
                    val body = PROMETHEUS_SUCCESS_BODY.toByteArray(StandardCharsets.UTF_8)
                    exchange.responseHeaders.add("Content-Type", "application/json")
                    exchange.sendResponseHeaders(200, body.size.toLong())
                    bodyRelease.await()
                    bodyWriteStarted.set(true)
                    exchange.responseBody.use { it.write(body) }
                }
                start()
            }

        val baseUrl: String = "http://127.0.0.1:${server.address.port}"

        fun bodyWriteStarted(): Boolean = bodyWriteStarted.get()

        override fun close() {
            bodyRelease.countDown()
            server.stop(0)
        }
    }

    private class PoolStarvationServer : AutoCloseable {
        private val accepted = AtomicInteger()
        private val acceptedLatch = CountDownLatch(DEFAULT_MAX_CONNECTIONS_PER_ROUTE)
        private val bodyRelease = CountDownLatch(1)
        private val executor: ExecutorService =
            Executors.newCachedThreadPool { runnable ->
                Thread(runnable, "admin-health-pool-test-http").apply { isDaemon = true }
            }
        private val server =
            HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
                this.executor = this@PoolStarvationServer.executor
                createContext("/api/v1/query") { exchange ->
                    accepted.incrementAndGet()
                    acceptedLatch.countDown()
                    val body = PROMETHEUS_SUCCESS_BODY.toByteArray(StandardCharsets.UTF_8)
                    exchange.responseHeaders.add("Content-Type", "application/json")
                    exchange.sendResponseHeaders(200, body.size.toLong())
                    check(bodyRelease.await(10, TimeUnit.SECONDS))
                    exchange.responseBody.use { it.write(body) }
                }
                start()
            }

        val baseUrl: String = "http://127.0.0.1:${server.address.port}"

        fun awaitAccepted(expected: Int): Boolean {
            check(expected == DEFAULT_MAX_CONNECTIONS_PER_ROUTE)
            return acceptedLatch.await(1, TimeUnit.SECONDS)
        }

        fun acceptedRequests(): Int = accepted.get()

        fun releaseBodies() {
            bodyRelease.countDown()
        }

        override fun close() {
            releaseBodies()
            server.stop(0)
            executor.shutdownNow()
        }
    }

    private companion object {
        private const val READ_TIMEOUT_MILLIS = 100L
        private const val PROVIDER_DEADLINE_MILLIS = 600L
        private const val DEFAULT_MAX_CONNECTIONS_PER_ROUTE = 5
        private const val POOL_TIMEOUT_UPPER_BOUND_MILLIS = 1_000L
        private const val PROMETHEUS_SUCCESS_BODY =
            """{"status":"success","data":{"resultType":"vector","result":[]}}"""
    }
}
