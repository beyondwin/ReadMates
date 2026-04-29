package com.readmates.shared.security

import com.readmates.club.domain.PlatformAdminRole
import java.util.UUID

data class CurrentPlatformAdmin(
    val userId: UUID,
    val email: String,
    val role: PlatformAdminRole,
)

data class CurrentUser(
    val userId: UUID,
    val email: String,
)
