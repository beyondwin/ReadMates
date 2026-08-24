package com.readmates.club.application.service

import com.readmates.club.application.port.out.DerivePlatformAdminHostInvitationTokenPort
import com.readmates.club.application.port.out.PlatformAdminHostInvitationConvergenceAcquisition
import com.readmates.club.application.port.out.PlatformAdminHostInvitationConvergenceLease
import com.readmates.club.application.port.out.PlatformAdminHostInvitationDeliveryTarget
import com.readmates.club.application.port.out.PlatformAdminOnboardingCommandPort
import com.readmates.club.application.port.out.SendPlatformAdminHostInvitationEmailPort
import com.readmates.club.application.port.out.TransientPlatformAdminHostInvitationMail
import com.readmates.notification.application.config.NotificationRuntimeProperties
import com.readmates.notification.application.port.out.MailDeliveryFailure
import com.readmates.notification.application.port.out.MailDeliveryFailureKind
import com.readmates.shared.adminmutation.application.model.DigestKeyUnavailableException
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Clock
import java.util.UUID

@Service
class PlatformAdminHostInvitationConvergenceService(
    private val commandPort: PlatformAdminOnboardingCommandPort,
    private val tokenDeriver: DerivePlatformAdminHostInvitationTokenPort,
    private val mailPort: SendPlatformAdminHostInvitationEmailPort,
    private val transactions: TransactionTemplate,
    private val clock: Clock,
    private val notificationProperties: NotificationRuntimeProperties,
    @param:Value("\${readmates.app-base-url:http://localhost:3000}")
    private val appBaseUrl: String,
) {
    init {
        require(
            notificationProperties.worker.retryDelays.size >=
                notificationProperties.kafka.maxDeliveryAttempts - 1,
        ) {
            "readmates.notifications.worker.retry-delays must cover every nonterminal host invitation attempt"
        }
    }

    fun processBatch(): Int {
        if (!enabled()) return 0
        var processed = 0
        while (processed < notificationProperties.worker.relayBatchSize && processOne()) {
            processed += 1
        }
        return processed
    }

    fun processOne(): Boolean {
        if (!enabled()) return false
        val leaseOwner = UUID.randomUUID().toString()
        val startedAt = clock.instant()
        val acquisition =
            transactions.execute {
                commandPort.tryAcquireHostInvitationConvergence(
                    leaseOwner,
                    startedAt,
                    startedAt.plus(notificationProperties.worker.claimLease),
                    notificationProperties.kafka.maxDeliveryAttempts,
                )
            }
        return when (acquisition) {
            is PlatformAdminHostInvitationConvergenceAcquisition.Acquired ->
                finishDelivery(acquisition.lease, leaseOwner)
            PlatformAdminHostInvitationConvergenceAcquisition.Terminalized -> true
            PlatformAdminHostInvitationConvergenceAcquisition.Unavailable -> false
        }
    }

    private fun finishDelivery(
        lease: PlatformAdminHostInvitationConvergenceLease,
        leaseOwner: String,
    ): Boolean {
        val outcome = deliver(lease)
        val completedAt = clock.instant()
        val terminal =
            outcome.succeeded || outcome.permanent ||
                lease.attemptNo >= notificationProperties.kafka.maxDeliveryAttempts
        val retryAt = retryAt(lease, completedAt, terminal)
        return transactions.execute {
            commandPort.finishHostInvitationConvergence(
                lease = lease,
                leaseOwner = leaseOwner,
                succeeded = outcome.succeeded,
                safeErrorCode = outcome.safeErrorCode,
                terminalFailure = !outcome.succeeded && terminal,
                completedAt = completedAt,
                retryAt = retryAt,
            )
        } == true
    }

    private fun retryAt(
        lease: PlatformAdminHostInvitationConvergenceLease,
        completedAt: java.time.Instant,
        terminal: Boolean,
    ): java.time.Instant? {
        if (terminal) return null
        return completedAt.plus(notificationProperties.worker.retryDelays[lease.attemptNo - 1])
    }

    private fun enabled(): Boolean = notificationProperties.enabled && notificationProperties.worker.enabled

    private fun deliver(lease: PlatformAdminHostInvitationConvergenceLease): DeliveryOutcome {
        val target =
            commandPort.loadHostInvitationDeliveryTarget(lease, clock.instant())
        return target?.let { deliverToTarget(lease, it) }
            ?: DeliveryOutcome.failed("HOST_INVITATION_TARGET_UNAVAILABLE", permanent = true)
    }

    private fun deliverToTarget(
        lease: PlatformAdminHostInvitationConvergenceLease,
        target: PlatformAdminHostInvitationDeliveryTarget,
    ): DeliveryOutcome {
        val derived =
            try {
                tokenDeriver.derive(target.invitationId, target.clubId, lease.digestKeyVersion)
            } catch (_: DigestKeyUnavailableException) {
                null
            }
        return when {
            derived == null -> DeliveryOutcome.failed("HOST_INVITATION_KEY_UNAVAILABLE", permanent = true)
            !constantTimeEqual(target.tokenHash, derived.tokenHash) ->
                DeliveryOutcome.failed("HOST_INVITATION_TOKEN_MISMATCH", permanent = true)
            else -> send(target, derived.rawToken.exposeForDelivery())
        }
    }

    private fun send(
        target: PlatformAdminHostInvitationDeliveryTarget,
        rawToken: String,
    ): DeliveryOutcome {
        val acceptUrl =
            "${appBaseUrl.trimEnd('/')}/clubs/${target.clubSlug}/invite/$rawToken"
        return try {
            mailPort.send(
                TransientPlatformAdminHostInvitationMail(
                    to = target.email,
                    clubName = target.clubName,
                    acceptUrl = acceptUrl,
                ),
            )
            DeliveryOutcome.sent()
        } catch (failure: MailDeliveryFailure) {
            DeliveryOutcome.failed(
                failure.kind.storageCode,
                permanent = failure.kind == MailDeliveryFailureKind.PERMANENT,
            )
        } catch (_: RuntimeException) {
            DeliveryOutcome.failed(MailDeliveryFailureKind.AMBIGUOUS.storageCode, permanent = false)
        }
    }

    private fun constantTimeEqual(
        left: String,
        right: String,
    ): Boolean =
        MessageDigest.isEqual(
            left.toByteArray(StandardCharsets.US_ASCII),
            right.toByteArray(StandardCharsets.US_ASCII),
        )

    private data class DeliveryOutcome(
        val succeeded: Boolean,
        val safeErrorCode: String?,
        val permanent: Boolean,
    ) {
        companion object {
            fun sent() = DeliveryOutcome(true, null, true)

            fun failed(
                code: String,
                permanent: Boolean,
            ) = DeliveryOutcome(false, code, permanent)
        }
    }
}
