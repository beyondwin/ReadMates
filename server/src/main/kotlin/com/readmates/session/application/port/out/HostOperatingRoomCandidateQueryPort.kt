package com.readmates.session.application.port.out

import com.readmates.session.application.model.HostOperatingRoomCandidate
import java.time.LocalDateTime
import java.util.UUID

interface HostOperatingRoomCandidateQueryPort {
    fun loadHostOperatingRoomCandidates(
        clubId: UUID,
        evaluatedAt: LocalDateTime,
    ): List<HostOperatingRoomCandidate>
}
