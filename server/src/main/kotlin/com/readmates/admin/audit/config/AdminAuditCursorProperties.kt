package com.readmates.admin.audit.config

import com.readmates.shared.adminmutation.config.AdminCommandIdempotencyProperties
import jakarta.annotation.PostConstruct
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration
import org.springframework.stereotype.Component
import java.time.Duration

@ConfigurationProperties(prefix = "readmates.admin.audit")
data class AdminAuditCursorProperties(
    val cursorTtl: Duration = Duration.ofHours(DEFAULT_CURSOR_TTL_HOURS),
) {
    fun validate(idempotencyProperties: AdminCommandIdempotencyProperties) {
        check(cursorTtl > Duration.ZERO && cursorTtl < idempotencyProperties.previousKeyRolloutBuffer) {
            "readmates.admin.audit.cursor-ttl must be positive and shorter than " +
                "readmates.admin.command-idempotency.previous-key-rollout-buffer"
        }
    }
}

@Configuration
@EnableConfigurationProperties(AdminAuditCursorProperties::class)
class AdminAuditCursorConfiguration

@Component
class AdminAuditCursorPropertiesValidator(
    private val cursorProperties: AdminAuditCursorProperties,
    private val idempotencyProperties: AdminCommandIdempotencyProperties,
) {
    @PostConstruct
    fun validate() {
        cursorProperties.validate(idempotencyProperties)
    }
}

private const val DEFAULT_CURSOR_TTL_HOURS = 1L
