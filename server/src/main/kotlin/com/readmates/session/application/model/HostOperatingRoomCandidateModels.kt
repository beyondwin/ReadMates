package com.readmates.session.application.model

import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID

enum class HostOperatingRoomCandidateState {
    OPEN,
    DRAFT,
    CLOSED,
}

data class HostOperatingRoomCandidate(
    val sessionId: UUID,
    val state: HostOperatingRoomCandidateState,
    val meetingDate: LocalDate,
    val startTime: LocalTime,
    val sessionNumber: Int,
    val scheduleSeenAvailable: Boolean,
)
