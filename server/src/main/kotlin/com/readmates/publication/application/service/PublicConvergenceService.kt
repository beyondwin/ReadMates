package com.readmates.publication.application.service

import com.readmates.publication.application.model.ClaimPublicConvergenceWorkCommand
import com.readmates.publication.application.model.CompletePublicConvergenceAttemptCommand
import com.readmates.publication.application.model.ConvergenceAttemptStatus
import com.readmates.publication.application.model.PublicConvergenceProcessResult
import com.readmates.publication.application.model.providerIdempotencyToken
import com.readmates.publication.application.port.`in`.ProcessPublicConvergenceUseCase
import com.readmates.publication.application.port.out.ProviderAttemptResult
import com.readmates.publication.application.port.out.ProviderFailureCategory
import com.readmates.publication.application.port.out.PublicCachePurgeCommand
import com.readmates.publication.application.port.out.PublicCachePurgePort
import com.readmates.publication.application.port.out.PublicConvergencePort
import com.readmates.publication.config.PublicConvergenceProperties
import io.micrometer.core.instrument.MeterRegistry
import org.springframework.stereotype.Service
import java.time.Clock

@Service
class PublicConvergenceService(
    private val convergencePort: PublicConvergencePort,
    private val purgePort: PublicCachePurgePort,
    private val properties: PublicConvergenceProperties,
    private val meterRegistry: MeterRegistry,
    private val clock: Clock,
) : ProcessPublicConvergenceUseCase {
    override fun processOne(workerId: String): PublicConvergenceProcessResult {
        require(WORKER_ID.matches(workerId)) { "Public convergence worker id is invalid" }
        return if (properties.enabled) processEnabled(workerId) else PublicConvergenceProcessResult.NO_WORK
    }

    private fun processEnabled(workerId: String): PublicConvergenceProcessResult {
        val startedAt = clock.instant()
        val claim =
            convergencePort.claimNext(
                ClaimPublicConvergenceWorkCommand(
                    workerId = workerId,
                    now = startedAt,
                    leaseExpiresAt = startedAt.plus(properties.leaseDuration),
                    maxAttempts = properties.maxAttempts,
                ),
            ) ?: return PublicConvergenceProcessResult.NO_WORK
        val providerCall = requestProvider(claim.toProviderCommand())
        val completedAt = clock.instant()
        val terminal = providerCall.result.toTerminal(providerCall.metricOutcome)
        convergencePort.completeAttempt(
            CompletePublicConvergenceAttemptCommand(
                convergenceId = claim.convergenceId,
                attemptNo = claim.attemptNo,
                workerId = workerId,
                status = terminal.status,
                observedAt = completedAt,
                resultCategory = terminal.category,
                nextAvailableAt = completedAt.plus(backoff(claim.attemptNo)),
                exhausted = terminal.exhausted || claim.attemptNo >= properties.maxAttempts,
            ),
        )
        meterRegistry.counter(METRIC_ATTEMPTS, "outcome", terminal.metricOutcome).increment()
        return PublicConvergenceProcessResult.PROCESSED
    }

    private fun requestProvider(command: PublicCachePurgeCommand): ProviderCall =
        try {
            ProviderCall(purgePort.requestPurge(command), metricOutcome = null)
        } catch (_: RuntimeException) {
            ProviderCall(
                ProviderAttemptResult.Failed(ProviderFailureCategory.UNAVAILABLE, retryable = true),
                metricOutcome = "provider_exception",
            )
        }

    private fun backoff(attemptNo: Int): java.time.Duration {
        val multiplier = 1L shl (attemptNo - 1).coerceAtMost(MAX_BACKOFF_SHIFT)
        val candidate = properties.initialBackoff.multipliedBy(multiplier)
        return if (candidate > properties.maxBackoff) properties.maxBackoff else candidate
    }

    private fun com.readmates.publication.application.model.ClaimedPublicConvergenceWork.toProviderCommand() =
        PublicCachePurgeCommand(
            convergenceId = convergenceId,
            publicationId = publicationId,
            sessionId = sessionId,
            committedGeneration = committedGeneration,
            originReadable = originReadable,
            idempotencyToken = providerIdempotencyToken(convergenceId, attemptNo),
        )

    private fun ProviderAttemptResult.toTerminal(metricOutcome: String?): TerminalResult =
        when (this) {
            is ProviderAttemptResult.Succeeded ->
                TerminalResult(
                    status = ConvergenceAttemptStatus.SUCCEEDED,
                    category = category.name,
                    exhausted = true,
                    metricOutcome = metricOutcome ?: "succeeded",
                )
            is ProviderAttemptResult.Failed ->
                TerminalResult(
                    status = ConvergenceAttemptStatus.FAILED,
                    category = category.name,
                    exhausted = !retryable,
                    metricOutcome = metricOutcome ?: "failed",
                )
        }

    private data class ProviderCall(
        val result: ProviderAttemptResult,
        val metricOutcome: String?,
    )

    private data class TerminalResult(
        val status: ConvergenceAttemptStatus,
        val category: String,
        val exhausted: Boolean,
        val metricOutcome: String,
    )

    private companion object {
        const val METRIC_ATTEMPTS = "readmates.public.convergence.attempts"
        const val MAX_BACKOFF_SHIFT = 20
        val WORKER_ID = Regex("^[A-Za-z0-9._-]{1,128}$")
    }
}
