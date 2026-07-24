package com.readmates.feedback.adapter.out.persistence

import com.readmates.feedback.application.model.FeedbackDocumentSessionResult
import com.readmates.feedback.application.model.StoredFeedbackDocumentListResult
import com.readmates.feedback.application.model.StoredFeedbackDocumentResult
import com.readmates.feedback.application.port.out.FeedbackDocumentStorePort
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import com.readmates.shared.paging.CursorCodec
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID

@Repository
class JdbcFeedbackDocumentStoreAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : FeedbackDocumentStorePort {
    override fun listLatestReadableDocuments(
        currentMember: CurrentMember,
        pageRequest: PageRequest,
    ): CursorPage<StoredFeedbackDocumentListResult> {
        val cursor = FeedbackDocumentCursor.from(pageRequest.cursor)
        val sql =
            """
            select *
            from (
              select
                session_feedback_documents.id as document_id,
                session_feedback_documents.session_id,
                sessions.number as session_number,
                sessions.book_title,
                sessions.session_date,
                session_feedback_documents.document_title,
                case
                  when session_feedback_documents.document_title is null then session_feedback_documents.source_text
                  else null
                end as legacy_source_text,
                session_feedback_documents.file_name,
                session_feedback_documents.created_at,
                row_number() over (
                  partition by session_feedback_documents.session_id
                  order by session_feedback_documents.version desc, session_feedback_documents.created_at desc
                ) as document_rank
              from session_feedback_documents
              join sessions on sessions.id = session_feedback_documents.session_id
                and sessions.club_id = session_feedback_documents.club_id
              where session_feedback_documents.club_id = ?
                and sessions.state in ('CLOSED', 'PUBLISHED')
            ) ranked_documents
            where document_rank = 1
              and (
                ? is null
                or session_number < ?
                or (session_number = ? and created_at < ?)
                or (session_number = ? and created_at = ? and document_id < ?)
              )
            order by session_number desc, created_at desc, document_id desc
            limit ?
            """.trimIndent()
        val args =
            arrayOf<Any?>(
                currentMember.clubId.dbString(),
                cursor?.sessionNumber,
                cursor?.sessionNumber,
                cursor?.sessionNumber,
                cursor?.createdAt?.toUtcLocalDateTime(),
                cursor?.sessionNumber,
                cursor?.createdAt?.toUtcLocalDateTime(),
                cursor?.id,
                pageRequest.limit + 1,
            )

        val rows =
            jdbcTemplate.query(sql, { resultSet, _ ->
                resultSet.toStoredFeedbackDocumentList()
            }, *args)
        return pageFromRows(rows, pageRequest.limit, ::feedbackDocumentCursor)
    }

    override fun findReadableSession(
        clubId: UUID,
        sessionId: UUID,
    ): FeedbackDocumentSessionResult? =
        jdbcTemplate
            .query(
                """
                select id, number, book_title, session_date
                from sessions
                where id = ?
                  and club_id = ?
                  and state in ('OPEN', 'CLOSED', 'PUBLISHED')
                """.trimIndent(),
                { resultSet, _ -> resultSet.toSessionMetadata() },
                sessionId.dbString(),
                clubId.dbString(),
            ).firstOrNull()

    override fun findSession(
        clubId: UUID,
        sessionId: UUID,
    ): FeedbackDocumentSessionResult? =
        jdbcTemplate
            .query(
                """
                select id, number, book_title, session_date
                from sessions
                where id = ?
                  and club_id = ?
                """.trimIndent(),
                { resultSet, _ -> resultSet.toSessionMetadata() },
                sessionId.dbString(),
                clubId.dbString(),
            ).firstOrNull()

    override fun findLatestDocument(
        clubId: UUID,
        sessionId: UUID,
    ): StoredFeedbackDocumentResult? =
        jdbcTemplate
            .query(
                """
                select
                  session_feedback_documents.session_id,
                  sessions.number as session_number,
                  sessions.book_title,
                  sessions.session_date,
                  session_feedback_documents.source_text,
                  session_feedback_documents.file_name,
                  session_feedback_documents.created_at
                from session_feedback_documents
                join sessions on sessions.id = session_feedback_documents.session_id
                  and sessions.club_id = session_feedback_documents.club_id
                where session_feedback_documents.club_id = ?
                  and session_feedback_documents.session_id = ?
                order by session_feedback_documents.version desc, session_feedback_documents.created_at desc
                limit 1
                """.trimIndent(),
                { resultSet, _ -> resultSet.toStoredFeedbackDocument() },
                clubId.dbString(),
                sessionId.dbString(),
            ).firstOrNull()

    private fun ResultSet.toStoredFeedbackDocumentList(): StoredFeedbackDocumentListResult =
        StoredFeedbackDocumentListResult(
            documentId = uuid("document_id"),
            sessionId = uuid("session_id"),
            sessionNumber = getInt("session_number"),
            bookTitle = getString("book_title"),
            date = getObject("session_date", LocalDate::class.java),
            title = getString("document_title"),
            legacySourceText = getString("legacy_source_text"),
            fileName = getString("file_name"),
            uploadedAt = utcOffsetDateTime("created_at"),
        )

    private fun ResultSet.toStoredFeedbackDocument(): StoredFeedbackDocumentResult =
        StoredFeedbackDocumentResult(
            sessionId = uuid("session_id"),
            sessionNumber = getInt("session_number"),
            bookTitle = getString("book_title"),
            date = getObject("session_date", LocalDate::class.java),
            sourceText = getString("source_text"),
            fileName = getString("file_name"),
            uploadedAt = utcOffsetDateTime("created_at"),
        )

    private fun ResultSet.toSessionMetadata(): FeedbackDocumentSessionResult =
        FeedbackDocumentSessionResult(
            sessionId = uuid("id"),
            sessionNumber = getInt("number"),
            bookTitle = getString("book_title"),
            date = getObject("session_date", LocalDate::class.java),
        )

    private fun feedbackDocumentCursor(item: StoredFeedbackDocumentListResult): String? =
        CursorCodec.encode(
            mapOf(
                "sessionNumber" to item.sessionNumber.toString(),
                "createdAt" to item.uploadedAt.toString(),
                "id" to item.documentId.toString(),
            ),
        )

    private fun <T> pageFromRows(
        rows: List<T>,
        limit: Int,
        cursorFor: (T) -> String?,
    ): CursorPage<T> {
        val visibleRows = rows.take(limit)
        return CursorPage(
            items = visibleRows,
            nextCursor = if (rows.size > limit) visibleRows.lastOrNull()?.let(cursorFor) else null,
        )
    }

    private data class FeedbackDocumentCursor(
        val sessionNumber: Int,
        val createdAt: OffsetDateTime,
        val id: String,
    ) {
        companion object {
            fun from(cursor: Map<String, String>): FeedbackDocumentCursor? {
                val sessionNumber = cursor["sessionNumber"]?.toIntOrNull() ?: return null
                val createdAt =
                    cursor["createdAt"]?.let { runCatching { OffsetDateTime.parse(it) }.getOrNull() }
                        ?: return null
                val id = cursor["id"]?.takeIf { it.isNotBlank() } ?: return null
                return FeedbackDocumentCursor(sessionNumber, createdAt, id)
            }
        }
    }
}
