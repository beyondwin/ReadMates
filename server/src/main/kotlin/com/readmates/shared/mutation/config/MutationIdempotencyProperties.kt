package com.readmates.shared.mutation.config

import com.readmates.shared.mutation.application.port.out.MutationIdempotencyPort
import jakarta.annotation.PostConstruct
import org.slf4j.LoggerFactory
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration
import org.springframework.core.env.Environment
import org.springframework.stereotype.Component
import java.nio.charset.StandardCharsets
import java.time.Duration

private const val DEFAULT_PURGE_BATCH_SIZE = 50
private const val MIN_PURGE_BATCH_SIZE = 1
private const val MAX_PURGE_BATCH_SIZE = 500
private const val MINIMUM_RETENTION_HOURS = 24L
private const val DEFAULT_PURGE_DELAY_HOURS = 1L

@ConfigurationProperties(prefix = "readmates.mutation.idempotency")
data class MutationIdempotencyProperties(
    val currentKey: String = "",
    val currentKeyVersion: Int = 1,
    val previousKey: String = "",
    val previousKeyVersion: Int = 0,
    val retention: Duration = Duration.ofHours(MINIMUM_RETENTION_HOURS),
    val previousKeyRolloutBuffer: Duration = Duration.ofHours(MINIMUM_RETENTION_HOURS),
    val purgeFixedDelay: Duration = Duration.ofHours(DEFAULT_PURGE_DELAY_HOURS),
    val purgeBatchSize: Int = DEFAULT_PURGE_BATCH_SIZE,
    val allowEmptySecret: Boolean = false,
) {
    fun boundedPurgeBatchSize(): Int = purgeBatchSize.coerceIn(MIN_PURGE_BATCH_SIZE, MAX_PURGE_BATCH_SIZE)

    fun currentKeyBytes(): ByteArray = currentKey.toByteArray(StandardCharsets.UTF_8)

    fun keyBytes(version: Int): ByteArray? =
        when (version) {
            currentKeyVersion -> currentKey.takeIf { it.isNotBlank() }?.toByteArray(StandardCharsets.UTF_8)
            previousKeyVersion -> previousKey.takeIf { it.isNotBlank() }?.toByteArray(StandardCharsets.UTF_8)
            else -> null
        }

    @Suppress("ThrowsCount")
    fun validate(environment: Environment) {
        val activeProfiles = environment.activeProfiles
        val productionLike =
            activeProfiles.isEmpty() ||
                activeProfiles.any { profile -> profile.contains("production", ignoreCase = true) }
        if (currentKeyVersion < 0 || previousKeyVersion < 0) {
            throw IllegalStateException("readmates.mutation.idempotency key versions must be non-negative")
        }
        if (currentKeyVersion == previousKeyVersion) {
            throw IllegalStateException("readmates.mutation.idempotency current and previous key versions must differ")
        }
        if (retention < Duration.ofHours(MINIMUM_RETENTION_HOURS)) {
            throw IllegalStateException("readmates.mutation.idempotency.retention must be at least 24h")
        }
        if (currentKey.isNotBlank()) {
            return
        }
        if (productionLike) {
            throw IllegalStateException(
                "readmates.mutation.idempotency.current-key must not be blank in production. " +
                    "Set READMATES_MUTATION_IDENTITY_CURRENT_KEY.",
            )
        }
        if (!allowEmptySecret) {
            throw IllegalStateException(
                "readmates.mutation.idempotency.current-key is blank. " +
                    "Set READMATES_MUTATION_IDENTITY_CURRENT_KEY or " +
                    "readmates.mutation.idempotency.allow-empty-secret=true for local/test-only runs.",
            )
        }
        log.warn(
            "Mutation identity key is empty by explicit configuration " +
                "(readmates.mutation.idempotency.allow-empty-secret=true). " +
                "Do NOT enable this in production.",
        )
    }

    private companion object {
        private val log = LoggerFactory.getLogger(MutationIdempotencyProperties::class.java)
    }
}

@Configuration
@EnableConfigurationProperties(MutationIdempotencyProperties::class)
class MutationIdempotencyConfiguration

@Component
class MutationIdempotencyStartupValidator(
    private val properties: MutationIdempotencyProperties,
    private val port: MutationIdempotencyPort,
    private val environment: Environment,
) {
    @PostConstruct
    fun validate() {
        properties.validate(environment)
        val referenced = port.referencedDigestKeyVersions()
        val missing =
            referenced.filter { version -> properties.keyBytes(version) == null }
        if (missing.isNotEmpty()) {
            throw IllegalStateException(
                "Configured mutation digest keys cannot replay referenced digest key versions",
            )
        }
    }
}
