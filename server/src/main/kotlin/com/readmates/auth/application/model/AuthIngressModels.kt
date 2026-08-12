package com.readmates.auth.application.model

import com.readmates.shared.security.CurrentMember
import java.time.OffsetDateTime
import java.util.UUID

data class IssuedAuthSession(
    val rawToken: String,
    val storedTokenHash: String,
    val userId: String,
    val expiresAt: OffsetDateTime,
)

data class GoogleLoginResult(
    val userId: UUID,
    val currentMember: CurrentMember?,
)
