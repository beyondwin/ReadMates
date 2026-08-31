package com.readmates.hostworkspace.adapter.out.source

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.hostworkspace.application.model.HostOperatingRoomActor
import com.readmates.hostworkspace.application.model.HostOperatingRoomCandidate
import com.readmates.hostworkspace.application.model.HostOperatingRoomCandidateState
import com.readmates.hostworkspace.application.port.out.HostOperatingRoomCandidateSourcePort
import com.readmates.session.application.port.`in`.ListHostOperatingRoomCandidatesUseCase
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Component

@Component
class SessionOperatingRoomCandidateSourceAdapter(
    private val candidates: ListHostOperatingRoomCandidatesUseCase,
) : HostOperatingRoomCandidateSourcePort {
    override fun loadCandidates(actor: HostOperatingRoomActor): List<HostOperatingRoomCandidate> =
        candidates.listHostOperatingRoomCandidates(actor.toCurrentMember()).map { candidate ->
            HostOperatingRoomCandidate(
                sessionId = candidate.sessionId,
                state = HostOperatingRoomCandidateState.valueOf(candidate.state.name),
                scheduleSeenAvailable = candidate.scheduleSeenAvailable,
            )
        }
}

internal fun HostOperatingRoomActor.toCurrentMember() =
    CurrentMember(
        userId = userId,
        membershipId = membershipId,
        clubId = clubId,
        clubSlug = clubSlug,
        email = "",
        displayName = "",
        accountName = "",
        role = if (activeHost) MembershipRole.HOST else MembershipRole.MEMBER,
        membershipStatus = if (activeHost) MembershipStatus.ACTIVE else MembershipStatus.INACTIVE,
    )
