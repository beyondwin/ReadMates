package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.HostSessionRecordStagingRequiredException
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.port.out.HostSessionVisibilitySnapshot
import com.readmates.session.domain.PublicSiteVisibility
import com.readmates.session.domain.SessionAccessScope
import com.readmates.session.domain.SessionExposure
import com.readmates.shared.db.dbString
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import com.readmates.shared.security.CurrentMember
import org.springframework.jdbc.core.JdbcTemplate
import java.util.UUID

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
                from sessions
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
                from sessions
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
                from sessions
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
                    from sessions
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
}

internal data class LockedHostSessionExposure(
    val state: String,
    val sessionVisibility: String,
    val exposure: SessionExposure,
)
