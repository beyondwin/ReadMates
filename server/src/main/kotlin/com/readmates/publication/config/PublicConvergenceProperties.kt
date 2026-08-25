package com.readmates.publication.config

import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration
import java.time.Duration

private const val DEFAULT_SCHEDULER_DELAY_SECONDS = 15L
private const val DEFAULT_BATCH_SIZE = 10
private const val DEFAULT_MAX_ATTEMPTS = 5
private const val DEFAULT_LEASE_SECONDS = 30L
private const val DEFAULT_INITIAL_BACKOFF_SECONDS = 10L
private const val DEFAULT_MAX_BACKOFF_MINUTES = 2L
private const val DEFAULT_REQUEST_TIMEOUT_SECONDS = 5L
private const val MIN_BATCH_SIZE = 1
private const val MAX_BATCH_SIZE = 100
private const val MIN_ATTEMPTS = 1
private const val MAX_ATTEMPTS = 10

@ConfigurationProperties(prefix = "readmates.public-convergence")
data class PublicConvergenceProperties(
    val enabled: Boolean = false,
    val schedulerFixedDelay: Duration = Duration.ofSeconds(DEFAULT_SCHEDULER_DELAY_SECONDS),
    val batchSize: Int = DEFAULT_BATCH_SIZE,
    val maxAttempts: Int = DEFAULT_MAX_ATTEMPTS,
    val leaseDuration: Duration = Duration.ofSeconds(DEFAULT_LEASE_SECONDS),
    val initialBackoff: Duration = Duration.ofSeconds(DEFAULT_INITIAL_BACKOFF_SECONDS),
    val maxBackoff: Duration = Duration.ofMinutes(DEFAULT_MAX_BACKOFF_MINUTES),
    val requestTimeout: Duration = Duration.ofSeconds(DEFAULT_REQUEST_TIMEOUT_SECONDS),
    val endpoint: String = "",
    val bearerToken: String = "",
) {
    init {
        require(batchSize in MIN_BATCH_SIZE..MAX_BATCH_SIZE)
        require(maxAttempts in MIN_ATTEMPTS..MAX_ATTEMPTS)
        require(!leaseDuration.isZero && !leaseDuration.isNegative)
        require(!initialBackoff.isZero && !initialBackoff.isNegative)
        require(maxBackoff >= initialBackoff)
        require(!requestTimeout.isZero && !requestTimeout.isNegative)
    }
}

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(PublicConvergenceProperties::class)
class PublicConvergenceConfiguration
