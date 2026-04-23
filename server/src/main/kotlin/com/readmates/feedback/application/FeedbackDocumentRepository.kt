package com.readmates.feedback.application

import com.readmates.feedback.application.model.FeedbackDocumentSessionResult
import com.readmates.feedback.application.model.FeedbackDocumentUploadCommand
import com.readmates.feedback.application.model.StoredFeedbackDocumentResult
import com.readmates.shared.db.dbString
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import com.readmates.shared.security.CurrentMember
import org.springframework.beans.factory.ObjectProvider
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.web.server.ResponseStatusException
import java.sql.ResultSet
import java.time.LocalDate
import java.util.UUID

@Repository
class FeedbackDocumentRepository(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) {
    fun listLatestReadableDocuments(member: CurrentMember): List<StoredFeedbackDocumentResult> {
        val jdbcTemplate = jdbcTemplate()
        val sql = if (member.isHost) {
            """
            select *
            from (
              select
                session_feedback_documents.session_id,
                sessions.number as session_number,
                sessions.book_title,
                sessions.session_date,
                session_feedback_documents.source_text,
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
            order by session_number desc
            """.trimIndent()
        } else {
            """
            select *
            from (
              select
                session_feedback_documents.session_id,
                sessions.number as session_number,
                sessions.book_title,
                sessions.session_date,
                session_feedback_documents.source_text,
                session_feedback_documents.file_name,
                session_feedback_documents.created_at,
                row_number() over (
                  partition by session_feedback_documents.session_id
                  order by session_feedback_documents.version desc, session_feedback_documents.created_at desc
                ) as document_rank
              from session_feedback_documents
              join sessions on sessions.id = session_feedback_documents.session_id
                and sessions.club_id = session_feedback_documents.club_id
              join session_participants on session_participants.session_id = sessions.id
                and session_participants.club_id = sessions.club_id
                and session_participants.membership_id = ?
              where session_feedback_documents.club_id = ?
                and session_participants.attendance_status = 'ATTENDED'
                and session_participants.participation_status = 'ACTIVE'
                and sessions.state in ('CLOSED', 'PUBLISHED')
            ) ranked_documents
            where document_rank = 1
            order by session_number desc
            """.trimIndent()
        }
        val args = if (member.isHost) {
            arrayOf<Any>(member.clubId.dbString())
        } else {
            arrayOf<Any>(member.membershipId.dbString(), member.clubId.dbString())
        }

        return jdbcTemplate.query(sql, { resultSet, _ ->
            resultSet.toStoredFeedbackDocument()
        }, *args)
    }

    fun findReadableSession(
        clubId: UUID,
        sessionId: UUID,
    ): FeedbackDocumentSessionResult? =
        jdbcTemplate().query(
            """
            select id, number, book_title, session_date
            from sessions
            where id = ?
              and club_id = ?
              and state in ('CLOSED', 'PUBLISHED')
            """.trimIndent(),
            { resultSet, _ -> resultSet.toSessionMetadata() },
            sessionId.dbString(),
            clubId.dbString(),
        ).firstOrNull()

    fun hasActiveAttendedSession(
        member: CurrentMember,
        sessionId: UUID,
    ): Boolean =
        jdbcTemplate().queryForObject(
            """
            select count(*)
            from session_participants
            where club_id = ?
              and session_id = ?
              and membership_id = ?
              and attendance_status = 'ATTENDED'
              and participation_status = 'ACTIVE'
            """.trimIndent(),
            Int::class.java,
            member.clubId.dbString(),
            sessionId.dbString(),
            member.membershipId.dbString(),
        ) == 1

    fun findLatestDocument(
        clubId: UUID,
        sessionId: UUID,
    ): StoredFeedbackDocumentResult? =
        jdbcTemplate().query(
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

    fun findSessionForUpload(
        clubId: UUID,
        sessionId: UUID,
    ): FeedbackDocumentSessionResult? =
        jdbcTemplate().query(
            """
            select id, number, book_title, session_date
            from sessions
            where id = ?
              and club_id = ?
            for update
            """.trimIndent(),
            { resultSet, _ -> resultSet.toSessionMetadata() },
            sessionId.dbString(),
            clubId.dbString(),
        ).firstOrNull()

    fun nextDocumentVersion(
        clubId: UUID,
        sessionId: UUID,
    ): Int =
        jdbcTemplate().queryForObject(
            """
            select coalesce(max(version), 0) + 1
            from session_feedback_documents
            where club_id = ?
              and session_id = ?
            """.trimIndent(),
            Int::class.java,
            clubId.dbString(),
            sessionId.dbString(),
        ) ?: 1

    fun insertDocument(
        member: CurrentMember,
        command: FeedbackDocumentUploadCommand,
        version: Int,
        documentId: UUID,
    ) {
        jdbcTemplate().update(
            """
            insert into session_feedback_documents (
              id,
              club_id,
              session_id,
              version,
              source_text,
              file_name,
              content_type,
              file_size
            )
            values (?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            documentId.dbString(),
            member.clubId.dbString(),
            command.sessionId.dbString(),
            version,
            command.sourceText,
            command.fileName,
            command.contentType,
            command.fileSize,
        )
    }

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

    private fun jdbcTemplate(): JdbcTemplate =
        jdbcTemplateProvider.ifAvailable
            ?: throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Feedback document storage is unavailable")
}
