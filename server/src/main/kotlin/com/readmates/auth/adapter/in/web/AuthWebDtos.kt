package com.readmates.auth.adapter.`in`.web

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.shared.security.CurrentMember
import jakarta.validation.constraints.Email
import jakarta.validation.constraints.NotBlank
import java.util.UUID

enum class ApprovalState {
    ANONYMOUS,
    VIEWER,
    ACTIVE,
    SUSPENDED,
    INACTIVE,
}

data class AuthMemberResponse(
    val authenticated: Boolean,
    val userId: UUID?,
    val membershipId: UUID?,
    val clubId: UUID?,
    val email: String?,
    val displayName: String?,
    val shortName: String?,
    val role: MembershipRole?,
    val membershipStatus: MembershipStatus?,
    val approvalState: ApprovalState,
) {
    companion object {
        fun from(member: CurrentMember) = AuthMemberResponse(
            authenticated = true,
            userId = member.userId,
            membershipId = member.membershipId,
            clubId = member.clubId,
            email = member.email,
            displayName = member.displayName,
            shortName = member.shortName,
            role = member.role,
            membershipStatus = member.membershipStatus,
            approvalState = when (member.membershipStatus) {
                MembershipStatus.VIEWER -> ApprovalState.VIEWER
                MembershipStatus.ACTIVE -> ApprovalState.ACTIVE
                MembershipStatus.SUSPENDED -> ApprovalState.SUSPENDED
                MembershipStatus.LEFT,
                MembershipStatus.INACTIVE,
                MembershipStatus.INVITED -> ApprovalState.INACTIVE
            },
        )

        fun anonymous(email: String? = null) = AuthMemberResponse(
            authenticated = false,
            userId = null,
            membershipId = null,
            clubId = null,
            email = email,
            displayName = null,
            shortName = null,
            role = null,
            membershipStatus = null,
            approvalState = ApprovalState.ANONYMOUS,
        )
    }
}

class CreateInvitationRequest(email: String, name: String, applyToCurrentSession: Boolean? = null) {
    @field:NotBlank
    @field:Email
    val email: String = email.trim()

    @field:NotBlank
    val name: String = name.trim()

    val applyToCurrentSession: Boolean = applyToCurrentSession ?: true
}

data class DevLoginRequest(
    @field:NotBlank
    @field:Email
    val email: String,
)

data class InvitationErrorResponse(
    val code: String,
    val message: String,
)
