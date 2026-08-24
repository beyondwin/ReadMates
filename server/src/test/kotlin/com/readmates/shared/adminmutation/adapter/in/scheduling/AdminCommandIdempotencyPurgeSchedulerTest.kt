@file:Suppress("ktlint:standard:package-name")

package com.readmates.shared.adminmutation.adapter.`in`.scheduling

import com.readmates.shared.adminmutation.application.port.`in`.PurgeExpiredAdminCommandClaimsUseCase
import com.readmates.shared.adminmutation.config.AdminCommandIdempotencyProperties
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatCode
import org.junit.jupiter.api.Test

class AdminCommandIdempotencyPurgeSchedulerTest {
    @Test
    fun `scheduler delegates one bounded batch`() {
        val purge = RecordingPurgeUseCase()
        val scheduler =
            AdminCommandIdempotencyPurgeScheduler(
                purge,
                AdminCommandIdempotencyProperties(purgeBatchSize = 100),
            )

        scheduler.purgeExpired()

        assertThat(purge.limits).containsExactly(100)
    }

    @Test
    fun `scheduler fails closed without leaking the maintenance failure`() {
        val scheduler =
            AdminCommandIdempotencyPurgeScheduler(
                PurgeExpiredAdminCommandClaimsUseCase { throw IllegalStateException("database unavailable") },
                AdminCommandIdempotencyProperties(),
            )

        assertThatCode { scheduler.purgeExpired() }.doesNotThrowAnyException()
    }
}

private class RecordingPurgeUseCase : PurgeExpiredAdminCommandClaimsUseCase {
    val limits = mutableListOf<Int>()

    override fun purgeExpired(limit: Int): Int {
        limits += limit
        return 0
    }
}
