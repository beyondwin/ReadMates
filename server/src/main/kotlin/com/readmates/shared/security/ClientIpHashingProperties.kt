package com.readmates.shared.security

import org.slf4j.LoggerFactory
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.core.env.Environment

@ConfigurationProperties(prefix = "readmates.security.ip-hash")
data class ClientIpHashingProperties(
    val baseSecret: String = "",
    val allowEmptySecret: Boolean = false,
) {
    companion object {
        private val log = LoggerFactory.getLogger(ClientIpHashingProperties::class.java)
    }

    /**
     * Validates that a non-blank [baseSecret] is configured when running in a production-like
     * environment. A production-like environment is defined as one where no active Spring profiles
     * are set, or at least one of the active profiles contains "production" (case-insensitive).
     *
     * In non-production environments, a blank [baseSecret] is permitted only when
     * [allowEmptySecret] is explicitly set to true, in which case a single WARN-level log line
     * is emitted as a safety signal so operators cannot silently ship this configuration.
     *
     * @throws IllegalStateException when production-like AND baseSecret is blank AND
     *   [allowEmptySecret] is false.
     */
    fun validate(environment: Environment) {
        val activeProfiles = environment.activeProfiles
        val isProductionLike = activeProfiles.isEmpty() ||
            activeProfiles.any { it.contains("production", ignoreCase = true) }

        if (isProductionLike && baseSecret.isBlank() && !allowEmptySecret) {
            throw IllegalStateException(
                "readmates.security.ip-hash.base-secret must not be blank in production. " +
                    "Set the READMATES_IP_HASH_BASE_SECRET environment variable or configure " +
                    "readmates.security.ip-hash.base-secret in your application properties.",
            )
        } else if (!isProductionLike && baseSecret.isBlank() && allowEmptySecret) {
            log.warn(
                "IP-hash secret is empty by explicit configuration " +
                    "(readmates.security.ip-hash.allow-empty-secret=true). " +
                    "Do NOT enable this in production.",
            )
        }
    }
}
