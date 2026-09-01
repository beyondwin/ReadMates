package com.readmates.auth.application.service

import com.readmates.auth.application.port.`in`.GetHostMemberApprovalWorkSourceUseCase
import com.readmates.auth.application.port.`in`.HostMemberApprovalWorkSourceItem
import com.readmates.auth.application.port.`in`.HostMemberApprovalWorkSourceResult
import com.readmates.auth.application.port.out.HostMemberApprovalWorkSourceQuery
import com.readmates.auth.application.port.out.HostMemberApprovalWorkSourceQueryPort
import com.readmates.auth.application.port.out.HostMemberApprovalWorkSourceQueryResult
import org.springframework.stereotype.Service
import java.time.OffsetDateTime
import java.util.UUID

@Service
class HostMemberApprovalWorkSourceService(
    private val queryPort: HostMemberApprovalWorkSourceQueryPort,
) : GetHostMemberApprovalWorkSourceUseCase {
    override fun get(
        clubId: UUID,
        evaluatedAt: OffsetDateTime,
        completedSince: OffsetDateTime,
    ): HostMemberApprovalWorkSourceResult =
        when (
            val result = queryPort.load(HostMemberApprovalWorkSourceQuery(clubId, completedSince))
        ) {
            HostMemberApprovalWorkSourceQueryResult.Unavailable ->
                HostMemberApprovalWorkSourceResult(emptyList(), "MEMBER_SOURCE_UNAVAILABLE")
            is HostMemberApprovalWorkSourceQueryResult.Available ->
                HostMemberApprovalWorkSourceResult(
                    result.rows.mapNotNull { row ->
                        val pending = row.membershipStatus == "VIEWER"
                        val resolvedAt = row.transitionedAt?.takeIf { !it.isBefore(completedSince) }
                        if (!pending && resolvedAt == null) return@mapNotNull null
                        HostMemberApprovalWorkSourceItem(
                            row.membershipId,
                            row.requestCreatedAt,
                            row.membershipStatus,
                            if (pending) null else resolvedAt,
                            if (pending) null else row.receiptAction,
                            if (pending) {
                                null
                            } else if (row.membershipStatus == "ACTIVE") {
                                "APPROVED"
                            } else {
                                "REJECTED"
                            },
                            row.membershipStatus,
                        )
                    },
                )
        }
}
