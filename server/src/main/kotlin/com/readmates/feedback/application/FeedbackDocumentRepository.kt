package com.readmates.feedback.application

import com.readmates.feedback.api.FeedbackDocumentListItem
import com.readmates.feedback.api.FeedbackDocumentResponse
import com.readmates.feedback.api.FeedbackDocumentStatus
import com.readmates.feedback.api.FeedbackMetadataItem as ApiFeedbackMetadataItem
import com.readmates.feedback.api.FeedbackParticipant as ApiFeedbackParticipant
import com.readmates.feedback.api.FeedbackProblem as ApiFeedbackProblem
import com.readmates.feedback.api.FeedbackRevealingQuote as ApiFeedbackRevealingQuote
import com.readmates.shared.db.dbString
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.springframework.beans.factory.ObjectProvider
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.sql.ResultSet
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID

private data class FeedbackDocumentRow(
    val sessionId: UUID,
    val sessionNumber: Int,
    val bookTitle: String,
    val date: LocalDate,
    val sourceText: String,
    val fileName: String,
    val uploadedAt: OffsetDateTime,
)

private data class SessionMetadata(
    val sessionId: UUID,
    val sessionNumber: Int,
    val bookTitle: String,
    val date: LocalDate,
)

@Repository
class FeedbackDocumentRepository(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) {
    private val parser = FeedbackDocumentParser()

    fun listReadableDocuments(member: CurrentMember): List<FeedbackDocumentListItem> {
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
            resultSet.toFeedbackDocumentRow()
        }, *args).mapNotNull { document ->
            val parsedDocument = parseStoredListDocument(document.sourceText)
            when {
                parsedDocument != null -> document.toListItem(parsedDocument)
                member.isHost -> document.toListItem(FALLBACK_INVALID_DOCUMENT_TITLE)
                else -> null
            }
        }
    }

    fun findReadableDocument(member: CurrentMember, sessionId: UUID): FeedbackDocumentResponse? {
        val jdbcTemplate = jdbcTemplate()
        val session = findSessionMetadata(jdbcTemplate, member.clubId, sessionId) ?: return null

        if (!member.isHost && !hasAttendedSession(jdbcTemplate, member, sessionId)) {
            throw AccessDeniedException("Feedback document access denied")
        }

        val document = findLatestDocument(jdbcTemplate, member.clubId, sessionId) ?: return null
        val parsedDocument = parseStoredDetailDocument(member, document.sourceText)
        return document.toResponse(session, parsedDocument)
    }

    fun findHostStatus(host: CurrentMember, sessionId: UUID): FeedbackDocumentStatus {
        requireHost(host)
        val jdbcTemplate = jdbcTemplate()
        findSessionMetadata(jdbcTemplate, host.clubId, sessionId)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)

        val document = findLatestDocument(jdbcTemplate, host.clubId, sessionId)
        return FeedbackDocumentStatus(
            uploaded = document != null,
            fileName = document?.fileName,
            uploadedAt = document?.uploadedAt?.toString(),
        )
    }

    @Transactional
    fun saveDocument(
        host: CurrentMember,
        sessionId: UUID,
        fileName: String,
        contentType: String,
        sourceText: String,
        fileSize: Long,
    ): FeedbackDocumentResponse {
        requireHost(host)
        val parsedDocument = parser.parse(sourceText)
        val jdbcTemplate = jdbcTemplate()
        val session = findSessionMetadataForUpdate(jdbcTemplate, host.clubId, sessionId)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        val version = nextVersion(jdbcTemplate, host.clubId, sessionId)
        val documentId = UUID.randomUUID()

        jdbcTemplate.update(
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
            host.clubId.dbString(),
            sessionId.dbString(),
            version,
            sourceText,
            fileName,
            contentType,
            fileSize,
        )

        val storedDocument = findLatestDocument(jdbcTemplate, host.clubId, sessionId)
            ?: throw ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR)

        return storedDocument.toResponse(session, parsedDocument)
    }

    private fun findSessionMetadata(jdbcTemplate: JdbcTemplate, clubId: UUID, sessionId: UUID): SessionMetadata? =
        jdbcTemplate.query(
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

    private fun findSessionMetadataForUpdate(jdbcTemplate: JdbcTemplate, clubId: UUID, sessionId: UUID): SessionMetadata? =
        jdbcTemplate.query(
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

    private fun hasAttendedSession(jdbcTemplate: JdbcTemplate, member: CurrentMember, sessionId: UUID): Boolean =
        jdbcTemplate.queryForObject(
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

    private fun findLatestDocument(jdbcTemplate: JdbcTemplate, clubId: UUID, sessionId: UUID): FeedbackDocumentRow? =
        jdbcTemplate.query(
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
            { resultSet, _ -> resultSet.toFeedbackDocumentRow() },
            clubId.dbString(),
            sessionId.dbString(),
        ).firstOrNull()

    private fun nextVersion(jdbcTemplate: JdbcTemplate, clubId: UUID, sessionId: UUID): Int =
        jdbcTemplate.queryForObject(
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

    private fun requireHost(member: CurrentMember) {
        if (!member.isHost) {
            throw AccessDeniedException("Host role required")
        }
    }

    private fun parseStoredListDocument(sourceText: String): ParsedFeedbackDocument? =
        runCatching { parser.parse(sourceText) }
            .getOrNull()

    private fun parseStoredDetailDocument(member: CurrentMember, sourceText: String): ParsedFeedbackDocument =
        runCatching { parser.parse(sourceText) }
            .getOrElse {
                val reason = if (member.isHost) {
                    FALLBACK_INVALID_DOCUMENT_TITLE
                } else {
                    "피드백 문서를 불러올 수 없습니다."
                }
                throw ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, reason)
            }

    private fun FeedbackDocumentRow.toListItem(parsedDocument: ParsedFeedbackDocument): FeedbackDocumentListItem =
        FeedbackDocumentListItem(
            sessionId = sessionId.toString(),
            sessionNumber = sessionNumber,
            title = parsedDocument.title,
            bookTitle = bookTitle,
            date = date.toString(),
            fileName = fileName,
            uploadedAt = uploadedAt.toString(),
        )

    private fun FeedbackDocumentRow.toListItem(title: String): FeedbackDocumentListItem =
        FeedbackDocumentListItem(
            sessionId = sessionId.toString(),
            sessionNumber = sessionNumber,
            title = title,
            bookTitle = bookTitle,
            date = date.toString(),
            fileName = fileName,
            uploadedAt = uploadedAt.toString(),
        )

    private fun FeedbackDocumentRow.toResponse(
        session: SessionMetadata,
        parsedDocument: ParsedFeedbackDocument,
    ): FeedbackDocumentResponse =
        FeedbackDocumentResponse(
            sessionId = session.sessionId.toString(),
            sessionNumber = session.sessionNumber,
            title = parsedDocument.title,
            subtitle = parsedDocument.subtitle,
            bookTitle = session.bookTitle,
            date = session.date.toString(),
            fileName = fileName,
            uploadedAt = uploadedAt.toString(),
            metadata = parsedDocument.metadata.map { ApiFeedbackMetadataItem(it.label, it.value) },
            observerNotes = parsedDocument.observerNotes,
            participants = parsedDocument.participants.map { participant ->
                ApiFeedbackParticipant(
                    number = participant.number,
                    name = participant.name,
                    role = participant.role,
                    style = participant.styleParagraphs,
                    contributions = participant.contributionBullets,
                    problems = participant.problems.map { problem ->
                        ApiFeedbackProblem(
                            title = problem.title,
                            core = problem.core,
                            evidence = problem.evidence,
                            interpretation = problem.interpretation,
                        )
                    },
                    actionItems = participant.actionItems,
                    revealingQuote = ApiFeedbackRevealingQuote(
                        quote = participant.revealingQuote.quote,
                        context = participant.revealingQuote.context,
                        note = participant.revealingQuote.note,
                    ),
                )
            },
        )

    private fun ResultSet.toFeedbackDocumentRow(): FeedbackDocumentRow =
        FeedbackDocumentRow(
            sessionId = uuid("session_id"),
            sessionNumber = getInt("session_number"),
            bookTitle = getString("book_title"),
            date = getObject("session_date", LocalDate::class.java),
            sourceText = getString("source_text"),
            fileName = getString("file_name"),
            uploadedAt = utcOffsetDateTime("created_at"),
        )

    private fun ResultSet.toSessionMetadata(): SessionMetadata =
        SessionMetadata(
            sessionId = uuid("id"),
            sessionNumber = getInt("number"),
            bookTitle = getString("book_title"),
            date = getObject("session_date", LocalDate::class.java),
        )

    private fun jdbcTemplate(): JdbcTemplate =
        jdbcTemplateProvider.ifAvailable
            ?: throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Feedback document storage is unavailable")

    private companion object {
        private const val FALLBACK_INVALID_DOCUMENT_TITLE = "문서 형식 확인 필요"
    }
}
