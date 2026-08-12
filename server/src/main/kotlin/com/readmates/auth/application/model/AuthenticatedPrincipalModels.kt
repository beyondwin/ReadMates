package com.readmates.auth.application.model

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.club.application.port.`in`.SupportMemberSynthesis
import com.readmates.shared.security.ClubActor
import java.util.UUID

data class AuthenticatedMemberSnapshot(
    val actor: ClubActor,
    val email: String,
    val displayName: String,
    val accountName: String,
    val clubName: String,
    val avatarKey: String,
    val role: MembershipRole,
    val membershipStatus: MembershipStatus,
)

data class ClubContextInput(
    val supplied: Boolean,
    val clubId: UUID?,
    val clubSlug: String?,
    val clubName: String?,
)

data class AuthoritySynthesisRequest(
    val incomingAuthorities: Set<String>,
    val email: String,
    val userId: UUID?,
    val clubContext: ClubContextInput,
    val member: AuthenticatedMemberSnapshot?,
    val supportSynthesis: SupportMemberSynthesis?,
)

data class AuthoritySynthesisResult(
    val authorities: Set<String>,
    val supportSynthesisToAttach: SupportMemberSynthesis?,
)
