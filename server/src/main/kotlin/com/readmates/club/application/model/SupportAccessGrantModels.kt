package com.readmates.club.application.model

import com.readmates.club.domain.SupportAccessGrantScope
import java.time.OffsetDateTime
import java.util.UUID

data class CreateSupportAccessGrantCommand(
    val clubId: UUID,
    val granteeUserId: UUID,
    val scope: SupportAccessGrantScope,
    val reason: String,
    val expiresAt: OffsetDateTime,
)

data class SupportAccessGrant(
    val id: UUID,
    val clubId: UUID,
    val grantedByUserId: UUID,
    val granteeUserId: UUID,
    val scope: SupportAccessGrantScope,
    val reason: String,
    val expiresAt: OffsetDateTime,
    val revokedAt: OffsetDateTime?,
    val createdAt: OffsetDateTime,
)
