package com.readmates.club.application.port.out

import com.readmates.club.application.model.SupportAccessGrant
import com.readmates.club.domain.SupportAccessGrantScope
import java.time.OffsetDateTime
import java.util.UUID

interface CreateSupportAccessGrantPort {
    fun createGrant(
        clubId: UUID,
        grantedByUserId: UUID,
        granteeUserId: UUID,
        scope: SupportAccessGrantScope,
        reason: String,
        expiresAt: OffsetDateTime,
    ): SupportAccessGrant
}

interface RevokeSupportAccessGrantPort {
    /**
     * Returns the revoked grant, or null if the grant was not found (or already revoked).
     */
    fun revokeGrant(grantId: UUID, revokedAt: OffsetDateTime): SupportAccessGrant?
}

interface LoadSupportAccessGrantPort {
    fun loadActiveGrantsByClub(clubId: UUID): List<SupportAccessGrant>
    fun loadActiveGrantsByGrantee(granteeUserId: UUID): List<SupportAccessGrant>
    fun hasActiveGrant(granteeUserId: UUID, clubId: UUID): Boolean
}

interface WritePlatformAuditEventPort {
    fun writeEvent(
        actorUserId: UUID,
        actorPlatformRole: String,
        targetUserId: UUID?,
        eventType: String,
        metadataJson: String,
    )
}
