package com.readmates.admin.operations.adapter.out.persistence

import com.readmates.admin.operations.application.AdminOperationError.INVALID_CURSOR
import com.readmates.admin.operations.application.AdminOperationException
import com.readmates.admin.operations.application.model.AdminOperationCase
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.paging.CursorCodec
import java.time.OffsetDateTime
import java.util.UUID

internal object AdminOperationCaseJdbcCursor {
    const val SEVERITY_RANK_SQL =
        "case severity when 'CRITICAL' then 0 when 'WARNING' then 1 when 'READY' then 2 else 3 end"

    fun appendContinuation(
        cursor: Map<String, String>,
        predicates: MutableList<String>,
        arguments: MutableList<Any>,
    ) {
        if (cursor.isEmpty()) return
        val decoded = decode(cursor)
        predicates +=
            """
            (
              $SEVERITY_RANK_SQL > ?
              or ($SEVERITY_RANK_SQL = ? and first_observed_at > ?)
              or ($SEVERITY_RANK_SQL = ? and first_observed_at = ? and id > ?)
            )
            """.trimIndent()
        arguments += decoded.severityRank
        arguments += decoded.severityRank
        arguments += decoded.firstObservedAt.toUtcLocalDateTime()
        arguments += decoded.severityRank
        arguments += decoded.firstObservedAt.toUtcLocalDateTime()
        arguments += decoded.id.dbString()
    }

    fun encode(case: AdminOperationCase): String? =
        CursorCodec.encode(
            mapOf(
                CURSOR_SEVERITY_RANK to case.severity.rank().toString(),
                CURSOR_FIRST_OBSERVED_AT to case.firstObservedAt.toString(),
                CURSOR_ID to case.id.toString(),
            ),
        )

    private fun decode(cursor: Map<String, String>): CaseCursor {
        if (cursor.keys != CURSOR_KEYS) throw AdminOperationException(INVALID_CURSOR)
        return runCatching {
            CaseCursor(
                severityRank = cursor.getValue(CURSOR_SEVERITY_RANK).toInt(),
                firstObservedAt = OffsetDateTime.parse(cursor.getValue(CURSOR_FIRST_OBSERVED_AT)),
                id = UUID.fromString(cursor.getValue(CURSOR_ID)),
            )
        }.getOrElse { throw AdminOperationException(INVALID_CURSOR) }
    }

    private data class CaseCursor(
        val severityRank: Int,
        val firstObservedAt: OffsetDateTime,
        val id: UUID,
    )

    private const val CURSOR_SEVERITY_RANK = "severityRank"
    private const val CURSOR_FIRST_OBSERVED_AT = "firstObservedAt"
    private const val CURSOR_ID = "id"
    private val CURSOR_KEYS = setOf(CURSOR_SEVERITY_RANK, CURSOR_FIRST_OBSERVED_AT, CURSOR_ID)
}
