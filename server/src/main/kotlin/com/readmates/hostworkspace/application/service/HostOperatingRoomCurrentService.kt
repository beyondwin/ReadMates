package com.readmates.hostworkspace.application.service

import com.readmates.hostworkspace.application.model.HostOperatingRoomAccessDeniedException
import com.readmates.hostworkspace.application.model.HostOperatingRoomActor
import com.readmates.hostworkspace.application.model.HostOperatingRoomAvailabilityException
import com.readmates.hostworkspace.application.model.HostOperatingRoomCandidate
import com.readmates.hostworkspace.application.model.HostOperatingRoomCandidateState
import com.readmates.hostworkspace.application.model.HostOperatingRoomClosingRequirement
import com.readmates.hostworkspace.application.model.HostOperatingRoomClosingRequirementResult
import com.readmates.hostworkspace.application.model.HostOperatingRoomCurrent
import com.readmates.hostworkspace.application.model.HostOperatingRoomCurrentMeeting
import com.readmates.hostworkspace.application.model.HostOperatingRoomScheduleSeenAvailability
import com.readmates.hostworkspace.application.model.HostOperatingRoomSelection
import com.readmates.hostworkspace.application.port.`in`.GetHostOperatingRoomCurrentUseCase
import com.readmates.hostworkspace.application.port.out.HostOperatingRoomCandidateSourcePort
import com.readmates.hostworkspace.application.port.out.HostOperatingRoomClosingRequirementSourcePort
import org.springframework.stereotype.Service

@Service
class HostOperatingRoomCurrentService(
    private val candidateSource: HostOperatingRoomCandidateSourcePort,
    private val closingRequirementSource: HostOperatingRoomClosingRequirementSourcePort,
) : GetHostOperatingRoomCurrentUseCase {
    override fun current(actor: HostOperatingRoomActor): HostOperatingRoomCurrent {
        if (!actor.activeHost) throw HostOperatingRoomAccessDeniedException()

        val candidates = candidateSource.loadCandidates(actor)
        candidates.firstOrNull { candidate -> candidate.state == HostOperatingRoomCandidateState.OPEN }?.let {
            return HostOperatingRoomCurrent(it.toCurrentMeeting(HostOperatingRoomSelection.OPEN))
        }
        candidates.firstOrNull { candidate -> candidate.state == HostOperatingRoomCandidateState.DRAFT }?.let {
            return HostOperatingRoomCurrent(it.toCurrentMeeting(HostOperatingRoomSelection.UPCOMING_DRAFT))
        }
        candidates
            .asSequence()
            .filter { candidate -> candidate.state == HostOperatingRoomCandidateState.CLOSED }
            .forEach { candidate ->
                when (val result = closingRequirementSource.loadClosingRequirement(actor, candidate.sessionId)) {
                    is HostOperatingRoomClosingRequirementResult.Available ->
                        if (result.requirement == HostOperatingRoomClosingRequirement.REQUIRED) {
                            return HostOperatingRoomCurrent(
                                candidate.toCurrentMeeting(HostOperatingRoomSelection.CLOSING_REQUIRED),
                            )
                        }
                    HostOperatingRoomClosingRequirementResult.Unavailable ->
                        throw HostOperatingRoomAvailabilityException()
                }
            }
        return HostOperatingRoomCurrent(null)
    }
}

private fun HostOperatingRoomCandidate.toCurrentMeeting(selection: HostOperatingRoomSelection) =
    HostOperatingRoomCurrentMeeting(
        sessionId = sessionId,
        selection = selection,
        scheduleSeenAvailability =
            if (scheduleSeenAvailable) {
                HostOperatingRoomScheduleSeenAvailability.AVAILABLE
            } else {
                HostOperatingRoomScheduleSeenAvailability.UNAVAILABLE
            },
    )
