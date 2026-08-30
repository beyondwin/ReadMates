package com.readmates.hostworkspace.application.port.out

import com.readmates.hostworkspace.application.model.HostOperatingRoomActor
import com.readmates.hostworkspace.application.model.HostOperatingRoomCandidate
import com.readmates.hostworkspace.application.model.HostOperatingRoomClosingRequirementResult
import java.util.UUID

interface HostOperatingRoomCandidateSourcePort {
    fun loadCandidates(actor: HostOperatingRoomActor): List<HostOperatingRoomCandidate>
}

interface HostOperatingRoomClosingRequirementSourcePort {
    fun loadClosingRequirement(
        actor: HostOperatingRoomActor,
        sessionId: UUID,
    ): HostOperatingRoomClosingRequirementResult
}
