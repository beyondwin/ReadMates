package com.readmates.shared.adminmutation.config

import jakarta.annotation.PostConstruct
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration
import org.springframework.stereotype.Component
import java.time.Duration

private val MINIMUM_RETENTION: Duration = Duration.ofHours(24)

@ConfigurationProperties(prefix = "readmates.admin.command-idempotency")
data class AdminCommandIdempotencyProperties(
    val retention: Duration = Duration.ofDays(7),
    val initialClaimTtl: Duration = Duration.ofMinutes(15),
) {
    fun validate() {
        if (retention < MINIMUM_RETENTION) {
            throw IllegalStateException("readmates.admin.command-idempotency.retention must be at least 24h")
        }
        if (initialClaimTtl <= Duration.ZERO) {
            throw IllegalStateException("readmates.admin.command-idempotency.initial-claim-ttl must be positive")
        }
    }
}

@Configuration
@EnableConfigurationProperties(AdminCommandIdempotencyProperties::class)
class AdminCommandIdempotencyConfiguration

@Component
class AdminCommandIdempotencyPropertiesValidator(
    private val properties: AdminCommandIdempotencyProperties,
) {
    @PostConstruct
    fun validate() {
        properties.validate()
    }
}
