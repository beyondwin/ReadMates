package com.readmates.auth.application.port.out

import java.time.OffsetDateTime
import java.util.UUID

data class HostMemberApprovalWorkSourceQuery(
    val clubId: UUID,
    val completedSince: OffsetDateTime,
)

data class HostMemberApprovalWorkSourceRow(
    val membershipId: UUID,
    val requestCreatedAt: OffsetDateTime,
    val membershipStatus: String,
    val transitionedAt: OffsetDateTime?,
    val receiptAction: String?,
)

sealed interface HostMemberApprovalWorkSourceQueryResult {
    data class Available(
        val rows: List<HostMemberApprovalWorkSourceRow>,
    ) : HostMemberApprovalWorkSourceQueryResult

    data object Unavailable : HostMemberApprovalWorkSourceQueryResult
}

fun interface HostMemberApprovalWorkSourceQueryPort {
    fun load(query: HostMemberApprovalWorkSourceQuery): HostMemberApprovalWorkSourceQueryResult
}
