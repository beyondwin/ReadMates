package com.readmates.admin.health.config

import com.readmates.admin.health.application.port.out.PrometheusQueryException
import com.readmates.admin.health.application.port.out.PrometheusQueryFailureKind
import com.readmates.admin.health.application.port.out.PrometheusQueryPort
import com.sun.net.httpserver.HttpServer
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.catchThrowable
import org.junit.jupiter.api.Test
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import tools.jackson.databind.ObjectMapper
import java.net.InetSocketAddress
import java.nio.charset.StandardCharsets
import java.time.Duration
import kotlin.system.measureTimeMillis

class PlatformAdminHealthTransportConfigTest {
    @Test
    fun `production prometheus transport enforces configured read timeout`() {
        val server = withholdingBodyServer(Duration.ofMillis(BODY_DELAY_MILLIS))
        server.start()
        try {
            ApplicationContextRunner()
                .withUserConfiguration(PlatformAdminHealthConfig::class.java)
                .withBean(ObjectMapper::class.java, { ObjectMapper() })
                .withPropertyValues(
                    "readmates.admin.health.provider-deadline=${PROVIDER_DEADLINE_MILLIS}ms",
                    "readmates.admin.health.prometheus.base-url=http://127.0.0.1:${server.address.port}",
                    "readmates.admin.health.prometheus.connect-timeout=100ms",
                    "readmates.admin.health.prometheus.connection-request-timeout=100ms",
                    "readmates.admin.health.prometheus.read-timeout=${READ_TIMEOUT_MILLIS}ms",
                ).run { context ->
                    assertThat(context).hasNotFailed()
                    val port = context.getBean(PrometheusQueryPort::class.java)
                    var thrown: Throwable? = null
                    val elapsedMillis =
                        measureTimeMillis {
                            thrown = catchThrowable { port.query("up") }
                        }

                    assertThat(elapsedMillis).isLessThan(PROVIDER_DEADLINE_MILLIS)
                    assertThat(thrown)
                        .isInstanceOf(PrometheusQueryException::class.java)
                        .extracting("kind")
                        .isEqualTo(PrometheusQueryFailureKind.TIMEOUT)
                }
        } finally {
            server.stop(0)
        }
    }

    private fun withholdingBodyServer(delay: Duration): HttpServer =
        HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
            createContext("/api/v1/query") { exchange ->
                val body =
                    """{"status":"success","data":{"resultType":"vector","result":[]}}"""
                        .toByteArray(StandardCharsets.UTF_8)
                exchange.responseHeaders.add("Content-Type", "application/json")
                exchange.sendResponseHeaders(200, body.size.toLong())
                Thread.sleep(delay.toMillis())
                exchange.responseBody.use { it.write(body) }
            }
        }

    private companion object {
        private const val READ_TIMEOUT_MILLIS = 100L
        private const val PROVIDER_DEADLINE_MILLIS = 600L
        private const val BODY_DELAY_MILLIS = 800L
    }
}
