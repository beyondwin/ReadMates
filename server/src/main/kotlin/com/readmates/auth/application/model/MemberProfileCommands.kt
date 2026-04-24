package com.readmates.auth.application.model

import java.util.UUID

data class UpdateMemberProfileCommand(
    val displayName: String?,
)

data class MemberProfile(
    val membershipId: UUID,
    val displayName: String,
    val accountName: String,
    val profileImageUrl: String?,
)
