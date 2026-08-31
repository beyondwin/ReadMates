package com.readmates.auth.application.service

import com.readmates.auth.application.port.`in`.GetHostInvitationExpiryWorkSourceUseCase
import com.readmates.auth.application.port.`in`.HostInvitationExpiryWorkSourceItem
import com.readmates.auth.application.port.`in`.HostInvitationExpiryWorkSourceResult
import com.readmates.auth.application.port.out.HostInvitationExpiryWorkSourceQuery
import com.readmates.auth.application.port.out.HostInvitationExpiryWorkSourceQueryPort
import com.readmates.auth.application.port.out.HostInvitationExpiryWorkSourceQueryResult
import org.springframework.stereotype.Service
import java.time.OffsetDateTime
import java.util.UUID

@Service
class HostInvitationExpiryWorkSourceService(
    private val queryPort: HostInvitationExpiryWorkSourceQueryPort,
) : GetHostInvitationExpiryWorkSourceUseCase {
    override fun get(
        clubId: UUID,
        evaluatedAt: OffsetDateTime,
        completedSince: OffsetDateTime,
    ): HostInvitationExpiryWorkSourceResult =
        when (
            val result =
                queryPort.load(
                    HostInvitationExpiryWorkSourceQuery(clubId, evaluatedAt, completedSince),
                )
        ) {
            HostInvitationExpiryWorkSourceQueryResult.Unavailable ->
                HostInvitationExpiryWorkSourceResult(emptyList(), "INVITATION_SOURCE_UNAVAILABLE")
            is HostInvitationExpiryWorkSourceQueryResult.Available ->
                HostInvitationExpiryWorkSourceResult(
                    result.rows.mapNotNull { row ->
                        val actionable =
                            row.auditAt == null &&
                                row.linkStatus == "ACTIVE" &&
                                row.usedCount < row.maxUses &&
                                !row.expiresAt.isBefore(evaluatedAt) &&
                                !row.expiresAt.isAfter(evaluatedAt.plusDays(EXPIRY_WINDOW_DAYS))
                        val resolvedAt =
                            row.auditAt?.takeIf { auditAt ->
                                row.linkStatus == "ACTIVE" &&
                                    row.usedCount < row.maxUses &&
                                    !row.expiresAt.isBefore(auditAt) &&
                                    !row.expiresAt.isAfter(auditAt.plusDays(EXPIRY_WINDOW_DAYS)) &&
                                    !auditAt.isBefore(completedSince)
                            }
                        if (!actionable && resolvedAt == null) return@mapNotNull null
                        HostInvitationExpiryWorkSourceItem(
                            row.linkId,
                            row.linkRevision,
                            row.linkStatus,
                            row.usedCount,
                            row.maxUses,
                            (row.maxUses - row.usedCount).coerceAtLeast(0),
                            row.expiresAt,
                            if (actionable) null else resolvedAt,
                            if (actionable) null else row.receiptAction,
                        )
                    },
                )
        }

    private companion object {
        const val EXPIRY_WINDOW_DAYS = 7L
    }
}
