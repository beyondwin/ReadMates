package com.readmates.publication.config

import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration
import java.time.Duration

@ConfigurationProperties(prefix = "readmates.public-convergence")
data class PublicConvergenceProperties(
    val enabled: Boolean = false,
    val schedulerFixedDelay: Duration = Duration.ofSeconds(15),
    val batchSize: Int = 10,
    val maxAttempts: Int = 5,
    val leaseDuration: Duration = Duration.ofSeconds(30),
    val initialBackoff: Duration = Duration.ofSeconds(10),
    val maxBackoff: Duration = Duration.ofMinutes(2),
    val requestTimeout: Duration = Duration.ofSeconds(5),
    val endpoint: String = "",
    val bearerToken: String = "",
) {
    init {
        require(batchSize in 1..100)
        require(maxAttempts in 1..10)
        require(!leaseDuration.isZero && !leaseDuration.isNegative)
        require(!initialBackoff.isZero && !initialBackoff.isNegative)
        require(maxBackoff >= initialBackoff)
        require(!requestTimeout.isZero && !requestTimeout.isNegative)
    }
}

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(PublicConvergenceProperties::class)
class PublicConvergenceConfiguration
