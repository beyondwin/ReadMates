@file:Suppress("ktlint:standard:package-name")

package com.readmates.admin.operations.adapter.`in`.web

import com.readmates.admin.operations.application.AdminOperationError
import com.readmates.admin.operations.application.AdminOperationException
import com.readmates.admin.operations.application.model.AdminOperationSeverity
import com.readmates.shared.paging.CursorCodec
import java.time.OffsetDateTime
import java.util.UUID

internal fun decodeAdminOperationCaseCursor(rawCursor: String?): Map<String, String> {
    if (rawCursor == null) return emptyMap()
    return runCatching { CursorCodec.decodeStrict(rawCursor) }
        .getOrNull()
        ?.takeIf(Map<String, String>::isCanonicalAdminOperationCaseCursor)
        ?: throw AdminOperationException(AdminOperationError.INVALID_CURSOR)
}

private fun Map<String, String>.isCanonicalAdminOperationCaseCursor(): Boolean =
    keys == CASE_CURSOR_KEYS &&
        runCatching {
            val rawSeverityRank = getValue(CURSOR_SEVERITY_RANK)
            val rawFirstObservedAt = getValue(CURSOR_FIRST_OBSERVED_AT)
            val rawId = getValue(CURSOR_ID)
            val severityRank = rawSeverityRank.toInt()
            val firstObservedAt = OffsetDateTime.parse(rawFirstObservedAt)
            val id = UUID.fromString(rawId)

            severityRank in AdminOperationSeverity.entries.indices &&
                severityRank.toString() == rawSeverityRank &&
                firstObservedAt.toString() == rawFirstObservedAt &&
                id.toString() == rawId
        }.getOrDefault(false)

private const val CURSOR_SEVERITY_RANK = "severityRank"
private const val CURSOR_FIRST_OBSERVED_AT = "firstObservedAt"
private const val CURSOR_ID = "id"
private val CASE_CURSOR_KEYS = setOf(CURSOR_SEVERITY_RANK, CURSOR_FIRST_OBSERVED_AT, CURSOR_ID)
