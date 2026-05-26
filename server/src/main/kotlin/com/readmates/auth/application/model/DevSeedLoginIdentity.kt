package com.readmates.auth.application.model

import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.CurrentPlatformAdmin
import java.util.UUID

data class DevSeedLoginIdentity(
    val userId: UUID,
    val email: String,
    val member: CurrentMember?,
    val platformAdmin: CurrentPlatformAdmin?,
)
