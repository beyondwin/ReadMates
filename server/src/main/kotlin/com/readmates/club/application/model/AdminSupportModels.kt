package com.readmates.club.application.model

import com.readmates.club.domain.PlatformAdminRole
import com.readmates.club.domain.SupportAccessGrantScope
import java.time.OffsetDateTime
import java.util.UUID

data class AdminSupportSearchResult(
    val subjectId: UUID,
    val displayName: String,
    val maskedEmail: String,
    val kind: String,
    val platformAdminRole: PlatformAdminRole?,
    val platformAdminStatus: String?,
    val clubMembershipSummary: List<AdminSupportClubMembershipSummary>,
    val grantEligible: Boolean,
    val grantBlockedReason: String?,
)

data class AdminSupportClubMembershipSummary(
    val clubId: UUID,
    val clubName: String,
    val role: String,
    val status: String,
)

data class AdminSupportGrantLedgerItem(
    val grantId: UUID,
    val clubId: UUID,
    val clubName: String,
    val granteeDisplayName: String,
    val granteeMaskedEmail: String,
    val scope: SupportAccessGrantScope,
    val reasonCategory: String,
    val notePresent: Boolean,
    val expiresAt: OffsetDateTime,
    val createdAt: OffsetDateTime,
    val revokedAt: OffsetDateTime?,
    val status: String,
    val createdByRole: String,
)

data class AdminSupportGrantLedgerPage(
    val items: List<AdminSupportGrantLedgerItem>,
    val nextCursor: String?,
)

data class AdminSupportGrantLedgerCursor(
    val createdAt: OffsetDateTime,
    val grantId: UUID,
)
