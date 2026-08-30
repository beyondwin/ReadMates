@file:Suppress("ktlint:standard:package-name")

package com.readmates.auth.application.port.`in`

import java.time.OffsetDateTime
import java.util.UUID

data class HostInvitationExpiryWorkSourceItem(
    val linkId: UUID,
    val linkRevision: Long,
    val linkStatus: String,
    val usedCount: Int,
    val maxUses: Int,
    val remainingUses: Int,
    val dueAt: OffsetDateTime,
    val resolvedAt: OffsetDateTime?,
    val receiptAction: String?,
)

data class HostInvitationExpiryWorkSourceResult(
    val items: List<HostInvitationExpiryWorkSourceItem>,
    val failureCode: String? = null,
)

fun interface GetHostInvitationExpiryWorkSourceUseCase {
    fun get(
        clubId: UUID,
        evaluatedAt: OffsetDateTime,
        completedSince: OffsetDateTime,
    ): HostInvitationExpiryWorkSourceResult
}
