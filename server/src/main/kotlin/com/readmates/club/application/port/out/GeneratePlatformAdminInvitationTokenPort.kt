package com.readmates.club.application.port.out

data class GeneratedPlatformAdminInvitationToken(
    val rawToken: String,
    val tokenHash: String,
)

fun interface GeneratePlatformAdminInvitationTokenPort {
    fun generate(): GeneratedPlatformAdminInvitationToken
}
