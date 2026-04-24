package com.readmates.auth.application

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.session.domain.SessionParticipationStatus

enum class CurrentSessionPolicy {
    APPLY_NOW,
    NEXT_SESSION,
}

enum class CurrentSessionPolicyResult {
    APPLIED,
    NOT_APPLICABLE,
    DEFERRED,
}

data class MemberLifecycleRequest(
    val currentSessionPolicy: CurrentSessionPolicy = CurrentSessionPolicy.APPLY_NOW,
)

data class HostMemberListItem(
    val membershipId: String,
    val userId: String,
    val email: String,
    val displayName: String,
    val accountName: String,
    val profileImageUrl: String?,
    val role: MembershipRole,
    val status: MembershipStatus,
    val joinedAt: String?,
    val createdAt: String,
    val currentSessionParticipationStatus: SessionParticipationStatus?,
    val canSuspend: Boolean,
    val canRestore: Boolean,
    val canDeactivate: Boolean,
    val canAddToCurrentSession: Boolean,
    val canRemoveFromCurrentSession: Boolean,
)

data class MemberLifecycleResponse(
    val member: HostMemberListItem,
    val currentSessionPolicyResult: CurrentSessionPolicyResult,
)
