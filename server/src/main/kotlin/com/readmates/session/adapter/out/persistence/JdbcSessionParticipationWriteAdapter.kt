package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.CurrentSessionNotOpenException
import com.readmates.session.application.InvalidQuestionSetException
import com.readmates.session.application.model.CheckinResult
import com.readmates.session.application.model.LongReviewResult
import com.readmates.session.application.model.OneLineReviewResult
import com.readmates.session.application.model.QuestionResult
import com.readmates.session.application.model.ReplaceQuestionCommandItem
import com.readmates.session.application.model.ReplaceQuestionsCommand
import com.readmates.session.application.model.ReplaceQuestionsResult
import com.readmates.session.application.model.RsvpResult
import com.readmates.session.application.model.SaveCheckinCommand
import com.readmates.session.application.model.SaveLongReviewCommand
import com.readmates.session.application.model.SaveOneLineReviewCommand
import com.readmates.session.application.model.SaveQuestionCommand
import com.readmates.session.application.model.UpdateRsvpCommand
import com.readmates.session.application.port.out.SessionParticipationWritePort
import com.readmates.shared.db.dbString
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.springframework.beans.factory.ObjectProvider
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

private data class CurrentQuestionTarget(
    val sessionId: String,
    val clubId: String,
    val membershipId: String,
)

@Repository
class JdbcSessionParticipationWriteAdapter(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) : SessionParticipationWritePort {
    override fun updateRsvp(command: UpdateRsvpCommand): RsvpResult {
        val result = updateMemberRsvp(command.member, command.status)
        return RsvpResult(status = result.getValue("status"))
    }

    override fun saveCheckin(command: SaveCheckinCommand): CheckinResult {
        val result = saveMemberCheckin(command.member, command.readingProgress)
        return CheckinResult(readingProgress = result.getValue("readingProgress") as Int)
    }

    override fun saveQuestion(command: SaveQuestionCommand): QuestionResult {
        val result = saveMemberQuestion(command.member, command.priority, command.text, command.draftThought)
        return QuestionResult(
            priority = result.getValue("priority") as Int,
            text = result.getValue("text") as String,
            draftThought = result["draftThought"] as String?,
        )
    }

    @Transactional
    override fun replaceQuestions(command: ReplaceQuestionsCommand): ReplaceQuestionsResult {
        val result = replaceMemberQuestions(command.member, command.questions)
        @Suppress("UNCHECKED_CAST")
        val questions = result.getValue("questions") as List<Map<String, Any?>>
        return ReplaceQuestionsResult(
            questions = questions.map { question ->
                QuestionResult(
                    priority = question.getValue("priority") as Int,
                    text = question.getValue("text") as String,
                    draftThought = question["draftThought"] as String?,
                )
            },
        )
    }

    override fun saveOneLineReview(command: SaveOneLineReviewCommand): OneLineReviewResult {
        val result = saveMemberOneLineReview(command.member, command.text)
        return OneLineReviewResult(text = result.getValue("text"))
    }

    override fun saveLongReview(command: SaveLongReviewCommand): LongReviewResult {
        val result = saveMemberLongReview(command.member, command.body)
        return LongReviewResult(body = result.getValue("body"))
    }

    private fun updateMemberRsvp(member: CurrentMember, status: String): Map<String, String> {
        requireWritableMember(member)
        val jdbcTemplate = jdbcTemplate()
        val updated = jdbcTemplate.update(
            """
            update session_participants
            set rsvp_status = ?,
                updated_at = utc_timestamp(6)
            where session_id = (
                select sessions.id
                from sessions
                where sessions.club_id = ?
                  and sessions.state = 'OPEN'
                order by sessions.number desc
                limit 1
              )
              and membership_id = ?
              and club_id = ?
              and participation_status = 'ACTIVE'
            """.trimIndent(),
            status,
            member.clubId.dbString(),
            member.membershipId.dbString(),
            member.clubId.dbString(),
        )
        if (updated == 0) {
            throwCurrentSessionWriteException(jdbcTemplate, member)
        }

        return mapOf("status" to status)
    }

    private fun saveMemberCheckin(member: CurrentMember, readingProgress: Int): Map<String, Any> {
        requireWritableMember(member)
        val jdbcTemplate = jdbcTemplate()
        val updated = jdbcTemplate.update(
            """
            insert into reading_checkins (
              id,
              club_id,
              session_id,
              membership_id,
              reading_progress
            )
            select
              ?,
              current_session.club_id,
              current_session.id,
              session_participants.membership_id,
              ?
            from (
              select id, club_id
              from sessions
              where club_id = ?
                and state = 'OPEN'
              order by number desc
              limit 1
            ) current_session
            join session_participants on session_participants.session_id = current_session.id
              and session_participants.club_id = current_session.club_id
              and session_participants.membership_id = ?
              and session_participants.participation_status = 'ACTIVE'
            on duplicate key update
              reading_progress = values(reading_progress),
              updated_at = utc_timestamp(6)
            """.trimIndent(),
            UUID.randomUUID().dbString(),
            readingProgress,
            member.clubId.dbString(),
            member.membershipId.dbString(),
        )
        if (updated == 0) {
            throwCurrentSessionWriteException(jdbcTemplate, member)
        }

        return mapOf("readingProgress" to readingProgress)
    }

    private fun saveMemberQuestion(member: CurrentMember, priority: Int, text: String, draftThought: String?): Map<String, Any?> {
        requireWritableMember(member)
        val jdbcTemplate = jdbcTemplate()
        val updated = jdbcTemplate.update(
            """
            insert into questions (
              id,
              club_id,
              session_id,
              membership_id,
              priority,
              text,
              draft_thought
            )
            select
              ?,
              current_session.club_id,
              current_session.id,
              session_participants.membership_id,
              ?,
              ?,
              ?
            from (
              select id, club_id
              from sessions
              where club_id = ?
                and state = 'OPEN'
              order by number desc
              limit 1
            ) current_session
            join session_participants on session_participants.session_id = current_session.id
              and session_participants.club_id = current_session.club_id
              and session_participants.membership_id = ?
              and session_participants.participation_status = 'ACTIVE'
            on duplicate key update
              text = values(text),
              draft_thought = values(draft_thought),
              updated_at = utc_timestamp(6)
            """.trimIndent(),
            UUID.randomUUID().dbString(),
            priority,
            text,
            draftThought,
            member.clubId.dbString(),
            member.membershipId.dbString(),
        )
        if (updated == 0) {
            throwCurrentSessionWriteException(jdbcTemplate, member)
        }

        return mapOf("priority" to priority, "text" to text, "draftThought" to draftThought)
    }

    @Transactional
    private fun replaceMemberQuestions(member: CurrentMember, replacements: List<ReplaceQuestionCommandItem>): Map<String, Any> {
        requireWritableMember(member)
        val questions = replacements.map { it.copy(text = it.text.trim()) }
        if (
            questions.size > 5 ||
            questions.any { it.priority !in 1..5 || it.text.isEmpty() } ||
            questions.map { it.priority }.distinct().size != questions.size
        ) {
            throw InvalidQuestionSetException()
        }

        val jdbcTemplate = jdbcTemplate()
        val target = jdbcTemplate.query(
            """
            select
              current_session.id as session_id,
              current_session.club_id as club_id,
              session_participants.membership_id as membership_id
            from (
              select id, club_id
              from sessions
              where club_id = ?
                and state = 'OPEN'
              order by number desc
              limit 1
            ) current_session
            join session_participants on session_participants.session_id = current_session.id
              and session_participants.club_id = current_session.club_id
              and session_participants.membership_id = ?
              and session_participants.participation_status = 'ACTIVE'
            """.trimIndent(),
            { resultSet, _ ->
                CurrentQuestionTarget(
                    sessionId = resultSet.getString("session_id"),
                    clubId = resultSet.getString("club_id"),
                    membershipId = resultSet.getString("membership_id"),
                )
            },
            member.clubId.dbString(),
            member.membershipId.dbString(),
        ).firstOrNull() ?: throwCurrentSessionWriteException(jdbcTemplate, member)

        jdbcTemplate.update(
            """
            delete from questions
            where club_id = ?
              and session_id = ?
              and membership_id = ?
            """.trimIndent(),
            target.clubId,
            target.sessionId,
            target.membershipId,
        )

        questions.sortedBy { it.priority }.forEach { question ->
            jdbcTemplate.update(
                """
                insert into questions (
                  id,
                  club_id,
                  session_id,
                  membership_id,
                  priority,
                  text,
                  draft_thought
                )
                values (?, ?, ?, ?, ?, ?, null)
                """.trimIndent(),
                UUID.randomUUID().dbString(),
                target.clubId,
                target.sessionId,
                target.membershipId,
                question.priority,
                question.text,
            )
        }

        return mapOf(
            "questions" to questions.sortedBy { it.priority }.map { question ->
                mapOf(
                    "priority" to question.priority,
                    "text" to question.text,
                    "draftThought" to null,
                )
            },
        )
    }

    private fun saveMemberOneLineReview(member: CurrentMember, text: String): Map<String, String> {
        requireWritableMember(member)
        val jdbcTemplate = jdbcTemplate()
        val updated = jdbcTemplate.update(
            """
            insert into one_line_reviews (id, club_id, session_id, membership_id, text, visibility)
            select ?, current_session.club_id, current_session.id, session_participants.membership_id, ?, 'SESSION'
            from (
              select id, club_id
              from sessions
              where club_id = ?
                and state = 'OPEN'
              order by number desc
              limit 1
            ) current_session
            join session_participants on session_participants.session_id = current_session.id
              and session_participants.club_id = current_session.club_id
              and session_participants.membership_id = ?
              and session_participants.participation_status = 'ACTIVE'
            on duplicate key update
              text = values(text),
              visibility = values(visibility),
              updated_at = utc_timestamp(6)
            """.trimIndent(),
            UUID.randomUUID().dbString(),
            text,
            member.clubId.dbString(),
            member.membershipId.dbString(),
        )
        if (updated == 0) {
            throwCurrentSessionWriteException(jdbcTemplate, member)
        }

        return mapOf("text" to text)
    }

    private fun saveMemberLongReview(member: CurrentMember, body: String): Map<String, String> {
        requireWritableMember(member)
        val jdbcTemplate = jdbcTemplate()
        val target = jdbcTemplate.query(
            """
            select
              current_session.id as session_id,
              current_session.club_id as club_id,
              session_participants.membership_id as membership_id
            from (
              select id, club_id
              from sessions
              where club_id = ?
                and state = 'OPEN'
              order by number desc
              limit 1
            ) current_session
            join session_participants on session_participants.session_id = current_session.id
              and session_participants.club_id = current_session.club_id
              and session_participants.membership_id = ?
              and session_participants.participation_status = 'ACTIVE'
            """.trimIndent(),
            { resultSet, _ ->
                CurrentQuestionTarget(
                    sessionId = resultSet.getString("session_id"),
                    clubId = resultSet.getString("club_id"),
                    membershipId = resultSet.getString("membership_id"),
                )
            },
            member.clubId.dbString(),
            member.membershipId.dbString(),
        ).firstOrNull() ?: throwCurrentSessionWriteException(jdbcTemplate, member)

        if (body.isBlank()) {
            jdbcTemplate.update(
                """
                delete from long_reviews
                where club_id = ?
                  and session_id = ?
                  and membership_id = ?
                """.trimIndent(),
                target.clubId,
                target.sessionId,
                target.membershipId,
            )
            return mapOf("body" to "")
        }

        val updated = jdbcTemplate.update(
            """
            insert into long_reviews (id, club_id, session_id, membership_id, body, visibility)
            values (?, ?, ?, ?, ?, 'PRIVATE')
            on duplicate key update
              body = values(body),
              visibility = values(visibility),
              updated_at = utc_timestamp(6)
            """.trimIndent(),
            UUID.randomUUID().dbString(),
            target.clubId,
            target.sessionId,
            target.membershipId,
            body,
        )
        if (updated == 0) {
            throwCurrentSessionWriteException(jdbcTemplate, member)
        }

        return mapOf("body" to body)
    }

    private fun jdbcTemplate(): JdbcTemplate =
        jdbcTemplateOrThrow(jdbcTemplateProvider)

    private fun requireWritableMember(member: CurrentMember) {
        if (!member.isActive) {
            throw AccessDeniedException("Approved active membership is required")
        }
    }

    private fun throwCurrentSessionWriteException(jdbcTemplate: JdbcTemplate, member: CurrentMember): Nothing {
        if (isRemovedFromCurrentOpenSession(jdbcTemplate, member)) {
            throw AccessDeniedException("Current session participation is required")
        }
        throw CurrentSessionNotOpenException()
    }

    private fun isRemovedFromCurrentOpenSession(jdbcTemplate: JdbcTemplate, member: CurrentMember): Boolean =
        jdbcTemplate.queryForObject(
            """
            select count(*)
            from session_participants
            where session_participants.session_id = (
                select sessions.id
                from sessions
                where sessions.club_id = ?
                  and sessions.state = 'OPEN'
                order by sessions.number desc
                limit 1
              )
              and session_participants.club_id = ?
              and session_participants.membership_id = ?
              and session_participants.participation_status = 'REMOVED'
            """.trimIndent(),
            Int::class.java,
            member.clubId.dbString(),
            member.clubId.dbString(),
            member.membershipId.dbString(),
        )?.let { it > 0 } ?: false
}
