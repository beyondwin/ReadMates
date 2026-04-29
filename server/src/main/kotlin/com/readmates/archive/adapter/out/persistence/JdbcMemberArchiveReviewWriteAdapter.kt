package com.readmates.archive.adapter.out.persistence

import com.readmates.archive.application.port.`in`.SaveMemberArchiveLongReviewCommand
import com.readmates.archive.application.port.`in`.SaveMemberArchiveLongReviewResult
import com.readmates.archive.application.port.out.MemberArchiveReviewWritePort
import com.readmates.shared.db.dbString
import com.readmates.shared.db.uuid
import org.springframework.beans.factory.ObjectProvider
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.util.UUID

private data class ArchiveReviewWriteTarget(
    val sessionId: UUID,
    val clubId: UUID,
    val membershipId: UUID,
    val sessionNumber: Int,
    val bookTitle: String,
    val previousVisibility: String?,
)

@Repository
class JdbcMemberArchiveReviewWriteAdapter(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) : MemberArchiveReviewWritePort {
    override fun saveLongReview(command: SaveMemberArchiveLongReviewCommand): SaveMemberArchiveLongReviewResult? {
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: return null
        val target = jdbcTemplate.query(
            """
            select
              sessions.id as session_id,
              sessions.club_id as club_id,
              sessions.number as session_number,
              sessions.book_title,
              session_participants.membership_id,
              long_reviews.visibility as previous_visibility
            from sessions
            join session_participants on session_participants.session_id = sessions.id
              and session_participants.club_id = sessions.club_id
              and session_participants.membership_id = ?
              and session_participants.participation_status = 'ACTIVE'
            left join long_reviews on long_reviews.session_id = sessions.id
              and long_reviews.club_id = sessions.club_id
              and long_reviews.membership_id = session_participants.membership_id
            where sessions.club_id = ?
              and sessions.id = ?
              and sessions.state = 'PUBLISHED'
              and sessions.visibility in ('MEMBER', 'PUBLIC')
            """.trimIndent(),
            { resultSet, _ -> resultSet.toArchiveReviewWriteTarget() },
            command.member.membershipId.dbString(),
            command.member.clubId.dbString(),
            command.sessionId.dbString(),
        ).firstOrNull() ?: return null

        val updated = jdbcTemplate.update(
            """
            insert into long_reviews (id, club_id, session_id, membership_id, body, visibility)
            values (?, ?, ?, ?, ?, 'PUBLIC')
            on duplicate key update
              body = values(body),
              visibility = values(visibility),
              updated_at = utc_timestamp(6)
            """.trimIndent(),
            UUID.randomUUID().dbString(),
            target.clubId.dbString(),
            target.sessionId.dbString(),
            target.membershipId.dbString(),
            command.body,
        )
        if (updated == 0) {
            return null
        }

        return SaveMemberArchiveLongReviewResult(
            sessionId = target.sessionId,
            sessionNumber = target.sessionNumber,
            bookTitle = target.bookTitle,
            body = command.body,
            newlyPublic = target.previousVisibility != "PUBLIC",
        )
    }

    private fun ResultSet.toArchiveReviewWriteTarget(): ArchiveReviewWriteTarget =
        ArchiveReviewWriteTarget(
            sessionId = uuid("session_id"),
            clubId = uuid("club_id"),
            membershipId = uuid("membership_id"),
            sessionNumber = getInt("session_number"),
            bookTitle = getString("book_title"),
            previousVisibility = getString("previous_visibility"),
        )
}
