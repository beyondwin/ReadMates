package com.readmates.sessionimport.adapter.out.persistence

import com.readmates.session.application.SessionRecordVisibility
import com.readmates.sessionimport.application.model.SessionImportAttendee
import com.readmates.sessionimport.application.model.SessionImportRecordPreview
import com.readmates.sessionimport.application.model.SessionImportTarget
import com.readmates.sessionimport.application.port.out.SessionImportRecordReplacement
import com.readmates.sessionimport.application.port.out.SessionImportStoredFeedbackDocument
import com.readmates.sessionimport.application.port.out.SessionImportWritePort
import com.readmates.shared.db.dbString
import com.readmates.shared.db.uuid
import com.readmates.shared.security.AuthenticatedClubActor
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.nio.charset.StandardCharsets
import java.time.LocalDate
import java.util.UUID

@Repository
class JdbcSessionImportWriteAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : SessionImportWritePort {
    override fun loadTarget(
        host: AuthenticatedClubActor,
        sessionId: UUID,
    ): SessionImportTarget? {
        val session =
            jdbcTemplate
                .query(
                    """
                    select sessions.id, sessions.club_id, sessions.number, sessions.book_title, sessions.session_date
                    from sessions
                    join memberships on memberships.club_id = sessions.club_id
                    where sessions.id = ?
                      and sessions.club_id = ?
                      and memberships.user_id = ?
                      and memberships.role = 'HOST'
                      and memberships.status = 'ACTIVE'
                    """.trimIndent(),
                    { rs, _ ->
                        SessionImportTarget(
                            sessionId = rs.uuid("id"),
                            clubId = rs.uuid("club_id"),
                            sessionNumber = rs.getInt("number"),
                            bookTitle = rs.getString("book_title"),
                            meetingDate = rs.getObject("session_date", LocalDate::class.java),
                            attendees = emptyList(),
                        )
                    },
                    sessionId.dbString(),
                    host.clubId.dbString(),
                    host.userId.dbString(),
                ).firstOrNull() ?: return null

        val attendees =
            jdbcTemplate.query(
                """
                select memberships.id, users.name, session_participants.participation_status
                from session_participants
                join memberships on memberships.id = session_participants.membership_id
                  and memberships.club_id = session_participants.club_id
                join users on users.id = memberships.user_id
                where session_participants.club_id = ?
                  and session_participants.session_id = ?
                """.trimIndent(),
                { rs, _ ->
                    SessionImportAttendee(
                        membershipId = rs.uuid("id"),
                        displayName = rs.getString("name"),
                        active = rs.getString("participation_status") == "ACTIVE",
                    )
                },
                host.clubId.dbString(),
                sessionId.dbString(),
            )

        return session.copy(attendees = attendees)
    }

    override fun replaceRecords(command: SessionImportRecordReplacement): SessionImportStoredFeedbackDocument {
        lockSession(command)
        updateSessionVisibility(command)
        upsertPublication(command)
        replaceHighlights(command)
        replaceOneLineReviews(command)
        return storeFeedbackDocument(command)
    }

    private fun lockSession(command: SessionImportRecordReplacement) {
        jdbcTemplate.queryForObject(
            """
            select id
            from sessions
            where id = ?
              and club_id = ?
            for update
            """.trimIndent(),
            String::class.java,
            command.sessionId.dbString(),
            command.host.clubId.dbString(),
        )
    }

    private fun updateSessionVisibility(command: SessionImportRecordReplacement) {
        jdbcTemplate.update(
            """
            update sessions
            set visibility = ?,
                updated_at = utc_timestamp(6)
            where id = ?
              and club_id = ?
            """.trimIndent(),
            command.visibility.name,
            command.sessionId.dbString(),
            command.host.clubId.dbString(),
        )
    }

    private fun upsertPublication(command: SessionImportRecordReplacement) {
        val publicationIsPublic = command.visibility == SessionRecordVisibility.PUBLIC
        jdbcTemplate.update(
            """
            insert into public_session_publications (
              id, club_id, session_id, public_summary, is_public, visibility, published_at
            )
            values (?, ?, ?, ?, ?, ?, case when ? then utc_timestamp(6) else null end)
            on duplicate key update
              public_summary = values(public_summary),
              is_public = values(is_public),
              visibility = values(visibility),
              published_at = values(published_at),
              updated_at = utc_timestamp(6)
            """.trimIndent(),
            UUID.randomUUID().dbString(),
            command.host.clubId.dbString(),
            command.sessionId.dbString(),
            command.publicationSummary,
            publicationIsPublic,
            command.visibility.name,
            publicationIsPublic,
        )
    }

    private fun replaceHighlights(command: SessionImportRecordReplacement) {
        jdbcTemplate.update(
            "delete from highlights where club_id = ? and session_id = ?",
            command.host.clubId.dbString(),
            command.sessionId.dbString(),
        )
        command.highlights.forEachIndexed { index, highlight ->
            jdbcTemplate.update(
                """
                insert into highlights (id, club_id, session_id, membership_id, text, sort_order)
                values (?, ?, ?, ?, ?, ?)
                """.trimIndent(),
                UUID.randomUUID().dbString(),
                command.host.clubId.dbString(),
                command.sessionId.dbString(),
                requiredMembershipId(highlight).dbString(),
                highlight.text,
                index,
            )
        }
    }

    private fun replaceOneLineReviews(command: SessionImportRecordReplacement) {
        jdbcTemplate.update(
            "delete from one_line_reviews where club_id = ? and session_id = ?",
            command.host.clubId.dbString(),
            command.sessionId.dbString(),
        )
        val oneLineVisibility = if (command.visibility == SessionRecordVisibility.PUBLIC) "PUBLIC" else "SESSION"
        command.oneLineReviews.forEach { review ->
            jdbcTemplate.update(
                """
                insert into one_line_reviews (id, club_id, session_id, membership_id, text, visibility)
                values (?, ?, ?, ?, ?, ?)
                """.trimIndent(),
                UUID.randomUUID().dbString(),
                command.host.clubId.dbString(),
                command.sessionId.dbString(),
                requiredMembershipId(review).dbString(),
                review.text,
                oneLineVisibility,
            )
        }
    }

    private fun storeFeedbackDocument(command: SessionImportRecordReplacement): SessionImportStoredFeedbackDocument {
        val nextVersion =
            jdbcTemplate.queryForObject(
                """
                select coalesce(max(version), 0) + 1
                from session_feedback_documents
                where club_id = ?
                  and session_id = ?
                """.trimIndent(),
                Int::class.java,
                command.host.clubId.dbString(),
                command.sessionId.dbString(),
            ) ?: 1
        val fileName = command.feedbackDocument.fileName.trim()
        val contentType = if (fileName.endsWith(".txt")) "text/plain" else "text/markdown"
        val fileSize =
            command.feedbackDocument.markdown
                .toByteArray(StandardCharsets.UTF_8)
                .size
                .toLong()
        val documentId = UUID.randomUUID()
        jdbcTemplate.update(
            """
            insert into session_feedback_documents (
              id, club_id, session_id, version, source_text, document_title, file_name, content_type, file_size
            )
            values (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            documentId.dbString(),
            command.host.clubId.dbString(),
            command.sessionId.dbString(),
            nextVersion,
            command.feedbackDocument.markdown,
            command.feedbackTitle,
            fileName,
            contentType,
            fileSize,
        )
        val uploadedAt =
            jdbcTemplate.queryForObject(
                """
                select date_format(created_at, '%Y-%m-%dT%H:%i:%s.%fZ')
                from session_feedback_documents
                where id = ?
                """.trimIndent(),
                String::class.java,
                documentId.dbString(),
            )

        return SessionImportStoredFeedbackDocument(
            fileName = fileName,
            title = command.feedbackTitle,
            uploadedAt = uploadedAt,
            version = nextVersion,
        )
    }

    private fun requiredMembershipId(record: SessionImportRecordPreview): UUID =
        UUID.fromString(requireNotNull(record.membershipId) { "Validated import record must have a membership id" })
}
