package com.readmates.admin.health.config

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import tools.jackson.databind.ObjectMapper

class PlatformAdminHealthPropertiesTest {
    private val contextRunner =
        ApplicationContextRunner()
            .withUserConfiguration(PlatformAdminHealthConfig::class.java)
            .withBean(ObjectMapper::class.java, { ObjectMapper() })

    @ParameterizedTest(name = "rejects {0}")
    @MethodSource("invalidProperties")
    fun `invalid admin health properties fail application startup`(property: String) {
        contextRunner.withPropertyValues(property).run { context ->
            assertThat(context).hasFailed()
        }
    }

    @Test
    fun `default admin health properties bind to the approved contract`() {
        contextRunner.run { context ->
            assertThat(context).hasNotFailed()
            assertThat(context).hasSingleBean(PlatformAdminHealthProperties::class.java)

            val properties = context.getBean(PlatformAdminHealthProperties::class.java)
            assertThat(properties.refreshInterval).isEqualTo(java.time.Duration.ofSeconds(10))
            assertThat(properties.freshness).isEqualTo(java.time.Duration.ofSeconds(30))
            assertThat(properties.providerDeadline).isEqualTo(java.time.Duration.ofMillis(2_500))
            assertThat(properties.executor.threads).isEqualTo(4)
            assertThat(properties.executor.queueCapacity).isEqualTo(16)
            assertThat(properties.executor.shutdownAwait).isEqualTo(java.time.Duration.ofSeconds(5))
            assertThat(properties.prometheus.baseUrl.toString()).isEqualTo("http://prometheus:9090")
            assertThat(properties.prometheus.connectTimeout).isEqualTo(java.time.Duration.ofMillis(500))
            assertThat(properties.prometheus.connectionRequestTimeout).isEqualTo(java.time.Duration.ofMillis(500))
            assertThat(properties.prometheus.readTimeout).isEqualTo(java.time.Duration.ofSeconds(2))
        }
    }

    companion object {
        @JvmStatic
        fun invalidProperties(): List<String> =
            listOf(
                "readmates.admin.health.refresh-interval=0s",
                "readmates.admin.health.refresh-interval=-1s",
                "readmates.admin.health.freshness=0s",
                "readmates.admin.health.freshness=-1s",
                "readmates.admin.health.provider-deadline=0s",
                "readmates.admin.health.provider-deadline=-1s",
                "readmates.admin.health.executor.threads=0",
                "readmates.admin.health.executor.threads=17",
                "readmates.admin.health.executor.queue-capacity=0",
                "readmates.admin.health.executor.queue-capacity=1025",
                "readmates.admin.health.executor.shutdown-await=0s",
                "readmates.admin.health.executor.shutdown-await=-1s",
                "readmates.admin.health.prometheus.connect-timeout=0s",
                "readmates.admin.health.prometheus.connect-timeout=-1s",
                "readmates.admin.health.prometheus.connection-request-timeout=0s",
                "readmates.admin.health.prometheus.connection-request-timeout=-1s",
                "readmates.admin.health.prometheus.read-timeout=0s",
                "readmates.admin.health.prometheus.read-timeout=-1s",
                "readmates.admin.health.refresh-interval=30s",
                "readmates.admin.health.refresh-interval=31s",
                "readmates.admin.health.prometheus.connect-timeout=2501ms",
                "readmates.admin.health.prometheus.connection-request-timeout=2501ms",
                "readmates.admin.health.prometheus.read-timeout=2501ms",
                "readmates.admin.health.prometheus.base-url=prometheus:9090",
                "readmates.admin.health.prometheus.base-url=http:/prometheus",
                "readmates.admin.health.prometheus.base-url=ftp://prometheus.example.com",
            )
    }
}
