package com.readmates.admin.health.config

import org.springframework.boot.context.properties.ConfigurationProperties
import java.net.URI
import java.time.Duration

private val DEFAULT_REFRESH_INTERVAL: Duration = Duration.ofSeconds(10)
private val DEFAULT_FRESHNESS: Duration = Duration.ofSeconds(30)
private val DEFAULT_PROVIDER_DEADLINE: Duration = Duration.ofMillis(2_500)
private val DEFAULT_EXECUTOR_SHUTDOWN_AWAIT: Duration = Duration.ofSeconds(5)
private val DEFAULT_PROMETHEUS_CONNECT_TIMEOUT: Duration = Duration.ofMillis(500)
private val DEFAULT_PROMETHEUS_CONNECTION_REQUEST_TIMEOUT: Duration = Duration.ofMillis(500)
private val DEFAULT_PROMETHEUS_READ_TIMEOUT: Duration = Duration.ofSeconds(2)
private const val MIN_EXECUTOR_THREADS = 1
private const val MAX_EXECUTOR_THREADS = 16
private const val MIN_EXECUTOR_QUEUE_CAPACITY = 1
private const val MAX_EXECUTOR_QUEUE_CAPACITY = 1_024

@ConfigurationProperties(prefix = "readmates.admin.health")
data class PlatformAdminHealthProperties(
    val refreshInterval: Duration = DEFAULT_REFRESH_INTERVAL,
    val freshness: Duration = DEFAULT_FRESHNESS,
    val providerDeadline: Duration = DEFAULT_PROVIDER_DEADLINE,
    val executor: Executor = Executor(),
    val prometheus: Prometheus = Prometheus(),
) {
    init {
        requirePositive("refresh-interval", refreshInterval)
        requirePositive("freshness", freshness)
        requirePositive("provider-deadline", providerDeadline)
        require(refreshInterval < freshness) {
            "readmates.admin.health.refresh-interval must be less than freshness"
        }
        require(prometheus.connectTimeout <= providerDeadline) {
            "readmates.admin.health.prometheus.connect-timeout must not exceed provider-deadline"
        }
        require(prometheus.connectionRequestTimeout <= providerDeadline) {
            "readmates.admin.health.prometheus.connection-request-timeout must not exceed provider-deadline"
        }
        require(prometheus.readTimeout <= providerDeadline) {
            "readmates.admin.health.prometheus.read-timeout must not exceed provider-deadline"
        }
    }

    data class Executor(
        val threads: Int = 4,
        val queueCapacity: Int = 16,
        val shutdownAwait: Duration = DEFAULT_EXECUTOR_SHUTDOWN_AWAIT,
    ) {
        init {
            require(threads in MIN_EXECUTOR_THREADS..MAX_EXECUTOR_THREADS) {
                "readmates.admin.health.executor.threads must be between 1 and 16"
            }
            require(queueCapacity in MIN_EXECUTOR_QUEUE_CAPACITY..MAX_EXECUTOR_QUEUE_CAPACITY) {
                "readmates.admin.health.executor.queue-capacity must be between 1 and 1024"
            }
            requirePositive("executor.shutdown-await", shutdownAwait)
        }
    }

    data class Prometheus(
        val baseUrl: URI = URI.create("http://prometheus:9090"),
        val connectTimeout: Duration = DEFAULT_PROMETHEUS_CONNECT_TIMEOUT,
        val connectionRequestTimeout: Duration = DEFAULT_PROMETHEUS_CONNECTION_REQUEST_TIMEOUT,
        val readTimeout: Duration = DEFAULT_PROMETHEUS_READ_TIMEOUT,
    ) {
        init {
            require(
                baseUrl.isAbsolute &&
                    baseUrl.scheme.lowercase() in setOf("http", "https") &&
                    !baseUrl.host.isNullOrBlank(),
            ) {
                "readmates.admin.health.prometheus.base-url must be an absolute http or https URL"
            }
            requirePositive("prometheus.connect-timeout", connectTimeout)
            requirePositive("prometheus.connection-request-timeout", connectionRequestTimeout)
            requirePositive("prometheus.read-timeout", readTimeout)
        }
    }

    private companion object {
        fun requirePositive(
            property: String,
            value: Duration,
        ) {
            require(!value.isZero && !value.isNegative) {
                "readmates.admin.health.$property must be positive"
            }
        }
    }
}
