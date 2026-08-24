package com.readmates.shared.adminmutation.config

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.Duration

class AdminCommandIdempotencyPropertiesTest {
    @Test
    fun `defaults retain completed claims and bound maintenance`() {
        val properties = AdminCommandIdempotencyProperties()

        properties.validate()

        assertThat(properties.retention).isEqualTo(Duration.ofDays(7))
        assertThat(properties.initialClaimTtl).isEqualTo(Duration.ofMinutes(15))
        assertThat(properties.purgeBatchSize).isEqualTo(100)
        assertThat(properties.purgeInterval).isEqualTo(Duration.ofHours(1))
        assertThat(properties.previousKeyRolloutBuffer).isEqualTo(Duration.ofHours(24))
        assertThat(properties.boundedPurgeBatchSize()).isEqualTo(100)
    }

    @Test
    fun `retention below twenty four hours fails closed`() {
        assertThatThrownBy {
            AdminCommandIdempotencyProperties(retention = Duration.ofHours(23)).validate()
        }.isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("at least 24h")
    }

    @Test
    fun `non positive initial claim ttl fails closed`() {
        assertThatThrownBy {
            AdminCommandIdempotencyProperties(initialClaimTtl = Duration.ZERO).validate()
        }.isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("initial-claim-ttl")
    }

    @Test
    fun `unsafe maintenance bounds fail closed`() {
        listOf(
            AdminCommandIdempotencyProperties(purgeBatchSize = 0),
            AdminCommandIdempotencyProperties(purgeBatchSize = 501),
            AdminCommandIdempotencyProperties(purgeInterval = Duration.ZERO),
            AdminCommandIdempotencyProperties(previousKeyRolloutBuffer = Duration.ofHours(23)),
        ).forEach { properties ->
            assertThatThrownBy { properties.validate() }
                .isInstanceOf(IllegalStateException::class.java)
        }
    }
}
