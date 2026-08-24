package com.readmates.club.application.port.out

import com.readmates.club.application.model.PersistSupportGrantOrigin
import com.readmates.club.application.model.StoredSupportGrantCommandPreview
import com.readmates.club.application.model.SupportAccessGrant
import com.readmates.club.application.model.SupportGrantCommandReceiptRecord
import com.readmates.club.application.model.SupportGrantReasonCategory
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
    fun revokeGrant(
        grantId: UUID,
        revokedAt: OffsetDateTime,
    ): SupportAccessGrant?
}

interface LoadSupportAccessGrantPort {
    fun loadActiveGrantById(grantId: UUID): SupportAccessGrant?

    fun loadActiveGrantsByClub(clubId: UUID): List<SupportAccessGrant>

    fun loadActiveGrantsByGrantee(granteeUserId: UUID): List<SupportAccessGrant>

    fun loadActiveGrantByGranteeAndClub(
        granteeUserId: UUID,
        clubId: UUID,
    ): SupportAccessGrant?
}

interface SupportGrantCommandPort {
    fun savePreview(preview: StoredSupportGrantCommandPreview)

    fun loadPreview(previewId: UUID): StoredSupportGrantCommandPreview?

    fun lockCreateIdentity(
        clubId: UUID,
        granteeUserId: UUID,
        scope: SupportAccessGrantScope,
        now: OffsetDateTime,
    ): Boolean

    fun createCanonicalGrant(
        grantId: UUID,
        clubId: UUID,
        grantedByUserId: UUID,
        granteeUserId: UUID,
        scope: SupportAccessGrantScope,
        reasonCategory: SupportGrantReasonCategory,
        notePresent: Boolean,
        expiresAt: OffsetDateTime,
        createdAt: OffsetDateTime,
    )

    fun lockActiveGrant(
        grantId: UUID,
        now: OffsetDateTime,
    ): SupportAccessGrant?

    fun revokeCanonicalGrant(
        grantId: UUID,
        revokedAt: OffsetDateTime,
    ): Boolean

    fun storeOrigin(origin: PersistSupportGrantOrigin): Boolean

    fun loadReceipt(
        receiptId: UUID,
        actorAdminId: UUID,
        commandType: String,
        targetId: UUID,
    ): SupportGrantCommandReceiptRecord?
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
