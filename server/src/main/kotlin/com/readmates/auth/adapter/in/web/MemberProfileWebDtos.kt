package com.readmates.auth.adapter.`in`.web

data class MemberProfileUpdateRequest(
    val shortName: String? = null,
)

data class MemberProfileErrorResponse(
    val code: String,
    val message: String,
)
