package com.readmates.publication.application.port.out

import com.readmates.publication.application.model.ProviderAttemptResult
import com.readmates.publication.application.model.PublicConvergenceClaim
import java.util.UUID

data class PublicCachePurgeCommand(
    val convergenceId: UUID,
    val attemptNo: Int,
    val idempotencyToken: String,
    val clubIdSnapshot: UUID,
    val sessionIdSnapshot: UUID?,
    val publicationIdSnapshot: UUID?,
) {
    companion object {
        fun from(claim: PublicConvergenceClaim): PublicCachePurgeCommand =
            PublicCachePurgeCommand(
                convergenceId = claim.convergenceId,
                attemptNo = claim.attemptNo,
                idempotencyToken = "public-convergence:${claim.convergenceId}:${claim.attemptNo}",
                clubIdSnapshot = claim.clubIdSnapshot,
                sessionIdSnapshot = claim.sessionIdSnapshot,
                publicationIdSnapshot = claim.publicationIdSnapshot,
            )
    }
}

fun interface PublicCachePurgePort {
    fun requestPurge(command: PublicCachePurgeCommand): ProviderAttemptResult
}
