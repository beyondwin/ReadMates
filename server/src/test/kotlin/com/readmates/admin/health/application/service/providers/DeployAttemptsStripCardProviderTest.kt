package com.readmates.admin.health.application.service.providers

import com.readmates.admin.health.application.model.DeployAttemptFinalStatus
import com.readmates.admin.health.application.model.DeployAttemptStripEntry
import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.port.out.DeployLedgerPort
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class DeployAttemptsStripCardProviderTest {
    private val clock: Clock = Clock.fixed(Instant.parse("2026-05-26T00:00:00Z"), ZoneOffset.UTC)

    private class FakeLedger(private val behaviour: () -> List<DeployAttemptStripEntry>) : DeployLedgerPort {
        override fun tailLatestAttempts(limit: Int): List<DeployAttemptStripEntry> = behaviour()
    }

    @Test
    fun `populates deploy strip with up to 5 attempts and status OK when latest succeeded`() {
        val entry =
            DeployAttemptStripEntry(
                attemptId = "a",
                startedAt = Instant.parse("2026-05-26T10:00:00Z"),
                endedAt = Instant.parse("2026-05-26T10:01:00Z"),
                finalStatus = DeployAttemptFinalStatus.SUCCEEDED,
                imageTag = "v1",
                durationSeconds = 60,
            )
        val card = DeployAttemptsStripCardProvider(FakeLedger { listOf(entry) }, clock).compute()
        assertThat(card.id).isEqualTo("deploy_attempts_strip")
        assertThat(card.status).isEqualTo(HealthCardStatus.OK)
        assertThat(card.deployStrip).containsExactly(entry)
    }

    @Test
    fun `status CRIT when latest attempt failed`() {
        val entry =
            DeployAttemptStripEntry(
                attemptId = "a",
                startedAt = Instant.parse("2026-05-26T10:00:00Z"),
                endedAt = Instant.parse("2026-05-26T10:01:00Z"),
                finalStatus = DeployAttemptFinalStatus.FAILED,
                imageTag = "v1",
                durationSeconds = 60,
            )
        val card = DeployAttemptsStripCardProvider(FakeLedger { listOf(entry) }, clock).compute()
        assertThat(card.status).isEqualTo(HealthCardStatus.CRIT)
    }

    @Test
    fun `status UNKNOWN when ledger empty`() {
        val card = DeployAttemptsStripCardProvider(FakeLedger { emptyList() }, clock).compute()
        assertThat(card.status).isEqualTo(HealthCardStatus.UNKNOWN)
        assertThat(card.reason).isEqualTo("ledger_unavailable")
    }
}
