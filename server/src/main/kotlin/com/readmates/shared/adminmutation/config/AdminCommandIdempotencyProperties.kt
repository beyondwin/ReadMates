package com.readmates.shared.adminmutation.config

import jakarta.annotation.PostConstruct
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration
import org.springframework.stereotype.Component
import java.time.Duration

private val MINIMUM_RETENTION: Duration = Duration.ofHours(24)
private const val MINIMUM_PURGE_BATCH_SIZE = 1
private const val MAXIMUM_PURGE_BATCH_SIZE = 500

@ConfigurationProperties(prefix = "readmates.admin.command-idempotency")
data class AdminCommandIdempotencyProperties(
    val retention: Duration = Duration.ofDays(7),
    val initialClaimTtl: Duration = Duration.ofMinutes(15),
    val purgeBatchSize: Int = 100,
    val purgeInterval: Duration = Duration.ofHours(1),
    val previousKeyRolloutBuffer: Duration = Duration.ofHours(24),
) {
    fun boundedPurgeBatchSize(): Int = purgeBatchSize.coerceIn(MINIMUM_PURGE_BATCH_SIZE, MAXIMUM_PURGE_BATCH_SIZE)

    fun validate() {
        if (retention < MINIMUM_RETENTION) {
            throw IllegalStateException("readmates.admin.command-idempotency.retention must be at least 24h")
        }
        if (initialClaimTtl <= Duration.ZERO) {
            throw IllegalStateException("readmates.admin.command-idempotency.initial-claim-ttl must be positive")
        }
        if (purgeBatchSize !in MINIMUM_PURGE_BATCH_SIZE..MAXIMUM_PURGE_BATCH_SIZE) {
            throw IllegalStateException(
                "readmates.admin.command-idempotency.purge-batch-size must be between " +
                    "$MINIMUM_PURGE_BATCH_SIZE and $MAXIMUM_PURGE_BATCH_SIZE",
            )
        }
        if (purgeInterval <= Duration.ZERO) {
            throw IllegalStateException("readmates.admin.command-idempotency.purge-interval must be positive")
        }
        if (previousKeyRolloutBuffer < MINIMUM_RETENTION) {
            throw IllegalStateException(
                "readmates.admin.command-idempotency.previous-key-rollout-buffer must be at least 24h",
            )
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
