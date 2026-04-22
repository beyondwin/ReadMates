package com.readmates.auth.api

import com.readmates.auth.application.AuthenticatedMemberResolver
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.emailOrNull
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

enum class ApprovalState {
    ANONYMOUS,
    PENDING_APPROVAL,
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
                MembershipStatus.PENDING_APPROVAL -> ApprovalState.PENDING_APPROVAL
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

@RestController
@RequestMapping("/api/auth/me")
class AuthMeController(
    private val authenticatedMemberResolver: AuthenticatedMemberResolver,
) {
    @GetMapping
    fun me(authentication: Authentication?): AuthMemberResponse {
        val member = authenticatedMemberResolver.resolve(authentication)
            ?: return AuthMemberResponse.anonymous(authentication.emailOrNull())
        return AuthMemberResponse.from(member)
    }
}
