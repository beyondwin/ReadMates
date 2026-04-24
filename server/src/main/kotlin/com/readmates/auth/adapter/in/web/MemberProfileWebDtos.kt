package com.readmates.auth.adapter.`in`.web

import com.readmates.auth.application.model.MemberProfile

data class MemberProfileUpdateRequest(
    val displayName: String? = null,
)

data class MemberProfileResponse(
    val membershipId: String,
    val displayName: String,
    val accountName: String,
    val profileImageUrl: String?,
) {
    companion object {
        fun from(profile: MemberProfile) = MemberProfileResponse(
            membershipId = profile.membershipId.toString(),
            displayName = profile.displayName,
            accountName = profile.accountName,
            profileImageUrl = profile.profileImageUrl,
        )
    }
}

data class MemberProfileErrorResponse(
    val code: String,
    val message: String,
)
