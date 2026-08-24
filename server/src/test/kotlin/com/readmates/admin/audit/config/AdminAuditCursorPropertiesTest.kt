package com.readmates.admin.audit.config

import com.readmates.shared.adminmutation.config.AdminCommandIdempotencyProperties
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.Duration

class AdminAuditCursorPropertiesTest {
    private val idempotency =
        AdminCommandIdempotencyProperties(previousKeyRolloutBuffer = Duration.ofHours(24))

    @Test
    fun `cursor ttl must be positive and shorter than key rollout buffer`() {
        listOf(Duration.ZERO, Duration.ofSeconds(-1), Duration.ofHours(24), Duration.ofHours(25)).forEach { ttl ->
            assertThatThrownBy { AdminAuditCursorProperties(cursorTtl = ttl).validate(idempotency) }
                .isInstanceOf(IllegalStateException::class.java)
        }
    }

    @Test
    fun `cursor ttl defaults to one hour and validates inside key lifecycle`() {
        AdminAuditCursorProperties().validate(idempotency)
    }
}
