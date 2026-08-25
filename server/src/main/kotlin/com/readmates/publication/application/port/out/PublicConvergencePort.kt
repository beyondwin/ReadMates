package com.readmates.publication.application.port.out

import com.readmates.publication.application.model.PlatformAdminPublicConvergenceView
import com.readmates.publication.application.model.ProviderAttemptResult
import com.readmates.publication.application.model.PublicConvergenceClaim
import com.readmates.publication.application.model.PublicConvergenceEvent
import com.readmates.publication.application.model.PublicConvergenceView
import com.readmates.publication.application.model.PublicConvergenceWork
import com.readmates.publication.application.model.PublicMutationConvergenceReceipt
import java.time.Duration
import java.time.Instant
import java.util.UUID

interface PublicConvergencePort {
    fun loadReceipt(mutationReceiptId: String): PublicMutationConvergenceReceipt?

    fun loadWork(convergenceId: UUID): PublicConvergenceWork?

    fun loadCurrentEvent(convergenceId: UUID): PublicConvergenceEvent?

    fun claimNext(
        leaseOwner: String,
        now: Instant,
        leaseDuration: Duration,
        maxAttempts: Int,
    ): PublicConvergenceClaim?

    fun completeAttempt(
        claim: PublicConvergenceClaim,
        result: ProviderAttemptResult,
        observedAt: Instant,
        nextAvailableAt: Instant,
        maxAttempts: Int,
    ): Boolean

    fun loadLatestView(
        clubId: UUID,
        sessionId: UUID,
        maxAttempts: Int,
    ): PublicConvergenceView?

    fun requestRetry(
        clubId: UUID,
        sessionId: UUID,
        convergenceId: UUID,
        now: Instant,
        maxAttempts: Int,
    ): PublicConvergenceView?

    fun loadAdminTakedownView(
        receiptId: UUID,
        maxAttempts: Int,
    ): PlatformAdminPublicConvergenceView?

    fun requestAdminTakedownRetry(
        receiptId: UUID,
        now: Instant,
        maxAttempts: Int,
    ): PlatformAdminPublicConvergenceView?
}
