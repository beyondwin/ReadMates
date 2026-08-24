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
import java.time.Clock
import java.time.Duration

private const val DEFAULT_PURGE_BATCH_SIZE = 50
private const val MIN_PURGE_BATCH_SIZE = 3
private const val MAX_PURGE_BATCH_SIZE = 500
private const val MINIMUM_RETENTION_HOURS = 24L

@ConfigurationProperties(prefix = "readmates.mutation.idempotency")
data class MutationIdempotencyProperties(
    val currentKey: String = "",
    val currentKeyVersion: Int = 1,
    val previousKey: String = "",
    val previousKeyVersion: Int = 0,
    val retention: Duration = Duration.ofHours(MINIMUM_RETENTION_HOURS),
    val previousKeyRolloutBuffer: Duration = Duration.ofHours(MINIMUM_RETENTION_HOURS),
    val purgeFixedDelay: Duration = Duration.ofHours(1),
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
        if (previousKeyRolloutBuffer < Duration.ofHours(MINIMUM_RETENTION_HOURS)) {
            throw IllegalStateException(
                "readmates.mutation.idempotency.previous-key-rollout-buffer must be at least 24h",
            )
        }
        if (purgeBatchSize !in MIN_PURGE_BATCH_SIZE..MAX_PURGE_BATCH_SIZE) {
            throw IllegalStateException(
                "readmates.mutation.idempotency.purge-batch-size must be between " +
                    "$MIN_PURGE_BATCH_SIZE and $MAX_PURGE_BATCH_SIZE",
            )
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
    private val clock: Clock = Clock.systemUTC(),
) {
    @PostConstruct
    fun validate() {
        properties.validate(environment)
        val referenced = port.referencedDigestKeyVersions()
        val missing =
            referenced.filter { version -> properties.keyBytes(version) == null }
        val configuredVersions =
            buildSet {
                add(properties.currentKeyVersion)
                if (properties.previousKey.isNotBlank()) {
                    add(properties.previousKeyVersion)
                }
            }
        val keyStates = port.digestKeyStates()
        val unsafeHistoricalState =
            keyStates.any { state ->
                state.digestKeyVersion !in configuredVersions && !state.isSafelyRetired(clock, properties)
            }
        val missingPreviousRetirementState =
            properties.previousKey.isBlank() &&
                properties.previousKeyVersion > 0 &&
                properties.previousKeyVersion !in configuredVersions &&
                keyStates.none { state -> state.digestKeyVersion == properties.previousKeyVersion }
        if (missing.isNotEmpty() || unsafeHistoricalState || missingPreviousRetirementState) {
            throw IllegalStateException(
                "Configured mutation digest keys cannot safely replay or retire historical digest key versions",
            )
        }
    }
}

private fun MutationIdempotencyPort.DigestKeyState.isSafelyRetired(
    clock: Clock,
    properties: MutationIdempotencyProperties,
): Boolean {
    val retiredAt = unreferencedSince
    return retiredAt != null &&
        !retiredAt.isBefore(lastReferencedAt) &&
        !clock.instant().isBefore(retiredAt.plus(properties.previousKeyRolloutBuffer))
}
