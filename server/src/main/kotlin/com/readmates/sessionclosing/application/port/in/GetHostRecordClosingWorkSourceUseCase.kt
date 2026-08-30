@file:Suppress("ktlint:standard:package-name")

package com.readmates.sessionclosing.application.port.`in`

import java.time.OffsetDateTime
import java.util.UUID

data class HostRecordClosingWorkSourceItem(
    val sessionId: UUID,
    val sourceGeneration: String,
    val actionable: Boolean,
    val dueAt: OffsetDateTime,
    val resolvedAt: OffsetDateTime?,
    val receiptId: UUID?,
    val receiptState: String?,
    val receiptSummary: String?,
)

data class HostRecordClosingWorkSourceResult(
    val items: List<HostRecordClosingWorkSourceItem>,
    val failureCode: String? = null,
)

fun interface GetHostRecordClosingWorkSourceUseCase {
    fun get(
        clubId: UUID,
        evaluatedAt: OffsetDateTime,
        completedSince: OffsetDateTime,
    ): HostRecordClosingWorkSourceResult
}
