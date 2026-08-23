package com.readmates.publication.config

import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration
import java.net.URI
import java.time.Duration

@ConfigurationProperties("readmates.public-convergence")
data class PublicConvergenceProperties(
    val enabled: Boolean = false,
    val leaseDuration: Duration = Duration.ofSeconds(DEFAULT_LEASE_SECONDS),
    val terminalWriteSafetyMargin: Duration = Duration.ofSeconds(DEFAULT_TERMINAL_WRITE_SAFETY_MARGIN_SECONDS),
    val maxAttempts: Int = DEFAULT_MAX_ATTEMPTS,
    val initialBackoff: Duration = Duration.ofSeconds(DEFAULT_INITIAL_BACKOFF_SECONDS),
    val maxBackoff: Duration = Duration.ofMinutes(DEFAULT_MAX_BACKOFF_MINUTES),
    val scheduler: Scheduler = Scheduler(),
    val provider: Provider = Provider(),
) {
    init {
        require(
            !leaseDuration.isNegative &&
                !leaseDuration.isZero &&
                leaseDuration <= Duration.ofMinutes(MAX_LEASE_MINUTES),
        ) {
            "Public convergence lease duration must be between 1ns and 5m"
        }
        require(maxAttempts in MIN_ATTEMPTS..MAX_ATTEMPTS) {
            "Public convergence max attempts must be between 1 and 10"
        }
        require(!initialBackoff.isNegative && !initialBackoff.isZero) {
            "Public convergence initial backoff must be positive"
        }
        require(maxBackoff >= initialBackoff && maxBackoff <= Duration.ofHours(MAX_BACKOFF_HOURS)) {
            "Public convergence max backoff must be between initial backoff and 1h"
        }
        require(
            !terminalWriteSafetyMargin.isNegative &&
                !terminalWriteSafetyMargin.isZero &&
                terminalWriteSafetyMargin <= Duration.ofSeconds(MAX_TERMINAL_WRITE_SAFETY_MARGIN_SECONDS),
        ) {
            "Public convergence terminal write safety margin must be between 1ns and 30s"
        }
        if (provider.httpEnabled) {
            val boundedProviderBudget = provider.connectTimeout + provider.readTimeout + terminalWriteSafetyMargin
            require(leaseDuration > boundedProviderBudget) {
                "Public convergence lease duration must exceed provider call budget plus terminal write safety margin"
            }
        }
    }

    data class Scheduler(
        val enabled: Boolean = false,
        val fixedDelay: Duration = Duration.ofSeconds(DEFAULT_SCHEDULER_DELAY_SECONDS),
        val batchSize: Int = DEFAULT_BATCH_SIZE,
        val workerId: String = "public-convergence-scheduler",
    ) {
        init {
            require(
                !fixedDelay.isNegative &&
                    !fixedDelay.isZero &&
                    fixedDelay <= Duration.ofMinutes(MAX_SCHEDULER_DELAY_MINUTES),
            ) {
                "Public convergence scheduler delay must be between 1ns and 10m"
            }
            require(batchSize in MIN_BATCH_SIZE..MAX_BATCH_SIZE) {
                "Public convergence scheduler batch size must be between 1 and 100"
            }
            require(Regex("^[A-Za-z0-9._-]{1,128}$").matches(workerId)) {
                "Public convergence scheduler worker id is invalid"
            }
        }
    }

    data class Provider(
        val httpEnabled: Boolean = false,
        val endpoint: URI? = null,
        val credential: String = "",
        val connectTimeout: Duration = Duration.ofSeconds(DEFAULT_CONNECT_TIMEOUT_SECONDS),
        val readTimeout: Duration = Duration.ofSeconds(DEFAULT_READ_TIMEOUT_SECONDS),
    ) {
        init {
            require(
                !connectTimeout.isNegative &&
                    !connectTimeout.isZero &&
                    connectTimeout <= Duration.ofSeconds(MAX_CONNECT_TIMEOUT_SECONDS),
            ) {
                "Public convergence provider connect timeout must be between 1ns and 10s"
            }
            require(
                !readTimeout.isNegative &&
                    !readTimeout.isZero &&
                    readTimeout <= Duration.ofSeconds(MAX_READ_TIMEOUT_SECONDS),
            ) {
                "Public convergence provider read timeout must be between 1ns and 30s"
            }
            if (httpEnabled) {
                require(endpoint?.scheme == "https" && endpoint.host != null && endpoint.userInfo == null) {
                    "Public convergence provider endpoint must be an HTTPS URI without user info"
                }
                require(credential.isNotBlank() && credential.length <= MAX_CREDENTIAL_LENGTH) {
                    "Public convergence provider credential is required and bounded"
                }
            }
        }
    }
}

@Configuration
@EnableConfigurationProperties(PublicConvergenceProperties::class)
class PublicConvergenceConfiguration

private const val DEFAULT_LEASE_SECONDS = 30L
private const val MAX_LEASE_MINUTES = 5L
private const val DEFAULT_TERMINAL_WRITE_SAFETY_MARGIN_SECONDS = 5L
private const val MAX_TERMINAL_WRITE_SAFETY_MARGIN_SECONDS = 30L
private const val DEFAULT_MAX_ATTEMPTS = 5
private const val MIN_ATTEMPTS = 1
private const val MAX_ATTEMPTS = 10
private const val DEFAULT_INITIAL_BACKOFF_SECONDS = 15L
private const val DEFAULT_MAX_BACKOFF_MINUTES = 15L
private const val MAX_BACKOFF_HOURS = 1L
private const val DEFAULT_SCHEDULER_DELAY_SECONDS = 30L
private const val MAX_SCHEDULER_DELAY_MINUTES = 10L
private const val DEFAULT_BATCH_SIZE = 20
private const val MIN_BATCH_SIZE = 1
private const val MAX_BATCH_SIZE = 100
private const val DEFAULT_CONNECT_TIMEOUT_SECONDS = 1L
private const val DEFAULT_READ_TIMEOUT_SECONDS = 3L
private const val MAX_CONNECT_TIMEOUT_SECONDS = 10L
private const val MAX_READ_TIMEOUT_SECONDS = 30L
private const val MAX_CREDENTIAL_LENGTH = 4096
