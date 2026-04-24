package com.readmates.auth.adapter.`in`.web

import com.readmates.auth.application.model.MemberProfile

data class MemberProfileUpdateRequest(
    val shortName: String? = null,
)

data class MemberProfileResponse(
    val membershipId: String,
    val displayName: String,
    val shortName: String,
    val profileImageUrl: String?,
) {
    companion object {
        fun from(profile: MemberProfile) = MemberProfileResponse(
            membershipId = profile.membershipId.toString(),
            displayName = profile.displayName,
            shortName = profile.shortName,
            profileImageUrl = profile.profileImageUrl,
        )
    }
}

data class MemberProfileErrorResponse(
    val code: String,
    val message: String,
)
