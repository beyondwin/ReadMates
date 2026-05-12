package com.readmates.shared.security

import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.core.env.Environment

@ConfigurationProperties(prefix = "readmates.security.ip-hash")
data class ClientIpHashingProperties(
    val baseSecret: String = "",
    val allowEmptySecret: Boolean = false,
) {
    /**
     * Validates that a non-blank [baseSecret] is configured when running in a production-like
     * environment. A production-like environment is defined as one where no active Spring profiles
     * are set, or at least one of the active profiles contains "production" (case-insensitive).
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
        }
    }
}
