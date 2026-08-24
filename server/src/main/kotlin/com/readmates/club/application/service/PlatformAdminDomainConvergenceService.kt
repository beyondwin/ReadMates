package com.readmates.club.application.service

import com.readmates.club.application.PlatformAdminError
import com.readmates.club.application.PlatformAdminException
import com.readmates.club.application.model.CLUB_DOMAIN_RECHECK_COMMAND_TYPE
import com.readmates.club.application.model.ClubDomainActualCheckResult
import com.readmates.club.application.model.PlatformAdminClubCommandReceipt
import com.readmates.club.application.port.out.CheckClubDomainActualStatePort
import com.readmates.club.application.port.out.LoadClubDomainOperationalHostnamePort
import com.readmates.club.application.port.out.PlatformAdminClubCommandPort
import com.readmates.club.application.port.out.PlatformAdminDomainConvergenceAcquisition
import com.readmates.club.application.port.out.PlatformAdminDomainConvergenceLease
import com.readmates.club.domain.ClubDomainStatus
import com.readmates.shared.adminmutation.config.AdminCommandIdempotencyProperties
import com.readmates.shared.security.PlatformActor
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.time.Duration
import java.util.UUID

@Service
class PlatformAdminDomainConvergenceService(
    private val commandPort: PlatformAdminClubCommandPort,
    private val operationalHostnamePort: LoadClubDomainOperationalHostnamePort,
    private val checker: CheckClubDomainActualStatePort,
    private val properties: AdminCommandIdempotencyProperties,
    private val transactions: TransactionTemplate,
    private val clock: Clock,
) {
    fun process(
        receipt: PlatformAdminClubCommandReceipt,
        admin: PlatformActor,
    ): PlatformAdminClubCommandReceipt {
        receipt.convergenceId?.let(::process)
        return refresh(receipt, admin)
    }

    fun process(convergenceId: UUID) {
        val leaseOwner = UUID.randomUUID().toString()
        val startedAt = clock.instant()
        val acquisition =
            transactions.execute {
                commandPort.tryAcquireDomainConvergence(
                    convergenceId,
                    leaseOwner,
                    startedAt,
                    startedAt.plus(CONVERGENCE_LEASE),
                )
            }
        val lease =
            when (acquisition) {
                is PlatformAdminDomainConvergenceAcquisition.Acquired -> acquisition.lease
                PlatformAdminDomainConvergenceAcquisition.Terminalized,
                PlatformAdminDomainConvergenceAcquisition.Unavailable,
                -> return
            }
        val actual = safeCheck(lease)
        val completedAt = clock.instant()
        val failed = actual.status != ClubDomainStatus.ACTIVE
        val terminalFailure = failed && lease.attemptNo >= properties.domainConvergenceMaxAttempts
        val safeErrorCode = actual.errorCode.safeErrorCode().takeIf { failed }
        val retryAt = completedAt.plus(CONVERGENCE_RETRY).takeIf { failed && !terminalFailure }
        transactions.executeWithoutResult {
            val completed =
                commandPort.finishDomainConvergence(
                    lease,
                    leaseOwner,
                    actual,
                    safeErrorCode,
                    terminalFailure,
                    completedAt,
                    retryAt,
                )
            if (!completed) fail(PlatformAdminError.COMMAND_IN_PROGRESS)
        }
    }

    private fun safeCheck(lease: PlatformAdminDomainConvergenceLease): ClubDomainActualCheckResult =
        operationalHostnamePort.loadOperationalHostname(lease.domainId)?.let { hostname ->
            try {
                checker.check(hostname)
            } catch (_: RuntimeException) {
                ClubDomainActualCheckResult(ClubDomainStatus.FAILED, "DOMAIN_PROVIDER_UNAVAILABLE")
            }
        } ?: ClubDomainActualCheckResult(ClubDomainStatus.FAILED, "DOMAIN_TARGET_NOT_FOUND")

    private fun refresh(
        receipt: PlatformAdminClubCommandReceipt,
        admin: PlatformActor,
    ): PlatformAdminClubCommandReceipt {
        val recheck = receipt.commandType == CLUB_DOMAIN_RECHECK_COMMAND_TYPE
        val targetType =
            if (recheck) {
                PlatformAdminDomainCommandPolicy.DOMAIN_TARGET_TYPE
            } else {
                PlatformAdminDomainCommandPolicy.CLUB_TARGET_TYPE
            }
        val targetId = receipt.targetId.takeIf { recheck } ?: receipt.clubId
        return commandPort.loadReceipt(
            receipt.receiptId,
            admin.adminId,
            receipt.commandType,
            targetType,
            targetId,
        ) ?: receipt
    }

    private fun String?.safeErrorCode(): String = this?.takeIf(SAFE_ERROR_CODES::contains) ?: "DOMAIN_CHECK_FAILED"

    private fun fail(error: PlatformAdminError): Nothing = throw PlatformAdminException(error, error.name)

    private companion object {
        private val SAFE_ERROR_CODES =
            setOf(
                "DOMAIN_CHECK_INVALID_HOSTNAME",
                "DOMAIN_CHECK_DNS_FAILED",
                "DOMAIN_CHECK_PRIVATE_ADDRESS",
                "DOMAIN_CHECK_CIRCUIT_OPEN",
                "DOMAIN_CHECK_UNREACHABLE",
                "DOMAIN_CHECK_REDIRECT",
                "DOMAIN_CHECK_RESPONSE_TOO_LARGE",
                "DOMAIN_CHECK_MARKER_MISMATCH",
                "DOMAIN_PROVIDER_UNAVAILABLE",
                "DOMAIN_TARGET_NOT_FOUND",
            ) + (100..599).mapTo(linkedSetOf()) { "DOMAIN_CHECK_HTTP_$it" }
        private val CONVERGENCE_LEASE = Duration.ofMinutes(1)
        private val CONVERGENCE_RETRY = Duration.ofSeconds(30)
    }
}
