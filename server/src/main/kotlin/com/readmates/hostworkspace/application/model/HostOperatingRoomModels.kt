package com.readmates.hostworkspace.application.model

import java.util.UUID

data class HostOperatingRoomActor(
    val userId: UUID,
    val membershipId: UUID,
    val clubId: UUID,
    val clubSlug: String,
    val activeHost: Boolean,
)

enum class HostOperatingRoomCandidateState {
    OPEN,
    DRAFT,
    CLOSED,
}

data class HostOperatingRoomCandidate(
    val sessionId: UUID,
    val state: HostOperatingRoomCandidateState,
    val scheduleSeenAvailable: Boolean,
)

enum class HostOperatingRoomSelection {
    OPEN,
    UPCOMING_DRAFT,
    CLOSING_REQUIRED,
}

enum class HostOperatingRoomScheduleSeenAvailability {
    AVAILABLE,
    UNAVAILABLE,
}

data class HostOperatingRoomCurrentMeeting(
    val sessionId: UUID,
    val selection: HostOperatingRoomSelection,
    val scheduleSeenAvailability: HostOperatingRoomScheduleSeenAvailability,
)

data class HostOperatingRoomCurrent(
    val currentMeeting: HostOperatingRoomCurrentMeeting?,
)

enum class HostOperatingRoomClosingRequirement {
    REQUIRED,
    RESOLVED,
    PUBLISHED,
}

sealed interface HostOperatingRoomClosingRequirementResult {
    data class Available(
        val requirement: HostOperatingRoomClosingRequirement,
    ) : HostOperatingRoomClosingRequirementResult

    data object Unavailable : HostOperatingRoomClosingRequirementResult
}

class HostOperatingRoomAccessDeniedException : RuntimeException("Active host authority required")

class HostOperatingRoomAvailabilityException : RuntimeException("Host operating-room source unavailable")
