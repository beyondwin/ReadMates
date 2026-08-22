package com.readmates.shared.adminmutation.config

import jakarta.annotation.PostConstruct
import org.slf4j.LoggerFactory
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration
import org.springframework.core.env.Environment
import org.springframework.stereotype.Component
import java.nio.charset.StandardCharsets

@ConfigurationProperties(prefix = "readmates.admin.command-identity")
data class AdminCommandIdentityProperties(
    val currentKey: String = "",
    val currentKeyVersion: Int = 1,
    val previousKey: String = "",
    val previousKeyVersion: Int = 0,
    val allowEmptySecret: Boolean = false,
) {
    fun currentKeyBytes(): ByteArray? = currentKey.takeIf { it.isNotBlank() }?.toByteArray(StandardCharsets.UTF_8)

    fun keyBytes(version: Int): ByteArray? =
        when (version) {
            currentKeyVersion -> currentKeyBytes()
            previousKeyVersion -> previousKey.takeIf { it.isNotBlank() }?.toByteArray(StandardCharsets.UTF_8)
            else -> null
        }

    fun validate(environment: Environment) {
        validateKeyVersions()
        if (currentKey.isNotBlank()) {
            return
        }
        val productionLike =
            environment.activeProfiles.isEmpty() ||
                environment.activeProfiles.any { profile -> profile.contains("production", ignoreCase = true) }
        if (productionLike) {
            throw IllegalStateException(
                "readmates.admin.command-identity.current-key must not be blank in production. " +
                    "Set READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY.",
            )
        }
        if (!allowEmptySecret) {
            throw IllegalStateException(
                "readmates.admin.command-identity.current-key is blank. " +
                    "Set READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY or " +
                    "readmates.admin.command-identity.allow-empty-secret=true for local/test-only runs.",
            )
        }
        log.warn(
            "Admin command digest key is empty by explicit configuration " +
                "(readmates.admin.command-identity.allow-empty-secret=true). " +
                "Do NOT enable this in production.",
        )
    }

    private fun validateKeyVersions() {
        if (currentKeyVersion < 0 || previousKeyVersion < 0) {
            throw IllegalStateException("readmates.admin.command-identity key versions must be non-negative")
        }
        if (currentKeyVersion == previousKeyVersion) {
            throw IllegalStateException(
                "readmates.admin.command-identity current and previous key versions must differ",
            )
        }
    }

    private companion object {
        private val log = LoggerFactory.getLogger(AdminCommandIdentityProperties::class.java)
    }
}

@Configuration
@EnableConfigurationProperties(AdminCommandIdentityProperties::class)
class AdminCommandIdentityConfiguration

@Component
class AdminCommandIdentityStartupValidator(
    private val properties: AdminCommandIdentityProperties,
    private val environment: Environment,
) {
    @PostConstruct
    fun validate() {
        properties.validate(environment)
    }
}
