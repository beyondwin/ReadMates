package com.readmates.aigen.adapter.`in`.web

import com.readmates.aigen.application.model.AuthorNameMode
import com.readmates.aigen.application.model.SessionMeta
import com.readmates.auth.domain.MembershipRole
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import java.time.LocalDate
import java.util.UUID

/**
 * Authorization port for the AI generation controller. Implementations
 * verify the caller's host membership on the session's club and return
 * the [SessionMeta] the controller needs to dispatch a generation job.
 *
 * Phase 2 ships an interface + a DB-backed implementation. The DB-backed
 * impl is intentionally minimal (no support-grant synthesis, no soft-deletes)
 * since the only first-party caller is a host HTTP endpoint that already
 * passes through [CurrentMember] resolution.
 */
interface AiGenerationAuthorizationPolicy {
    fun requireHostAccess(
        sessionId: UUID,
        member: CurrentMember,
    ): SessionMeta
}

/**
 * Production implementation. Loads the session row, confirms the caller has an
 * active HOST membership on the owning club, and returns the populated
 * [SessionMeta] with `expectedAuthorNames` derived from the session's active
 * participants (joined to their membership short_name). The author-name mode
 * defaults to REAL here; the caller can override per-job at start time.
 *
 * Wired only when `readmates.aigen.enabled=true`. Works in both production and
 * integration-test ('readmates.aigen.mock=true') contexts because the test seeds
 * the same DB rows the production lookup expects.
 */
@Component
@ConditionalOnProperty(prefix = "readmates.aigen", name = ["enabled"], havingValue = "true")
class DefaultAiGenerationAuthorizationPolicy(
    private val jdbc: JdbcTemplate,
) : AiGenerationAuthorizationPolicy {

    override fun requireHostAccess(sessionId: UUID, member: CurrentMember): SessionMeta {
        val row = jdbc.queryForList(
            """
            select s.club_id, s.number, s.book_title, s.book_author, s.session_date
            from sessions s
            where s.id = ?
            """.trimIndent(),
            sessionId.toString(),
        ).firstOrNull()
            ?: throw AccessDeniedException("Session $sessionId not found")

        val clubId = UUID.fromString(row["club_id"] as String)
        if (clubId != member.clubId || member.role != MembershipRole.HOST) {
            throw AccessDeniedException(
                "User ${member.userId} is not a HOST on session $sessionId",
            )
        }
        // Use users.name (the per-user display name) so the SessionImport validator,
        // which matches authorName == attendee.displayName (loaded from users.name in
        // JdbcSessionImportWriteAdapter), accepts what the LLM emits.
        val expectedAuthorNames = jdbc.queryForList(
            """
            select u.name
            from session_participants sp
            join memberships m on m.id = sp.membership_id
            join users u on u.id = m.user_id
            where sp.session_id = ?
              and sp.participation_status = 'ACTIVE'
            order by sp.id
            """.trimIndent(),
            String::class.java,
            sessionId.toString(),
        )

        return SessionMeta(
            sessionId = sessionId,
            clubId = clubId,
            sessionNumber = (row["number"] as Number).toInt(),
            bookTitle = row["book_title"] as String,
            bookAuthor = row["book_author"] as String?,
            meetingDate = (row["session_date"] as java.sql.Date).toLocalDate() ?: LocalDate.now(),
            expectedAuthorNames = expectedAuthorNames,
            authorNameMode = AuthorNameMode.REAL,
        )
    }
}
