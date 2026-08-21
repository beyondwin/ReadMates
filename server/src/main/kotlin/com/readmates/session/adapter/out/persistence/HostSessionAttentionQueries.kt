package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostSessionListItem
import com.readmates.session.application.HostSessionListPage
import com.readmates.session.application.HostSessionListQuery
import com.readmates.session.application.requireHost
import com.readmates.shared.db.dbString
import com.readmates.shared.paging.CursorCodec
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import org.springframework.jdbc.core.JdbcTemplate
import java.time.LocalDate
import java.util.UUID

internal const val HOST_SESSION_ATTENTION_ORDERING_VERSION = "attention-rank-v1"

internal class HostSessionAttentionQueries {
    fun list(
        jdbcTemplate: JdbcTemplate,
        host: CurrentMember,
        pageRequest: PageRequest,
        query: HostSessionListQuery,
    ): HostSessionListPage {
        requireHost(host)
        val normalizedQuery = query.normalized()
        val queryKey = normalizedQuery.fingerprint(HOST_SESSION_ATTENTION_ORDERING_VERSION)
        val cursor = HostSessionAttentionCursor.from(pageRequest.cursor, queryKey, host.clubId)
        val rows = loadAttentionRows(jdbcTemplate, host.clubId, pageRequest.limit + 1, normalizedQuery, cursor)
        val visible = rows.take(pageRequest.limit)
        return HostSessionListPage(
            items = visible,
            nextCursor = nextAttentionCursor(rows.size, visible, queryKey, host.clubId, pageRequest.limit),
            summary = loadHostSessionLedgerSummary(jdbcTemplate, host),
        )
    }

    @Suppress("LongMethod")
    private fun loadAttentionRows(
        jdbcTemplate: JdbcTemplate,
        clubId: UUID,
        limit: Int,
        query: HostSessionListQuery,
        cursor: HostSessionAttentionCursor?,
    ): List<HostSessionListItem> {
        val filters = hostSessionListFilters(clubId, query)
        val conditions = filters.conditions
        val parameters = filters.parameters
        conditions += "state in ('CLOSED', 'PUBLISHED')"
        conditions += "computed_record_status <> 'COMPLETE'"
        query.recordStatus?.let { recordStatus ->
            conditions += "computed_record_status = ?"
            parameters += recordStatus.name
        }
        cursor?.let {
            conditions +=
                """
                (
                  attention_rank > ?
                  or (attention_rank = ? and session_date > ?)
                  or (attention_rank = ? and session_date = ? and id > ?)
                )
                """.trimIndent()
            parameters += it.rank
            parameters += it.rank
            parameters += it.date
            parameters += it.rank
            parameters += it.date
            parameters += it.id.dbString()
        }
        parameters += limit
        return jdbcTemplate.query(
            """
            select *
            from (
              select
                ledger_facts.*,
                case
                  when state = 'PUBLISHED' and has_draft then 0
                  when state = 'PUBLISHED' then 1
                  when state = 'CLOSED' and has_draft then 2
                  else 3
                end as attention_rank,
                case
                  when (
                    (public_summary is not null and trim(public_summary) <> '')
                    or highlight_count > 0
                    or one_liner_count > 0
                  ) and feedback_ready and not has_draft then 'COMPLETE'
                  when (
                    (public_summary is not null and trim(public_summary) <> '')
                    or highlight_count > 0
                    or one_liner_count > 0
                    or feedback_ready
                    or has_draft
                  ) then 'INCOMPLETE'
                  else 'NOT_STARTED'
                end as computed_record_status
              from (
                $HOST_SESSION_LEDGER_FACTS_SQL
              ) ledger_facts
            ) attention_facts
            where ${conditions.joinToString(" and ")}
            order by attention_rank asc, session_date asc, id asc
            limit ?
            """.trimIndent(),
            { resultSet, _ -> resultSet.toHostSessionListItem() },
            *parameters.toTypedArray(),
        )
    }
}

internal fun hostSessionAttentionRank(
    state: String,
    hasDraft: Boolean,
): Int =
    when {
        state == "PUBLISHED" && hasDraft -> 0
        state == "PUBLISHED" -> 1
        state == "CLOSED" && hasDraft -> 2
        else -> 3
    }

internal fun hostSessionAttentionComparator(): Comparator<HostSessionListItem> =
    compareBy<HostSessionListItem>(
        { hostSessionAttentionRank(it.state, it.hasDraft) },
        { it.date },
        { it.sessionId },
    )

internal fun hostSessionAttentionCursor(
    rank: Int,
    date: LocalDate,
    id: UUID,
    queryKey: String,
    clubId: UUID,
): String? =
    CursorCodec.encode(
        mapOf(
            "rank" to rank.toString(),
            "date" to date.toString(),
            "id" to id.toString(),
            "query" to queryKey,
            "clubId" to clubId.toString(),
        ),
    )

internal data class HostSessionAttentionCursor(
    val rank: Int,
    val date: LocalDate,
    val id: UUID,
) {
    companion object {
        fun from(
            cursor: Map<String, String>,
            expectedQuery: String,
            expectedClubId: UUID,
        ): HostSessionAttentionCursor? {
            if (cursor.isEmpty()) return null
            if (cursor.keys != setOf("rank", "date", "id", "query", "clubId")) invalidCursor()
            val rank = cursor["rank"]?.toIntOrNull()?.takeIf { it in 0..3 } ?: invalidCursor()
            val date =
                cursor["date"]
                    ?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
                    ?: invalidCursor()
            val id =
                cursor["id"]
                    ?.let { runCatching { UUID.fromString(it) }.getOrNull() }
                    ?: invalidCursor()
            if (cursor["query"] != expectedQuery) invalidCursor()
            val clubId =
                cursor["clubId"]
                    ?.let { runCatching { UUID.fromString(it) }.getOrNull() }
                    ?: invalidCursor()
            if (clubId != expectedClubId) invalidCursor()
            return HostSessionAttentionCursor(rank, date, id)
        }
    }
}

private fun nextAttentionCursor(
    rowCount: Int,
    visible: List<HostSessionListItem>,
    queryKey: String,
    clubId: UUID,
    limit: Int,
): String? {
    if (rowCount <= limit) return null
    val last = visible.lastOrNull() ?: return null
    return hostSessionAttentionCursor(
        rank = hostSessionAttentionRank(last.state, last.hasDraft),
        date = LocalDate.parse(last.date),
        id = UUID.fromString(last.sessionId),
        queryKey = queryKey,
        clubId = clubId,
    )
}
