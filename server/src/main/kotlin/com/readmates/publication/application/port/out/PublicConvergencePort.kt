package com.readmates.publication.application.port.out

import com.readmates.publication.application.model.AppendPublicConvergenceEventCommand
import com.readmates.publication.application.model.PublicConvergenceEvent
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
}
