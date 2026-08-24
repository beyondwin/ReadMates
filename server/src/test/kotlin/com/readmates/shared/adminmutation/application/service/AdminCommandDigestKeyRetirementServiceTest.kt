package com.readmates.shared.adminmutation.application.service

import com.readmates.shared.adminmutation.adapter.out.observability.AdminCommandMetrics
import com.readmates.shared.adminmutation.application.model.AdminCommandClaimAttempt
import com.readmates.shared.adminmutation.application.model.AdminCommandClaimResult
import com.readmates.shared.adminmutation.application.model.AdminCommandDigestKeyReferenceState
import com.readmates.shared.adminmutation.application.model.AdminCommandDigestKeyRetirementOutcome
import com.readmates.shared.adminmutation.application.model.AdminCommandDigestSet
import com.readmates.shared.adminmutation.application.model.AdminCommandScope
import com.readmates.shared.adminmutation.application.port.out.AdminCommandIdempotencyPort
import com.readmates.shared.adminmutation.config.AdminCommandIdempotencyProperties
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

class AdminCommandDigestKeyRetirementServiceTest {
    @Test
    fun `referenced keys are never removable`() {
        val port = RetirementPort(state(aliasCount = 1, unreferencedSince = null))

        val result = service(port).assess(1)

        assertThat(result.outcome).isEqualTo(AdminCommandDigestKeyRetirementOutcome.REFERENCED)
    }

    @Test
    fun `pending host invitation is a durable key reference after aliases drain`() {
        val port =
            RetirementPort(
                state(
                    aliasCount = 0,
                    unreferencedSince = NOW.minus(Duration.ofDays(2)),
                    pendingHostInvitationCount = 1,
                ),
            )

        val result = service(port).assess(1)

        assertThat(result.outcome).isEqualTo(AdminCommandDigestKeyRetirementOutcome.REFERENCED)
    }

    @Test
    fun `zero aliases start and retain a twenty four hour buffer`() {
        val port = RetirementPort(state(aliasCount = 0, unreferencedSince = NOW.minus(Duration.ofHours(23))))

        val result = service(port).assess(1)

        assertThat(result.outcome).isEqualTo(AdminCommandDigestKeyRetirementOutcome.BUFFER_PENDING)
        assertThat(result.unreferencedSince).isEqualTo(NOW.minus(Duration.ofHours(23)))
    }

    @Test
    fun `fresh locked zero alias evidence becomes removable after the full buffer`() {
        val port = RetirementPort(state(aliasCount = 0, unreferencedSince = NOW.minus(Duration.ofHours(24))))

        val result = service(port).assess(1)

        assertThat(result.outcome).isEqualTo(AdminCommandDigestKeyRetirementOutcome.REMOVABLE)
        assertThat(port.versions).containsExactly(1)
    }

    private fun service(port: RetirementPort) =
        AdminCommandDigestKeyRetirementService(
            port = port,
            properties = AdminCommandIdempotencyProperties(previousKeyRolloutBuffer = Duration.ofHours(24)),
            clock = Clock.fixed(NOW, ZoneOffset.UTC),
            observability = AdminCommandMetrics(SimpleMeterRegistry()),
        )

    private fun state(
        aliasCount: Long,
        unreferencedSince: Instant?,
        pendingHostInvitationCount: Long = 0,
    ) = AdminCommandDigestKeyReferenceState(
        digestKeyVersion = 1,
        aliasCount = aliasCount,
        lastReferencedAt = NOW.minus(Duration.ofDays(2)),
        unreferencedSince = unreferencedSince,
        pendingHostInvitationCount = pendingHostInvitationCount,
    )

    private companion object {
        val NOW: Instant = Instant.parse("2026-08-24T12:00:00Z")
    }
}

private class RetirementPort(
    private val state: AdminCommandDigestKeyReferenceState,
) : AdminCommandIdempotencyPort {
    val versions = mutableListOf<Int>()

    override fun lockDigestKeyForRetirement(
        digestKeyVersion: Int,
        now: Instant,
    ): AdminCommandDigestKeyReferenceState {
        versions += digestKeyVersion
        return state
    }

    override fun invalidateDigestKeyRetirement(
        digestKeyVersion: Int,
        now: Instant,
    ) = error("unused")

    override fun claim(
        scope: AdminCommandScope,
        attempt: AdminCommandClaimAttempt,
        digests: AdminCommandDigestSet,
    ): AdminCommandClaimResult = error("unused")

    override fun complete(
        claimId: UUID,
        claimToken: UUID,
        receiptType: String,
        receiptId: String,
        completedAt: Instant,
        retention: Duration,
    ): Boolean = error("unused")

    override fun purgeExpiredCompleted(
        now: Instant,
        limit: Int,
    ): Int = error("unused")

    override fun lockDigestKeyStatesForMaintenance() = error("unused")

    override fun lockDigestKeySnapshot(): List<AdminCommandDigestKeyReferenceState> = error("unused")
}
