package com.readmates.publication.application.port.out

import com.readmates.publication.application.model.AppendPublicConvergenceEventCommand
import com.readmates.publication.application.model.ClaimPublicConvergenceWorkCommand
import com.readmates.publication.application.model.ClaimedPublicConvergenceWork
import com.readmates.publication.application.model.CompletePublicConvergenceAttemptCommand
import com.readmates.publication.application.model.PublicConvergenceEvent
import com.readmates.publication.application.model.PublicConvergenceHostSnapshot
import com.readmates.publication.application.model.PublicConvergenceWork
import com.readmates.publication.application.model.PublicMutationConvergenceReceipt
import com.readmates.publication.application.model.PublicProjectionGeneration
import java.util.UUID

interface PublicConvergencePort {
    fun loadGenerationBySession(sessionId: UUID): PublicProjectionGeneration?

    fun loadReceipt(mutationReceiptId: String): PublicMutationConvergenceReceipt?

    fun loadWork(convergenceId: UUID): PublicConvergenceWork?

    fun appendEvent(command: AppendPublicConvergenceEventCommand): PublicConvergenceEvent

    fun currentEvent(convergenceId: UUID): PublicConvergenceEvent?

    fun claimNext(command: ClaimPublicConvergenceWorkCommand): ClaimedPublicConvergenceWork?

    fun completeAttempt(command: CompletePublicConvergenceAttemptCommand): PublicConvergenceEvent

    fun loadHostSnapshot(
        clubId: UUID,
        sessionId: UUID,
        mutationReceiptId: UUID,
    ): PublicConvergenceHostSnapshot?
}
