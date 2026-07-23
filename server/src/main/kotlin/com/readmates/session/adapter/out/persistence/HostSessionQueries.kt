package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostSessionFeedbackDocument
import com.readmates.session.application.HostSessionListItem
import com.readmates.session.application.HostSessionListQuery
import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.HostSessionPublication
import com.readmates.session.application.InvalidHostSessionCursorException
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.session.application.UpcomingSessionItem
import com.readmates.session.application.model.HostDashboardResult
import com.readmates.session.application.requireHost
import com.readmates.shared.db.dbString
import com.readmates.shared.db.uuid
import com.readmates.shared.paging.CursorCodec
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import org.springframework.jdbc.core.JdbcTemplate
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.UUID

internal class HostSessionQueries {
    @Suppress("LongMethod")
    fun list(
        jdbcTemplate: JdbcTemplate,
        host: CurrentMember,
        pageRequest: PageRequest,
        query: HostSessionListQuery,
    ): CursorPage<HostSessionListItem> {
        requireHost(host)
        val normalizedQuery = query.normalized()
        val queryKey = normalizedQuery.fingerprint()
        val cursor = HostSessionCursor.from(pageRequest.cursor, queryKey, host.clubId)
        val baseConditions = mutableListOf("club_id = ?")
        val baseParameters = mutableListOf<Any>(host.clubId.dbString())
        normalizedQuery.search?.let { search ->
            baseConditions += "(cast(number as char) = ? or lower(title) like ? or lower(book_title) like ?)"
            baseParameters += search
            baseParameters += "%$search%"
            baseParameters += "%$search%"
        }
        normalizedQuery.state?.let {
            baseConditions += "state = ?"
            baseParameters += it
        }
        val scan =
            scanHostSessionLedger(
                limit = pageRequest.limit,
                initialCursor = cursor,
                matches = { item ->
                    (normalizedQuery.recordStatus == null || item.recordStatus == normalizedQuery.recordStatus) &&
                        (
                            normalizedQuery.needsAttention == null ||
                                item.needsAttention == normalizedQuery.needsAttention
                        )
                },
            ) { scanCursor, chunkSize ->
                val conditions = baseConditions.toMutableList()
                val parameters = baseParameters.toMutableList()
                scanCursor?.let {
                    conditions += "(number < ? or (number = ? and id < ?))"
                    parameters += it.number
                    parameters += it.number
                    parameters += it.id.dbString()
                }
                parameters += chunkSize
                jdbcTemplate.query(
                    """
                    select *
                    from (
                      select sessions.id, sessions.club_id, sessions.number, sessions.title,
                             sessions.book_title, sessions.book_author, sessions.book_image_url,
                             sessions.session_date, sessions.start_time, sessions.end_time,
                             sessions.location_label, sessions.state, sessions.visibility,
                             (coalesce(publication.public_summary, '') <> ''
                               or (select count(*) from highlights
                                   where highlights.club_id = sessions.club_id
                                     and highlights.session_id = sessions.id) > 0
                               or (select count(*) from one_line_reviews
                                   where one_line_reviews.club_id = sessions.club_id
                                     and one_line_reviews.session_id = sessions.id) > 0) as record_saved,
                             exists (
                               select 1 from session_feedback_documents
                               where session_feedback_documents.club_id = sessions.club_id
                                 and session_feedback_documents.session_id = sessions.id
                             ) as feedback_ready,
                             (draft.session_id is not null) as has_draft,
                             draft.draft_revision,
                             coalesce(revision.live_revision, 0) as live_revision,
                             greatest(
                               sessions.updated_at,
                               coalesce(draft.updated_at, sessions.updated_at),
                               coalesce(revision.applied_at, sessions.updated_at),
                               coalesce(audit.created_at, sessions.updated_at)
                             ) as last_modified_at
                      from sessions
                      left join public_session_publications publication
                        on publication.club_id = sessions.club_id
                       and publication.session_id = sessions.id
                      left join session_record_drafts draft
                        on draft.club_id = sessions.club_id
                       and draft.session_id = sessions.id
                      left join (
                        select club_id, session_id, max(version) as live_revision, max(applied_at) as applied_at
                        from session_record_revisions
                        group by club_id, session_id
                      ) revision
                        on revision.club_id = sessions.club_id
                       and revision.session_id = sessions.id
                      left join (
                        select club_id, session_id, max(created_at) as created_at
                        from host_session_change_audit
                        group by club_id, session_id
                      ) audit
                        on audit.club_id = sessions.club_id
                       and audit.session_id = sessions.id
                    ) ledger_facts
                    where ${conditions.joinToString(" and ")}
                    order by number desc, id desc
                    limit ?
                    """.trimIndent(),
                    { resultSet, _ -> resultSet.toHostSessionListItem() },
                    *parameters.toTypedArray(),
                )
            }
        return CursorPage(
            items = scan.items,
            nextCursor =
                scan.continuation?.let {
                    hostSessionCursor(it.number, it.id, queryKey, host.clubId)
                },
        )
    }

    fun upcoming(
        jdbcTemplate: JdbcTemplate,
        member: CurrentMember,
    ): List<UpcomingSessionItem> =
        jdbcTemplate.query(
            """
            select id, number, title, book_title, book_author, book_image_url,
                   session_date, start_time, end_time, location_label, visibility
            from sessions
            where club_id = ?
              and state = 'DRAFT'
              and visibility in ('MEMBER', 'PUBLIC')
            order by session_date, number
            """.trimIndent(),
            { resultSet, _ -> resultSet.toUpcomingSessionItem() },
            member.clubId.dbString(),
        )

    fun hostDashboard(
        jdbcTemplate: JdbcTemplate,
        member: CurrentMember,
    ): HostDashboardResult {
        requireHost(member)
        val currentMetrics =
            jdbcTemplate.queryForObject(
                """
                select
                  coalesce(sum(case when session_participants.rsvp_status = 'NO_RESPONSE' then 1 else 0 end), 0) as rsvp_pending,
                  coalesce(sum(case
                    when session_participants.rsvp_status = 'GOING'
                      and reading_checkins.id is null
                    then 1 else 0
                  end), 0) as checkin_missing
                from sessions
                join session_participants on session_participants.session_id = sessions.id
                  and session_participants.club_id = sessions.club_id
                left join reading_checkins on reading_checkins.session_id = sessions.id
                  and reading_checkins.club_id = sessions.club_id
                  and reading_checkins.membership_id = session_participants.membership_id
                where sessions.club_id = ?
                  and sessions.state = 'OPEN'
                  and session_participants.participation_status = 'ACTIVE'
                """.trimIndent(),
                { resultSet, _ -> resultSet.toHostDashboardOpenMetrics() },
                member.clubId.dbString(),
            ) ?: HostDashboardOpenMetrics(rsvpPending = 0, checkinMissing = 0)

        val publishPending =
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from sessions
                left join public_session_publications on public_session_publications.session_id = sessions.id
                  and public_session_publications.club_id = sessions.club_id
                where sessions.club_id = ?
                  and sessions.state in ('CLOSED', 'PUBLISHED')
                  and public_session_publications.session_id is null
                """.trimIndent(),
                Int::class.java,
                member.clubId.dbString(),
            ) ?: 0

        val feedbackPending =
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from sessions
                where sessions.club_id = ?
                  and sessions.state in ('PUBLISHED', 'CLOSED')
                  and exists (
                    select 1
                    from session_participants
                    where session_participants.club_id = sessions.club_id
                      and session_participants.session_id = sessions.id
                      and session_participants.attendance_status = 'ATTENDED'
                      and session_participants.participation_status = 'ACTIVE'
                  )
                  and not exists (
                    select 1
                    from session_feedback_documents
                    where session_feedback_documents.club_id = sessions.club_id
                      and session_feedback_documents.session_id = sessions.id
                  )
                """.trimIndent(),
                Int::class.java,
                member.clubId.dbString(),
            ) ?: 0
        val currentSessionMissingMembers = findCurrentSessionMissingMembers(jdbcTemplate, member)

        return HostDashboardResult(
            rsvpPending = currentMetrics.rsvpPending,
            checkinMissing = currentMetrics.checkinMissing,
            publishPending = publishPending,
            feedbackPending = feedbackPending,
            currentSessionMissingMemberCount = currentSessionMissingMembers.size,
            currentSessionMissingMembers = currentSessionMissingMembers,
        )
    }

    private fun findCurrentSessionMissingMembers(
        jdbcTemplate: JdbcTemplate,
        member: CurrentMember,
    ) = jdbcTemplate.query(
        """
        select
          memberships.id as membership_id,
          users.name as display_name,
          users.email as email
        from (
          select id, club_id
          from sessions
          where club_id = ?
            and state = 'OPEN'
          order by session_date desc, number desc
          limit 1
        ) open_session
        join memberships on memberships.club_id = open_session.club_id
          and memberships.status = 'ACTIVE'
        join users on users.id = memberships.user_id
        where not exists (
          select 1
          from session_participants
          where session_participants.club_id = open_session.club_id
            and session_participants.session_id = open_session.id
            and session_participants.membership_id = memberships.id
        )
        order by memberships.joined_at is null, memberships.joined_at, memberships.created_at, memberships.id
        """.trimIndent(),
        { resultSet, _ -> resultSet.toHostDashboardMissingMemberResult() },
        member.clubId.dbString(),
    )

    fun findHostSession(
        jdbcTemplate: JdbcTemplate,
        member: CurrentMember,
        sessionId: UUID,
    ) = run {
        requireHost(member)
        findHostSessionWithoutHostCheck(jdbcTemplate, member, sessionId)
    }

    fun findHostSessionAfterHostCheck(
        jdbcTemplate: JdbcTemplate,
        member: CurrentMember,
        sessionId: UUID,
    ) = findHostSessionWithoutHostCheck(jdbcTemplate, member, sessionId)

    private fun findHostSessionWithoutHostCheck(
        jdbcTemplate: JdbcTemplate,
        member: CurrentMember,
        sessionId: UUID,
    ) = jdbcTemplate
        .query(
            """
            select
              id,
              number,
              title,
              book_title,
              book_author,
              book_link,
              book_image_url,
              session_date,
              start_time,
              end_time,
              question_deadline_at,
              location_label,
              meeting_url,
              meeting_passcode,
              state,
              visibility
            from sessions
            where id = ?
              and club_id = ?
            """.trimIndent(),
            { resultSet, _ -> resultSet.toHostSessionDetailBase() },
            sessionId.dbString(),
            member.clubId.dbString(),
        ).firstOrNull()
        ?.copy(
            attendees = findHostSessionAttendees(jdbcTemplate, sessionId, member.clubId),
            feedbackDocument = findHostSessionFeedbackDocument(jdbcTemplate, sessionId, member.clubId),
            publication = findHostSessionPublication(jdbcTemplate, sessionId, member.clubId),
        ) ?: throw HostSessionNotFoundException()

    fun requireHostSession(
        jdbcTemplate: JdbcTemplate,
        member: CurrentMember,
        sessionId: UUID,
    ) {
        requireHost(member)
        val exists =
            jdbcTemplate
                .query(
                    """
                    select 1
                    from sessions
                    where id = ?
                      and club_id = ?
                    """.trimIndent(),
                    { _, _ -> true },
                    sessionId.dbString(),
                    member.clubId.dbString(),
                ).firstOrNull() ?: false
        if (!exists) {
            throw HostSessionNotFoundException()
        }
    }

    fun findExistingSchedule(
        jdbcTemplate: JdbcTemplate,
        member: CurrentMember,
        sessionId: UUID,
    ): ExistingHostSessionSchedule =
        jdbcTemplate
            .query(
                """
                select start_time, end_time, question_deadline_at
                from sessions
                where id = ?
                  and club_id = ?
                for update
                """.trimIndent(),
                { resultSet, _ -> resultSet.toExistingHostSessionSchedule() },
                sessionId.dbString(),
                member.clubId.dbString(),
            ).firstOrNull() ?: throw HostSessionNotFoundException()

    fun findState(
        jdbcTemplate: JdbcTemplate,
        member: CurrentMember,
        sessionId: UUID,
    ): String? =
        jdbcTemplate
            .query(
                """
                select state
                from sessions
                where id = ?
                  and club_id = ?
                """.trimIndent(),
                { resultSet, _ -> resultSet.getString("state") },
                sessionId.dbString(),
                member.clubId.dbString(),
            ).firstOrNull()

    private fun findHostSessionAttendees(
        jdbcTemplate: JdbcTemplate,
        sessionId: UUID,
        clubId: UUID,
    ) = jdbcTemplate.query(
        """
        select
          memberships.id as membership_id,
          coalesce(memberships.short_name, users.name) as display_name,
          users.name as account_name,
          session_participants.rsvp_status,
          session_participants.attendance_status,
          session_participants.participation_status
        from session_participants
        join memberships on memberships.id = session_participants.membership_id
          and memberships.club_id = session_participants.club_id
        join users on users.id = memberships.user_id
        where session_participants.session_id = ?
          and session_participants.club_id = ?
        order by
          case when memberships.role = 'HOST' then 0 else 1 end,
          users.name
        """.trimIndent(),
        { resultSet, _ -> resultSet.toHostSessionAttendee() },
        sessionId.dbString(),
        clubId.dbString(),
    )

    private fun findHostSessionFeedbackDocument(
        jdbcTemplate: JdbcTemplate,
        sessionId: UUID,
        clubId: UUID,
    ): HostSessionFeedbackDocument =
        jdbcTemplate
            .query(
                """
                select
                  file_name,
                  created_at
                from session_feedback_documents
                where session_id = ?
                  and club_id = ?
                order by version desc, created_at desc
                limit 1
                """.trimIndent(),
                { resultSet, _ -> resultSet.toHostSessionFeedbackDocument() },
                sessionId.dbString(),
                clubId.dbString(),
            ).firstOrNull() ?: HostSessionFeedbackDocument(
            uploaded = false,
            fileName = null,
            uploadedAt = null,
        )

    private fun findHostSessionPublication(
        jdbcTemplate: JdbcTemplate,
        sessionId: UUID,
        clubId: UUID,
    ): HostSessionPublication? =
        jdbcTemplate
            .query(
                """
                select
                  public_summary,
                  visibility
                from public_session_publications
                where session_id = ?
                  and club_id = ?
                limit 1
                """.trimIndent(),
                { resultSet, _ -> resultSet.toHostSessionPublication() },
                sessionId.dbString(),
                clubId.dbString(),
            ).firstOrNull()
}

private fun hostSessionCursor(
    number: Int,
    id: UUID,
    queryKey: String,
    clubId: UUID,
): String? =
    CursorCodec.encode(
        mapOf(
            "number" to number.toString(),
            "id" to id.toString(),
            "query" to queryKey,
            "clubId" to clubId.toString(),
        ),
    )

internal data class HostSessionCursor(
    val number: Int,
    val id: UUID,
) {
    companion object {
        fun from(
            cursor: Map<String, String>,
            expectedQuery: String,
            expectedClubId: UUID,
        ): HostSessionCursor? {
            if (cursor.isEmpty()) return null
            val hasExpectedKeys = cursor.keys == setOf("number", "id", "query", "clubId")
            if (!hasExpectedKeys) invalidCursor()
            val number = cursor["number"]?.toIntOrNull() ?: invalidCursor()
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
            return HostSessionCursor(number, id)
        }
    }
}

internal data class HostSessionLedgerScanResult(
    val items: List<HostSessionListItem>,
    val continuation: HostSessionCursor?,
)

@Suppress("ReturnCount")
internal fun scanHostSessionLedger(
    limit: Int,
    initialCursor: HostSessionCursor?,
    matches: (HostSessionListItem) -> Boolean,
    loadChunk: (HostSessionCursor?, Int) -> List<HostSessionListItem>,
): HostSessionLedgerScanResult {
    val matched = mutableListOf<HostSessionListItem>()
    var scanCursor = initialCursor
    repeat(HOST_SESSION_LEDGER_MAX_SCAN_CHUNKS) {
        val rows = loadChunk(scanCursor, HOST_SESSION_LEDGER_SCAN_CHUNK_SIZE)
        if (rows.isEmpty()) return HostSessionLedgerScanResult(matched, null)
        val lastScanned = rows.last().toScanCursor()
        rows.filterTo(matched, matches)
        if (matched.size > limit) {
            val visible = matched.take(limit)
            return HostSessionLedgerScanResult(visible, visible.lastOrNull()?.toScanCursor())
        }
        if (rows.size < HOST_SESSION_LEDGER_SCAN_CHUNK_SIZE) {
            return HostSessionLedgerScanResult(matched, null)
        }
        scanCursor = lastScanned
    }
    return HostSessionLedgerScanResult(matched, scanCursor)
}

private fun HostSessionListItem.toScanCursor() = HostSessionCursor(sessionNumber, UUID.fromString(sessionId))

internal const val HOST_SESSION_LEDGER_SCAN_CHUNK_SIZE = 200
internal const val HOST_SESSION_LEDGER_MAX_SCAN_CHUNKS = 10

private fun invalidCursor(): Nothing = throw InvalidHostSessionCursorException()

private fun HostSessionListQuery.normalized() =
    copy(
        search = search?.trim()?.lowercase()?.takeIf(String::isNotBlank),
        state = state?.trim()?.uppercase()?.takeIf(String::isNotBlank),
    )

private fun HostSessionListQuery.fingerprint(): String {
    val value =
        listOf(
            search.orEmpty(),
            state.orEmpty(),
            recordStatus?.name.orEmpty(),
            needsAttention?.toString().orEmpty(),
        ).joinToString("\u0000")
    return MessageDigest
        .getInstance("SHA-256")
        .digest(value.toByteArray(StandardCharsets.UTF_8))
        .joinToString("") { "%02x".format(it) }
}
