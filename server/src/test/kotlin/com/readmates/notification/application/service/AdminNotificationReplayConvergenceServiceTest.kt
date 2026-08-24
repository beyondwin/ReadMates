package com.readmates.notification.application.service

import com.readmates.notification.application.config.NotificationRuntimeProperties
import com.readmates.notification.application.port.out.AdminNotificationReplayConvergenceAcquisition
import com.readmates.notification.application.port.out.AdminNotificationReplayConvergenceLease
import com.readmates.notification.application.port.out.AdminNotificationReplayConvergenceObservation
import com.readmates.notification.application.port.out.AdminNotificationReplayConvergenceOutcome
import com.readmates.notification.application.port.out.AdminNotificationReplayConvergencePort
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.TransactionCallback
import org.springframework.transaction.support.TransactionOperations
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

class AdminNotificationReplayConvergenceServiceTest {
    @Test
    fun `disabled notifications never claim or observe convergence`() {
        val port = RecordingConvergencePort()

        val processed = service(port, enabled = false).processOne()

        assertThat(processed).isFalse()
        assertThat(port.calls).isEmpty()
    }

    @Test
    fun `nonterminal fixed targets remain pending without dispatching another delivery`() {
        val port =
            RecordingConvergencePort(
                observation = observation("PENDING", "SENDING", "FAILED"),
            )

        assertThat(service(port).processOne()).isTrue()

        assertThat(port.calls).containsExactly("acquire", "observe", "finish")
        assertThat(port.finished?.outcome).isEqualTo(AdminNotificationReplayConvergenceOutcome.PENDING)
        assertThat(port.finished?.safeErrorCode).isEqualTo("DELIVERIES_STILL_PENDING")
    }

    @Test
    fun `all sent or skipped fixed targets succeed`() {
        val port = RecordingConvergencePort(observation = observation("SENT", "SKIPPED"))

        assertThat(service(port).processOne()).isTrue()

        assertThat(port.finished?.outcome).isEqualTo(AdminNotificationReplayConvergenceOutcome.SUCCEEDED)
        assertThat(port.finished?.safeErrorCode).isNull()
        assertThat(port.finished?.retryAt).isNull()
    }

    @Test
    fun `dead target waits for active siblings then fails only when every target is terminal`() {
        val active = RecordingConvergencePort(observation = observation("DEAD", "PENDING"))
        service(active).processOne()
        assertThat(active.finished?.outcome).isEqualTo(AdminNotificationReplayConvergenceOutcome.PENDING)

        val terminal = RecordingConvergencePort(observation = observation("DEAD", "SENT"))
        service(terminal).processOne()
        assertThat(terminal.finished?.outcome).isEqualTo(AdminNotificationReplayConvergenceOutcome.FAILED)
        assertThat(terminal.finished?.safeErrorCode).isEqualTo("REPLAY_DELIVERY_DEAD")
        assertThat(terminal.finished?.retryAt).isNull()
    }

    @Test
    fun `missing immutable target fails closed instead of shrinking denominator`() {
        val port =
            RecordingConvergencePort(
                observation = AdminNotificationReplayConvergenceObservation(expectedTargetCount = 2, statuses = listOf("SENT")),
            )

        service(port).processOne()

        assertThat(port.finished?.outcome).isEqualTo(AdminNotificationReplayConvergenceOutcome.FAILED)
        assertThat(port.finished?.safeErrorCode).isEqualTo("REPLAY_TARGET_MISSING")
    }

    @Test
    fun `empty immutable target set fails closed instead of vacuous success`() {
        val port =
            RecordingConvergencePort(
                observation = AdminNotificationReplayConvergenceObservation(expectedTargetCount = 0, statuses = emptyList()),
            )

        service(port).processOne()

        assertThat(port.finished?.outcome).isEqualTo(AdminNotificationReplayConvergenceOutcome.FAILED)
        assertThat(port.finished?.safeErrorCode).isEqualTo("REPLAY_TARGET_SET_EMPTY")
    }

    @Test
    fun `ambiguous observer failure preserves prior safe code and schedules retry`() {
        val port =
            RecordingConvergencePort(
                lease = lease(lastSafeErrorCode = "DELIVERIES_STILL_PENDING"),
                observationFailure = IllegalStateException("database unavailable"),
            )

        service(port).processOne()

        assertThat(port.finished?.outcome).isEqualTo(AdminNotificationReplayConvergenceOutcome.PENDING)
        assertThat(port.finished?.safeErrorCode).isEqualTo("DELIVERIES_STILL_PENDING")
        assertThat(port.finished?.retryAt).isAfter(NOW)
    }

    @Test
    fun `retry budget exhaustion terminalizes a still pending observation`() {
        val port =
            RecordingConvergencePort(
                lease = lease(attemptNo = 5),
                observation = observation("FAILED"),
            )

        service(port).processOne()

        assertThat(port.finished?.outcome).isEqualTo(AdminNotificationReplayConvergenceOutcome.FAILED)
        assertThat(port.finished?.safeErrorCode).isEqualTo("DELIVERIES_STILL_PENDING")
        assertThat(port.finished?.retryAt).isNull()
    }

    @Test
    fun `stale lease outcome CAS is reported without claiming success`() {
        val port = RecordingConvergencePort(observation = observation("SENT"), finishResult = false)

        assertThat(service(port).processOne()).isFalse()
    }

    private fun service(
        port: AdminNotificationReplayConvergencePort,
        enabled: Boolean = true,
    ) = AdminNotificationReplayConvergenceService(
        port = port,
        properties =
            NotificationRuntimeProperties(
                enabled = enabled,
                senderEmail = "sender@example.invalid",
                senderName = "ReadMates",
            ),
        transactions = RecordingTransactionOperations(),
        clock = Clock.fixed(NOW, ZoneOffset.UTC),
    )
}

private class RecordingConvergencePort(
    private val lease: AdminNotificationReplayConvergenceLease = lease(),
    private val observation: AdminNotificationReplayConvergenceObservation = observation("SENT"),
    private val observationFailure: RuntimeException? = null,
    private val finishResult: Boolean = true,
) : AdminNotificationReplayConvergencePort {
    val calls = mutableListOf<String>()
    var finished: FinishCall? = null

    override fun acquireNext(
        leaseOwner: String,
        startedAt: Instant,
        leaseExpiresAt: Instant,
        maxAttempts: Int,
    ): AdminNotificationReplayConvergenceAcquisition {
        calls += "acquire"
        return AdminNotificationReplayConvergenceAcquisition.Acquired(lease)
    }

    override fun observeTargets(receiptId: UUID): AdminNotificationReplayConvergenceObservation {
        calls += "observe"
        observationFailure?.let { throw it }
        return observation
    }

    override fun finish(
        lease: AdminNotificationReplayConvergenceLease,
        leaseOwner: String,
        outcome: AdminNotificationReplayConvergenceOutcome,
        safeErrorCode: String?,
        completedAt: Instant,
        retryAt: Instant?,
    ): Boolean {
        calls += "finish"
        finished = FinishCall(outcome, safeErrorCode, retryAt)
        return finishResult
    }
}

private data class FinishCall(
    val outcome: AdminNotificationReplayConvergenceOutcome,
    val safeErrorCode: String?,
    val retryAt: Instant?,
)

private class RecordingTransactionOperations : TransactionOperations {
    override fun <T : Any?> execute(action: TransactionCallback<T>): T =
        requireNotNull(action.doInTransaction(mock(TransactionStatus::class.java)))
}

private fun lease(
    attemptNo: Int = 1,
    lastSafeErrorCode: String? = null,
) = AdminNotificationReplayConvergenceLease(
    convergenceId = CONVERGENCE_ID,
    receiptId = RECEIPT_ID,
    effectTargetId = RECEIPT_ID,
    attemptNo = attemptNo,
    lastSafeErrorCode = lastSafeErrorCode,
)

private fun observation(vararg statuses: String) =
    AdminNotificationReplayConvergenceObservation(
        expectedTargetCount = statuses.size,
        statuses = statuses.toList(),
    )

private val NOW = Instant.parse("2026-08-24T00:00:00Z")
private val CONVERGENCE_ID: UUID = UUID.fromString("00000000-0000-4000-8000-000000059101")
private val RECEIPT_ID: UUID = UUID.fromString("00000000-0000-4000-8000-000000059102")
