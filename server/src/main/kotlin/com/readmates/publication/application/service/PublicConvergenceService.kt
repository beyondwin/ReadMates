package com.readmates.publication.application.service

import com.readmates.publication.application.model.ProviderAttemptResult
import com.readmates.publication.application.model.ProviderAttemptStatus
import com.readmates.publication.application.model.ProviderResultCategory
import com.readmates.publication.application.model.PublicConvergenceView
import com.readmates.publication.application.port.`in`.HostPublicConvergenceUseCase
import com.readmates.publication.application.port.`in`.PlatformAdminPublicConvergenceUseCase
import com.readmates.publication.application.port.`in`.ProcessPublicConvergenceUseCase
import com.readmates.publication.application.port.out.PublicCachePurgeCommand
import com.readmates.publication.application.port.out.PublicCachePurgePort
import com.readmates.publication.application.port.out.PublicConvergencePort
import com.readmates.publication.config.PublicConvergenceProperties
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.PlatformActor
import com.readmates.shared.security.PlatformCapability
import org.springframework.stereotype.Service
import java.time.Clock
import java.time.Duration
import java.util.UUID

@Service
class PublicConvergenceService(
    private val convergencePort: PublicConvergencePort,
    private val purgePort: PublicCachePurgePort,
    private val properties: PublicConvergenceProperties,
    private val clock: Clock,
    private val metrics: PublicConvergenceMetrics,
) : HostPublicConvergenceUseCase,
    PlatformAdminPublicConvergenceUseCase,
    ProcessPublicConvergenceUseCase {
    override fun processBatch(leaseOwner: String): Int {
        if (!properties.enabled) return 0
        var processed = 0
        repeat(properties.batchSize) {
            if (!processNext(leaseOwner)) return processed
            processed += 1
        }
        return processed
    }

    fun processNext(leaseOwner: String): Boolean {
        if (!properties.enabled) return false
        val now = clock.instant()
        val claim =
            convergencePort.claimNext(
                leaseOwner = leaseOwner,
                now = now,
                leaseDuration = properties.leaseDuration,
                maxAttempts = properties.maxAttempts,
            ) ?: return false
        val result =
            runCatching { purgePort.requestPurge(PublicCachePurgeCommand.from(claim)) }
                .getOrElse {
                    ProviderAttemptResult(
                        ProviderAttemptStatus.FAILED,
                        ProviderResultCategory.TEMPORARY_FAILURE,
                        retryable = true,
                    )
                }
        val observedAt = clock.instant()
        val nextAvailableAt = observedAt.plus(backoffFor(claim.attemptNo))
        val completed =
            convergencePort.completeAttempt(
                claim = claim,
                result = result,
                observedAt = observedAt,
                nextAvailableAt = nextAvailableAt,
                maxAttempts = properties.maxAttempts,
            )
        if (completed) metrics.record(result)
        return completed
    }

    override fun view(
        host: CurrentMember,
        sessionId: UUID,
    ): PublicConvergenceView? {
        requireHost(host)
        if (!properties.enabled) return null
        return convergencePort.loadLatestView(host.clubId, sessionId, properties.maxAttempts)
    }

    override fun retry(
        host: CurrentMember,
        sessionId: UUID,
        convergenceId: UUID,
    ): PublicConvergenceView? {
        requireHost(host)
        if (!properties.enabled) return null
        return convergencePort.requestRetry(
            host.clubId,
            sessionId,
            convergenceId,
            clock.instant(),
            properties.maxAttempts,
        )
    }

    override fun view(
        actor: PlatformActor,
        receiptId: UUID,
    ) = requireEmergencyTakedown(actor) {
        if (!properties.enabled) null else convergencePort.loadAdminTakedownView(receiptId, properties.maxAttempts)
    }

    override fun retry(
        actor: PlatformActor,
        receiptId: UUID,
    ) = requireEmergencyTakedown(actor) {
        if (!properties.enabled) {
            null
        } else {
            convergencePort.requestAdminTakedownRetry(receiptId, clock.instant(), properties.maxAttempts)
        }
    }

    private fun backoffFor(attemptNo: Int): Duration {
        val multiplier = 1L shl (attemptNo - 1).coerceIn(0, 30)
        val candidate = properties.initialBackoff.multipliedBy(multiplier)
        return if (candidate > properties.maxBackoff) properties.maxBackoff else candidate
    }

    private fun requireHost(member: CurrentMember) {
        if (!member.isHost) throw AccessDeniedException("Host role required")
    }

    private fun <T> requireEmergencyTakedown(
        actor: PlatformActor,
        block: () -> T,
    ): T {
        if (!actor.can(PlatformCapability.EMERGENCY_PUBLIC_TAKEDOWN)) {
            throw AccessDeniedException("Emergency public takedown capability required")
        }
        return block()
    }
}
