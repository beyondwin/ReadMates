package com.readmates.publication.application.port.out

import com.readmates.publication.application.model.PublicConvergenceEvent
import com.readmates.publication.application.model.PublicConvergenceWork
import com.readmates.publication.application.model.PublicMutationConvergenceReceipt
import java.util.UUID

interface PublicConvergencePort {
    fun loadReceipt(mutationReceiptId: String): PublicMutationConvergenceReceipt?

    fun loadWork(convergenceId: UUID): PublicConvergenceWork?

    fun loadCurrentEvent(convergenceId: UUID): PublicConvergenceEvent?
}
