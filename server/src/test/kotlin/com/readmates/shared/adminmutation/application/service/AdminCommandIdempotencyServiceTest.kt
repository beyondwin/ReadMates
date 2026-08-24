package com.readmates.shared.adminmutation.application.service

import com.readmates.shared.adminmutation.application.model.AdminCommandClaimAttempt
import com.readmates.shared.adminmutation.application.model.AdminCommandClaimResult
import com.readmates.shared.adminmutation.application.model.AdminCommandDigestSet
import com.readmates.shared.adminmutation.application.model.AdminCommandScope
import com.readmates.shared.adminmutation.application.model.CanonicalAdminCommandRequest
import com.readmates.shared.adminmutation.application.model.PlatformAdminCommandIdentity
import com.readmates.shared.adminmutation.application.model.RequiredAdminCommandTransactionException
import com.readmates.shared.adminmutation.application.port.out.AdminCommandIdempotencyPort
import com.readmates.shared.adminmutation.config.AdminCommandIdempotencyProperties
import com.readmates.shared.adminmutation.config.AdminCommandIdentityProperties
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.springframework.transaction.support.TransactionSynchronizationManager
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

class AdminCommandIdempotencyServiceTest {
    @AfterEach
    fun clearTransactionState() {
        TransactionSynchronizationManager.setActualTransactionActive(false)
    }

    @Test
    fun `claim strips raw identity and exposes the current safe digest`() =
        withinTransaction {
            val port = RecordingAdminCommandIdempotencyPort()
            val service = service(port)

            val result = service.claim(identity(), request())

            val claimed = result as AdminCommandClaimResult.Claimed
            assertThat(port.scope)
                .isEqualTo(
                    AdminCommandScope(
                        platformAdminUserId = ADMIN_ID,
                        commandType = "club.create",
                        targetType = "club",
                        targetId = TARGET_ID.toString(),
                    ),
                )
            assertThat(port.attempt?.canonicalSchemaVersion).isEqualTo("club-create:v1")
            assertThat(port.attempt?.claimedAt).isEqualTo(NOW)
            assertThat(port.attempt?.initialExpiresAt).isEqualTo(NOW.plus(Duration.ofMinutes(15)))
            assertThat(claimed.claimId).isEqualTo(port.attempt?.claimId)
            assertThat(claimed.claimToken).isEqualTo(port.attempt?.claimToken)
            assertThat(claimed.currentDigest).isEqualTo(port.digests?.current)
            assertThat(claimed.currentDigest.digestKeyVersion).isEqualTo(2)
            assertThat(port.digests?.lookupCandidates?.map { it.digestKeyVersion }).containsExactly(1, 2)
            assertThat(port.digests?.aliasCandidates?.map { it.digestKeyVersion }).containsExactly(1, 2)
        }

    @Test
    fun `claim passes canonical lowercase target scope instead of raw identity text`() =
        withinTransaction {
            val port = RecordingAdminCommandIdempotencyPort()
            val service = service(port)

            service.claim(identity(targetId = TARGET_ID.toString().uppercase()), request())

            assertThat(port.scope?.targetId).isEqualTo(TARGET_ID.toString())
        }

    @Test
    fun `persistence port shape accepts only stripped scope attempt and hmac digests`() {
        val claim = AdminCommandIdempotencyPort::class.java.methods.single { it.name == "claim" }

        assertThat(claim.parameterTypes.toList()).containsExactly(
            AdminCommandScope::class.java,
            AdminCommandClaimAttempt::class.java,
            AdminCommandDigestSet::class.java,
        )
        assertThat(claim.parameterTypes).doesNotContain(
            PlatformAdminCommandIdentity::class.java,
            CanonicalAdminCommandRequest::class.java,
            String::class.java,
        )
    }

    @Test
    fun `claim and completion fail before the port without an existing transaction`() {
        val port = RecordingAdminCommandIdempotencyPort()
        val service = service(port)

        assertThatThrownBy { service.claim(identity(), request()) }
            .isInstanceOf(RequiredAdminCommandTransactionException::class.java)
            .hasMessage("ADMIN_COMMAND_TRANSACTION_REQUIRED")
        assertThatThrownBy {
            service.complete(UUID.randomUUID(), UUID.randomUUID(), "club-create", "receipt-001")
        }.isInstanceOf(RequiredAdminCommandTransactionException::class.java)
            .hasMessage("ADMIN_COMMAND_TRANSACTION_REQUIRED")
        assertThat(port.claimCalls).isZero()
        assertThat(port.completeCalls).isZero()
    }

    @Test
    fun `completed in progress and conflict outcomes remain typed`() =
        withinTransaction {
            val port = RecordingAdminCommandIdempotencyPort()
            val service = service(port)
            val outcomes =
                listOf(
                    AdminCommandClaimResult.Completed("club-create", "receipt-001"),
                    AdminCommandClaimResult.InProgress,
                    AdminCommandClaimResult.Conflict,
                )

            outcomes.forEach { outcome ->
                port.claimResult = outcome
                assertThat(service.claim(identity(), request())).isEqualTo(outcome)
            }
        }

    @Test
    fun `completion validates receipt pointer and passes completion anchored retention`() =
        withinTransaction {
            val port = RecordingAdminCommandIdempotencyPort()
            val service = service(port)
            val claimId = UUID.randomUUID()
            val claimToken = UUID.randomUUID()

            assertThat(service.complete(claimId, claimToken, "club-create", "receipt-001")).isTrue()
            assertThat(port.completedAt).isEqualTo(NOW)
            assertThat(port.retention).isEqualTo(Duration.ofDays(7))

            listOf(
                "" to "receipt-001",
                "club/create" to "receipt-001",
                "club-create" to "",
                "club-create" to "receipt/001",
                "x".repeat(97) to "receipt-001",
                "club-create" to "x".repeat(129),
            ).forEach { (receiptType, receiptId) ->
                assertThatThrownBy {
                    service.complete(claimId, claimToken, receiptType, receiptId)
                }.isInstanceOf(IllegalArgumentException::class.java)
            }
            assertThat(port.completeCalls).isEqualTo(1)
        }

    private fun service(port: RecordingAdminCommandIdempotencyPort): AdminCommandIdempotencyService =
        AdminCommandIdempotencyService(
            identityService =
                AdminCommandIdentityService(
                    AdminCommandIdentityProperties(
                        currentKey = CURRENT_KEY,
                        currentKeyVersion = 2,
                        previousKey = PREVIOUS_KEY,
                        previousKeyVersion = 1,
                        writePreviousAlias = true,
                    ),
                ),
            port = port,
            properties = AdminCommandIdempotencyProperties(),
            clock = Clock.fixed(NOW, ZoneOffset.UTC),
        )

    private fun identity(targetId: String = TARGET_ID.toString()) =
        PlatformAdminCommandIdentity(
            platformAdminUserId = ADMIN_ID,
            commandType = "club.create",
            targetType = "club",
            targetId = targetId,
            idempotencyKey = SENSITIVE_IDEMPOTENCY_KEY,
        )

    private fun request() =
        object : CanonicalAdminCommandRequest {
            override val schemaVersion: String = "club-create:v1"

            override fun canonicalFields(): List<Pair<String, String>> = listOf("reason" to SENSITIVE_REASON, "email" to SENSITIVE_EMAIL)
        }

    private fun withinTransaction(block: () -> Unit) {
        TransactionSynchronizationManager.setActualTransactionActive(true)
        try {
            block()
        } finally {
            TransactionSynchronizationManager.setActualTransactionActive(false)
        }
    }

    private companion object {
        val NOW: Instant = Instant.parse("2026-08-24T00:00:00Z")
        val ADMIN_ID: UUID = UUID.fromString("00000000-0000-4000-8000-000000000001")
        val TARGET_ID: UUID = UUID.fromString("00000000-0000-4000-8000-0000000000aa")
        const val CURRENT_KEY = "test-admin-command-current-key"
        const val PREVIOUS_KEY = "test-admin-command-previous-key"
        const val SENSITIVE_IDEMPOTENCY_KEY = "sensitive-idempotency-key"
        const val SENSITIVE_REASON = "sensitive-reason"
        const val SENSITIVE_EMAIL = "sensitive@example.com"
    }
}

private class RecordingAdminCommandIdempotencyPort : AdminCommandIdempotencyPort {
    var scope: AdminCommandScope? = null
    var attempt: AdminCommandClaimAttempt? = null
    var digests: AdminCommandDigestSet? = null
    var claimCalls: Int = 0
    var completeCalls: Int = 0
    var completedAt: Instant? = null
    var retention: Duration? = null
    var claimResult: AdminCommandClaimResult? = null

    override fun claim(
        scope: AdminCommandScope,
        attempt: AdminCommandClaimAttempt,
        digests: AdminCommandDigestSet,
    ): AdminCommandClaimResult {
        claimCalls += 1
        this.scope = scope
        this.attempt = attempt
        this.digests = digests
        return claimResult ?: AdminCommandClaimResult.Claimed(attempt.claimId, attempt.claimToken, digests.current)
    }

    override fun complete(
        claimId: UUID,
        claimToken: UUID,
        receiptType: String,
        receiptId: String,
        completedAt: Instant,
        retention: Duration,
    ): Boolean {
        completeCalls += 1
        this.completedAt = completedAt
        this.retention = retention
        return true
    }
}
