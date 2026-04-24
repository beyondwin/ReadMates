package com.readmates.auth.application.model

import java.util.UUID

data class UpdateMemberProfileCommand(
    val shortName: String?,
)

data class MemberProfile(
    val membershipId: UUID,
    val displayName: String,
    val shortName: String,
    val profileImageUrl: String?,
)
