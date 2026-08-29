package com.readmates.auth.application.model

import com.readmates.shared.security.CurrentMember
import java.time.OffsetDateTime

data class TouchClubAccessCommand(
    val member: CurrentMember,
)

data class ClubAccessResult(
    val lastClubAccessAt: OffsetDateTime,
)
