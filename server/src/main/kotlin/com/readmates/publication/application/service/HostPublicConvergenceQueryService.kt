package com.readmates.publication.application.service

import com.readmates.publication.application.model.ConvergenceAttemptStatus
import com.readmates.publication.application.model.PublicConvergenceHostSnapshot
import com.readmates.publication.application.model.PublicConvergenceNotAuthorizedException
import com.readmates.publication.application.model.PublicConvergenceNotFoundException
import com.readmates.publication.application.model.PublicConvergenceRetryUnavailableException
import com.readmates.publication.application.model.PublicConvergenceView
import com.readmates.publication.application.port.`in`.GetHostPublicConvergenceUseCase
import com.readmates.publication.application.port.out.PublicConvergencePort
import com.readmates.publication.config.PublicConvergenceProperties
import com.readmates.shared.security.ClubActor
import org.springframework.stereotype.Service
import java.time.Clock
import java.util.UUID

@Service
class HostPublicConvergenceQueryService(
    private val convergencePort: PublicConvergencePort,
    private val properties: PublicConvergenceProperties,
    private val clock: Clock,
) : GetHostPublicConvergenceUseCase {
    override fun getConvergence(
        actor: ClubActor,
        sessionId: UUID,
        mutationReceiptId: UUID,
    ): PublicConvergenceView {
        authorize(actor)
        val snapshot =
            convergencePort.loadHostSnapshot(actor.clubId, sessionId, mutationReceiptId)
                ?: throw PublicConvergenceNotFoundException()
        return snapshot.toView()
    }

    override fun getLatestConvergence(
        actor: ClubActor,
        sessionId: UUID,
    ): PublicConvergenceView? {
        authorize(actor)
        return convergencePort.loadLatestHostSnapshot(actor.clubId, sessionId)?.toView()
    }

    override fun retryConvergence(
        actor: ClubActor,
        sessionId: UUID,
        convergenceId: UUID,
    ): PublicConvergenceView {
        authorize(actor)
        val snapshot =
            loadMatchingSnapshot(actor, sessionId, convergenceId)
                ?: throw PublicConvergenceNotFoundException()
        val view = snapshot.toView()
        val retryRequested =
            convergencePort.requestHostRetry(
                clubId = actor.clubId,
                sessionId = sessionId,
                convergenceId = convergenceId,
                now = clock.instant(),
                maxAttempts = properties.maxAttempts,
            )
        if (!view.retryable || !retryRequested) {
            throw PublicConvergenceRetryUnavailableException()
        }
        return view.copy(status = "PENDING", retryable = false)
    }

    private fun loadMatchingSnapshot(
        actor: ClubActor,
        sessionId: UUID,
        convergenceId: UUID,
    ): PublicConvergenceHostSnapshot? {
        val snapshot = convergencePort.loadLatestHostSnapshot(actor.clubId, sessionId) ?: return null
        return snapshot.takeIf { it.receipt.convergenceId == convergenceId }
    }

    private fun authorize(actor: ClubActor) {
        if (!actor.isHost) throw PublicConvergenceNotAuthorizedException()
    }

    private fun PublicConvergenceHostSnapshot.toView(): PublicConvergenceView {
        val current = currentEvent
        val retainedWork = nextAttemptNo != null
        return PublicConvergenceView(
            convergenceId = receipt.convergenceId,
            originResult = if (receipt.originReadable) "READABLE" else "DENIED",
            committedGeneration = receipt.committedGeneration,
            status =
                if (!retainedWork && (current == null || current.status == ConvergenceAttemptStatus.PENDING)) {
                    "EXPIRED"
                } else {
                    current?.status?.name ?: "QUEUED"
                },
            lastAttemptAt = current?.observedAt,
            retryable =
                retainedWork &&
                    current?.status == ConvergenceAttemptStatus.FAILED &&
                    requireNotNull(nextAttemptNo) <= properties.maxAttempts,
        )
    }
}
