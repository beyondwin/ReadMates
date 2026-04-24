package com.readmates.auth.application

import com.readmates.auth.application.port.out.HostMemberListRow
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.session.domain.SessionParticipationStatus
import java.util.UUID

fun HostMemberListRow.toHostMemberListItem(currentMembershipId: UUID): HostMemberListItem {
    val isSelf = membershipId == currentMembershipId
    val isMutableMember = role == MembershipRole.MEMBER && !isSelf
    return HostMemberListItem(
        membershipId = membershipId.toString(),
        userId = userId.toString(),
        email = email,
        displayName = displayName,
        shortName = shortName,
        profileImageUrl = profileImageUrl,
        role = role,
        status = status,
        joinedAt = joinedAt?.toString(),
        createdAt = createdAt.toString(),
        currentSessionParticipationStatus = participationStatus,
        canSuspend = isMutableMember && status == MembershipStatus.ACTIVE,
        canRestore = isMutableMember && status == MembershipStatus.SUSPENDED,
        canDeactivate = isMutableMember &&
            status in setOf(MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED, MembershipStatus.VIEWER),
        canAddToCurrentSession = isMutableMember &&
            currentSessionId != null &&
            status == MembershipStatus.ACTIVE &&
            participationStatus != SessionParticipationStatus.ACTIVE,
        canRemoveFromCurrentSession = isMutableMember &&
            currentSessionId != null &&
            status == MembershipStatus.ACTIVE &&
            participationStatus == SessionParticipationStatus.ACTIVE,
    )
}
