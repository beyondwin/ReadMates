package com.readmates.shared.adminmutation.application.port.out

import com.readmates.shared.adminmutation.application.model.AdminCommandClaimResult
import com.readmates.shared.adminmutation.application.model.AdminCommandDigestKeyRetirementOutcome

interface AdminCommandObservability {
    fun claim(
        commandType: String,
        result: AdminCommandClaimResult,
    )

    fun complete(completed: Boolean)

    fun purge(count: Int)

    fun retirement(outcome: AdminCommandDigestKeyRetirementOutcome)
}
