@file:Suppress("ktlint:standard:package-name")

package com.readmates.auth.application.port.`in`

import java.time.OffsetDateTime
import java.util.UUID

data class HostMemberApprovalWorkSourceItem(
    val membershipId: UUID,
    val requestCreatedAt: OffsetDateTime,
    val membershipStatus: String,
    val resolvedAt: OffsetDateTime?,
    val receiptAction: String?,
    val receiptResult: String?,
    val receiptStatus: String,
)

data class HostMemberApprovalWorkSourceResult(
    val items: List<HostMemberApprovalWorkSourceItem>,
    val failureCode: String? = null,
)

fun interface GetHostMemberApprovalWorkSourceUseCase {
    fun get(
        clubId: UUID,
        evaluatedAt: OffsetDateTime,
        completedSince: OffsetDateTime,
    ): HostMemberApprovalWorkSourceResult
}
