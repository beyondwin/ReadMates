package com.readmates.publication.application.service

import com.readmates.publication.application.model.ConvergenceAttemptStatus
import com.readmates.publication.application.model.PublicConvergenceNotAuthorizedException
import com.readmates.publication.application.model.PublicConvergenceNotFoundException
import com.readmates.publication.application.model.PublicConvergenceView
import com.readmates.publication.application.port.`in`.GetHostPublicConvergenceUseCase
import com.readmates.publication.application.port.out.PublicConvergencePort
import com.readmates.publication.config.PublicConvergenceProperties
import com.readmates.shared.security.ClubActor
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class HostPublicConvergenceQueryService(
    private val convergencePort: PublicConvergencePort,
    private val properties: PublicConvergenceProperties,
) : GetHostPublicConvergenceUseCase {
    override fun getConvergence(
        actor: ClubActor,
        sessionId: UUID,
        mutationReceiptId: UUID,
    ): PublicConvergenceView {
        if (!actor.isHost) {
            throw PublicConvergenceNotAuthorizedException()
        }
        val snapshot =
            convergencePort.loadHostSnapshot(actor.clubId, sessionId, mutationReceiptId)
                ?: throw PublicConvergenceNotFoundException()
        val current = snapshot.currentEvent
        return PublicConvergenceView(
            convergenceId = snapshot.receipt.convergenceId,
            originResult = if (snapshot.receipt.originReadable) "READABLE" else "DENIED",
            committedGeneration = snapshot.receipt.committedGeneration,
            status = current?.status?.name ?: "QUEUED",
            lastAttemptAt = current?.observedAt,
            retryable =
                current?.status == ConvergenceAttemptStatus.FAILED &&
                    snapshot.nextAttemptNo <= properties.maxAttempts,
        )
    }
}
