package com.readmates.shared.paging

import org.slf4j.LoggerFactory
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.core.env.Environment
import java.time.Duration

@ConfigurationProperties(prefix = "readmates.security.host-list-cursor")
data class HostListCursorSigningProperties(
    val currentKey: String = "",
    val currentKeyVersion: Int = 1,
    val previousKey: String = "",
    val previousKeyVersion: Int = 0,
    val ttl: Duration = Duration.ofHours(24),
    val previousKeyRolloutBuffer: Duration = Duration.ofHours(24),
    val allowEmptySecret: Boolean = false,
) {
    fun validate(environment: Environment) {
        val activeProfiles = environment.activeProfiles
        val productionLike =
            activeProfiles.isEmpty() ||
                activeProfiles.any { profile -> profile.contains("production", ignoreCase = true) }
        if (currentKey.isNotBlank()) {
            return
        }
        if (productionLike) {
            throw IllegalStateException(
                "readmates.security.host-list-cursor.current-key must not be blank in production. " +
                    "Set READMATES_HOST_LIST_CURSOR_CURRENT_KEY.",
            )
        }
        if (!allowEmptySecret) {
            throw IllegalStateException(
                "readmates.security.host-list-cursor.current-key is blank. " +
                    "Set READMATES_HOST_LIST_CURSOR_CURRENT_KEY or " +
                    "readmates.security.host-list-cursor.allow-empty-secret=true for local/test-only runs.",
            )
        }
        log.warn(
            "Host list cursor key is empty by explicit configuration " +
                "(readmates.security.host-list-cursor.allow-empty-secret=true). " +
                "Do NOT enable this in production.",
        )
    }

    private companion object {
        private val log = LoggerFactory.getLogger(HostListCursorSigningProperties::class.java)
    }
}
