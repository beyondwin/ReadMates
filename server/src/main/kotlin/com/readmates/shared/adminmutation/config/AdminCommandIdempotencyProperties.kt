package com.readmates.shared.adminmutation.config

import jakarta.annotation.PostConstruct
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration
import org.springframework.stereotype.Component
import java.time.Duration

private const val MINIMUM_RETENTION_HOURS = 24L
private const val DEFAULT_RETENTION_DAYS = 7L
private const val DEFAULT_INITIAL_CLAIM_TTL_MINUTES = 15L
private const val DEFAULT_PURGE_BATCH_SIZE = 100
private val MINIMUM_RETENTION: Duration = Duration.ofHours(MINIMUM_RETENTION_HOURS)
private const val MINIMUM_PURGE_BATCH_SIZE = 1
private const val MAXIMUM_PURGE_BATCH_SIZE = 500

@ConfigurationProperties(prefix = "readmates.admin.command-idempotency")
data class AdminCommandIdempotencyProperties(
    val retention: Duration = Duration.ofDays(DEFAULT_RETENTION_DAYS),
    val initialClaimTtl: Duration = Duration.ofMinutes(DEFAULT_INITIAL_CLAIM_TTL_MINUTES),
    val purgeBatchSize: Int = DEFAULT_PURGE_BATCH_SIZE,
    val purgeInterval: Duration = Duration.ofHours(1),
    val previousKeyRolloutBuffer: Duration = Duration.ofHours(MINIMUM_RETENTION_HOURS),
) {
    fun boundedPurgeBatchSize(): Int = purgeBatchSize.coerceIn(MINIMUM_PURGE_BATCH_SIZE, MAXIMUM_PURGE_BATCH_SIZE)

    fun validate() {
        validateRetention()
        validatePurge()
        validateRolloutBuffer()
    }

    private fun validateRetention() {
        check(retention >= MINIMUM_RETENTION) {
            "readmates.admin.command-idempotency.retention must be at least 24h"
        }
        check(initialClaimTtl > Duration.ZERO) {
            "readmates.admin.command-idempotency.initial-claim-ttl must be positive"
        }
    }

    private fun validatePurge() {
        check(purgeBatchSize in MINIMUM_PURGE_BATCH_SIZE..MAXIMUM_PURGE_BATCH_SIZE) {
            "readmates.admin.command-idempotency.purge-batch-size must be between " +
                "$MINIMUM_PURGE_BATCH_SIZE and $MAXIMUM_PURGE_BATCH_SIZE"
        }
        check(purgeInterval > Duration.ZERO) {
            "readmates.admin.command-idempotency.purge-interval must be positive"
        }
    }

    private fun validateRolloutBuffer() {
        check(previousKeyRolloutBuffer >= MINIMUM_RETENTION) {
            "readmates.admin.command-idempotency.previous-key-rollout-buffer must be at least 24h"
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
