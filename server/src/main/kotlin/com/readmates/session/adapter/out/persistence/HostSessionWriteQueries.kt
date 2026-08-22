package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.HostSessionRecordStagingRequiredException
import com.readmates.session.application.HostSessionRevisionConflictException
import com.readmates.session.application.model.ExpectedSessionRevision
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.SessionVersionVector
import com.readmates.session.application.port.out.HostSessionVisibilitySnapshot
import com.readmates.session.domain.PublicSiteVisibility
import com.readmates.session.domain.SessionAccessScope
import com.readmates.session.domain.SessionExposure
import com.readmates.shared.db.dbString
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.springframework.jdbc.core.JdbcTemplate
import java.util.UUID

internal data class LockedSessionRow(
    val sessionId: UUID,
    val state: String,
)

internal class HostSessionWriteQueries(
    private val jdbcTemplate: JdbcTemplate,
    private val hostSessionQueries: HostSessionQueries,
) {
    fun lockClub(clubId: UUID) {
        jdbcTemplate.queryForObject(
            "select id from clubs where id = ? for update",
            String::class.java,
            clubId.dbString(),
        )
    }

    fun lockSession(
        clubId: UUID,
        sessionId: UUID,
    ): LockedSessionRow? =
        jdbcTemplate
            .query(
                """
                select id, state
                from sessions
                where id = ?
                  and club_id = ?
                  and deleted_at is null
                for update
                """.trimIndent(),
                { resultSet, _ ->
                    LockedSessionRow(
                        sessionId = resultSet.uuid("id"),
                        state = resultSet.getString("state"),
                    )
                },
                sessionId.dbString(),
                clubId.dbString(),
            ).firstOrNull()

    fun lockCurrentOpenSession(clubId: UUID): LockedSessionRow? =
        jdbcTemplate
            .query(
                """
                select id, state
                from sessions
                where club_id = ?
                  and deleted_at is null
                  and state = 'OPEN'
                order by number desc
                limit 1
                for update
                """.trimIndent(),
                { resultSet, _ ->
                    LockedSessionRow(
                        sessionId = resultSet.uuid("id"),
                        state = resultSet.getString("state"),
                    )
                },
                clubId.dbString(),
            ).firstOrNull()

    fun requireActiveClubAndMembership(
        clubId: UUID,
        membershipId: UUID,
        hostRequired: Boolean,
    ) {
        val row =
            jdbcTemplate
                .query(
                    """
                    select clubs.status as club_status, memberships.role, memberships.status as membership_status
                    from clubs
                    join memberships on memberships.club_id = clubs.id
                    where clubs.id = ?
                      and memberships.id = ?
                    """.trimIndent(),
                    { resultSet, _ ->
                        Triple(
                            resultSet.getString("club_status"),
                            resultSet.getString("role"),
                            resultSet.getString("membership_status"),
                        )
                    },
                    clubId.dbString(),
                    membershipId.dbString(),
                ).firstOrNull()
                ?: throw AccessDeniedException("Approved active membership is required")
        if (row.first != "ACTIVE" || row.third != "ACTIVE") {
            throw AccessDeniedException("Approved active membership is required")
        }
        if (hostRequired && row.second != "HOST") {
            throw AccessDeniedException("Host role required")
        }
    }

    fun nextSessionNumber(clubId: UUID): Int =
        jdbcTemplate.queryForObject(
            """
            select coalesce(max(number), 0) + 1
            from sessions
            where club_id = ?
            """.trimIndent(),
            Int::class.java,
            clubId.dbString(),
        ) ?: 1

    fun existingSchedule(
        member: CurrentMember,
        sessionId: UUID,
    ): ExistingHostSessionSchedule = hostSessionQueries.findExistingSchedule(jdbcTemplate, member, sessionId)

    fun requireHostSession(
        member: CurrentMember,
        sessionId: UUID,
    ) = hostSessionQueries.requireHostSession(jdbcTemplate, member, sessionId)

    fun state(
        member: CurrentMember,
        sessionId: UUID,
    ): String? = hostSessionQueries.findState(jdbcTemplate, member, sessionId)

    fun detail(
        member: CurrentMember,
        sessionId: UUID,
    ) = hostSessionQueries.findHostSessionAfterHostCheck(jdbcTemplate, member, sessionId)

    fun findOpenSessionId(clubId: UUID): UUID? =
        jdbcTemplate
            .query(
                """
                select id
                from active_sessions sessions
                where club_id = ?
                  and state = 'OPEN'
                limit 1
                """.trimIndent(),
                { resultSet, _ -> resultSet.uuid("id") },
                clubId.dbString(),
            ).firstOrNull()

    fun activeMembershipIds(clubId: UUID): List<UUID> =
        jdbcTemplate.query(
            """
            select id
            from memberships
            where club_id = ?
              and status = 'ACTIVE'
            order by joined_at is null, joined_at, created_at
            """.trimIndent(),
            { resultSet, _ -> resultSet.uuid("id") },
            clubId.dbString(),
        )

    fun lockExposure(
        host: CurrentMember,
        sessionId: UUID,
    ): LockedHostSessionExposure =
        jdbcTemplate
            .query(
                """
                select sessions.state,
                       sessions.visibility as session_visibility,
                       sessions.access_scope,
                       public_session_publications.visibility as publication_visibility,
                       public_session_publications.site_visibility,
                       public_session_publications.is_public
                from active_sessions sessions
                left join public_session_publications
                  on public_session_publications.club_id = sessions.club_id
                 and public_session_publications.session_id = sessions.id
                where sessions.id = ?
                  and sessions.club_id = ?
                for update
                """.trimIndent(),
                { resultSet, _ ->
                    LockedHostSessionExposure(
                        state = resultSet.getString("state"),
                        sessionVisibility = resultSet.getString("session_visibility"),
                        exposure =
                            SessionExposure(
                                accessScope = SessionAccessScope.valueOf(resultSet.getString("access_scope")),
                                siteVisibility =
                                    resultSet
                                        .getString("site_visibility")
                                        ?.let(PublicSiteVisibility::valueOf)
                                        ?: PublicSiteVisibility.HIDDEN,
                            ),
                    )
                },
                sessionId.dbString(),
                host.clubId.dbString(),
            ).firstOrNull() ?: throw HostSessionNotFoundException()

    fun requireLegacyPublicationWriteAllowed(
        host: CurrentMember,
        sessionId: UUID,
    ) {
        val state =
            jdbcTemplate.queryForObject(
                """
                select state
                from active_sessions sessions
                where id = ? and club_id = ?
                for update
                """.trimIndent(),
                String::class.java,
                sessionId.dbString(),
                host.clubId.dbString(),
            ) ?: throw HostSessionNotFoundException()
        if (state == "CLOSED" || state == "PUBLISHED") throw HostSessionRecordStagingRequiredException()
    }

    fun lockVisibilitySnapshot(command: HostSessionIdCommand): HostSessionVisibilitySnapshot {
        requireHostSession(command.host, command.sessionId)
        val updatedAt =
            jdbcTemplate
                .query(
                    """
                    select updated_at
                    from active_sessions sessions
                    where id = ? and club_id = ?
                    for update
                    """.trimIndent(),
                    { resultSet, _ -> resultSet.utcOffsetDateTime("updated_at") },
                    command.sessionId.dbString(),
                    command.host.clubId.dbString(),
                ).firstOrNull() ?: throw HostSessionNotFoundException()
        return HostSessionVisibilitySnapshot(
            detail = detail(command.host, command.sessionId),
            contentUpdatedAt = updatedAt,
        )
    }

    fun insertPublicationVersion(sessionId: UUID) {
        jdbcTemplate.update(
            """
            insert into session_publication_versions (session_id, publication_revision)
            values (?, 0)
            """.trimIndent(),
            sessionId.dbString(),
        )
    }

    fun expectedRevision(expected: ExpectedSessionRevision?): Long = expected?.value ?: -1

    fun throwIfStale(
        updated: Int,
        host: CurrentMember,
        sessionId: UUID,
    ) {
        if (updated > 0) return
        throw revisionConflict(host, sessionId) ?: HostSessionNotFoundException()
    }

    fun revisionConflict(
        host: CurrentMember,
        sessionId: UUID,
    ): HostSessionRevisionConflictException? {
        val snapshot =
            jdbcTemplate
                .query(
                    """
                    select sessions.session_revision,
                           sessions.exposure_revision,
                           sessions.participant_set_revision,
                           sessions.updated_at,
                           draft.draft_revision,
                           coalesce(revision.live_revision, 0) as live_revision,
                           coalesce(publication.publication_revision, 0) as publication_revision
                    from sessions
                    left join session_record_drafts draft
                      on draft.session_id = sessions.id and draft.club_id = sessions.club_id
                    left join (
                      select club_id, session_id, max(version) as live_revision
                      from session_record_revisions
                      group by club_id, session_id
                    ) revision
                      on revision.club_id = sessions.club_id
                     and revision.session_id = sessions.id
                    left join session_publication_versions publication
                      on publication.session_id = sessions.id
                    where sessions.id = ?
                      and sessions.club_id = ?
                      and sessions.deleted_at is null
                    """.trimIndent(),
                    { resultSet, _ ->
                        HostSessionRevisionConflictException(
                            current =
                                SessionVersionVector(
                                    sessionRevision = resultSet.getLong("session_revision"),
                                    exposureRevision = resultSet.getLong("exposure_revision"),
                                    participantSetRevision = resultSet.getLong("participant_set_revision"),
                                    recordDraftRevision = resultSet.getLong("draft_revision").takeUnless { resultSet.wasNull() },
                                    liveRecordRevision =
                                        resultSet.getLong("live_revision").takeIf { value -> value > 0 },
                                    publicationRevision = resultSet.getLong("publication_revision"),
                                ),
                            changedAt =
                                resultSet
                                    .utcOffsetDateTime("updated_at")
                                    .toInstant(),
                            changedByDisplay = loadChangedByDisplay(host, sessionId),
                        )
                    },
                    sessionId.dbString(),
                    host.clubId.dbString(),
                ).firstOrNull()
        return snapshot
    }

    private fun loadChangedByDisplay(
        host: CurrentMember,
        sessionId: UUID,
    ): String? =
        jdbcTemplate
            .query(
                """
                select memberships.short_name
                from host_session_change_audit audit
                join memberships
                  on memberships.id = audit.actor_membership_id
                 and memberships.club_id = audit.club_id
                where audit.club_id = ?
                  and audit.session_id = ?
                order by audit.created_at desc, audit.id desc
                limit 1
                """.trimIndent(),
                { resultSet, _ -> resultSet.getString("short_name") },
                host.clubId.dbString(),
                sessionId.dbString(),
            ).firstOrNull()
            ?.takeIf { name -> name.isNotBlank() && '@' !in name }
}

internal data class LockedHostSessionExposure(
    val state: String,
    val sessionVisibility: String,
    val exposure: SessionExposure,
)
