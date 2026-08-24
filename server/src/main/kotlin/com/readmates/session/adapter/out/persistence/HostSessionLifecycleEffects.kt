package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.port.out.HostSessionTransitionResult
import com.readmates.shared.db.dbString
import org.springframework.jdbc.core.BatchPreparedStatementSetter
import org.springframework.jdbc.core.JdbcTemplate
import java.sql.PreparedStatement
import java.util.UUID

private const val SESSION_ID_PARAMETER = 3
private const val MEMBERSHIP_ID_PARAMETER = 4

internal class HostSessionLifecycleEffects(
    private val jdbcTemplate: JdbcTemplate,
    private val queries: HostSessionWriteQueries,
    private val publicProjection: HostPublicProjectionWriteOperations,
) {
    fun hidePublicPlacement(command: HostSessionIdCommand) {
        jdbcTemplate.update(
            """
            update public_session_publications
            set site_visibility = 'HIDDEN',
                visibility = 'MEMBER',
                is_public = false,
                updated_at = utc_timestamp(6)
            where session_id = ?
              and club_id = ?
              and site_visibility = 'PUBLIC_RECORD'
            """.trimIndent(),
            command.sessionId.dbString(),
            command.host.clubId.dbString(),
        )
        jdbcTemplate.update(
            """
            update sessions
            set visibility = case when visibility = 'PUBLIC' then 'MEMBER' else visibility end,
                updated_at = utc_timestamp(6)
            where id = ?
              and club_id = ?
              and deleted_at is null
            """.trimIndent(),
            command.sessionId.dbString(),
            command.host.clubId.dbString(),
        )
    }

    fun exposePublicPublication(command: HostSessionIdCommand) {
        jdbcTemplate.update(
            """
            update public_session_publications
            set is_public = true,
                site_visibility = 'PUBLIC_RECORD',
                published_at = coalesce(published_at, utc_timestamp(6)),
                updated_at = utc_timestamp(6)
            where session_id = ?
              and club_id = ?
              and visibility = 'PUBLIC'
            """.trimIndent(),
            command.sessionId.dbString(),
            command.host.clubId.dbString(),
        )
    }

    fun createActiveParticipants(
        clubId: UUID,
        sessionId: UUID,
    ) {
        val activeMembershipIds = queries.activeMembershipIds(clubId)
        if (activeMembershipIds.isEmpty()) return
        jdbcTemplate.batchUpdate(
            """
            insert into session_participants (
              id, club_id, session_id, membership_id,
              rsvp_status, attendance_status, participation_status
            )
            values (?, ?, ?, ?, 'NO_RESPONSE', 'UNKNOWN', 'ACTIVE')
            on duplicate key update
              participation_status = values(participation_status),
              updated_at = utc_timestamp(6)
            """.trimIndent(),
            object : BatchPreparedStatementSetter {
                override fun setValues(
                    preparedStatement: PreparedStatement,
                    index: Int,
                ) {
                    preparedStatement.setString(1, UUID.randomUUID().dbString())
                    preparedStatement.setString(2, clubId.dbString())
                    preparedStatement.setString(SESSION_ID_PARAMETER, sessionId.dbString())
                    preparedStatement.setString(MEMBERSHIP_ID_PARAMETER, activeMembershipIds[index].dbString())
                }

                override fun getBatchSize(): Int = activeMembershipIds.size
            },
        )
    }

    fun result(
        command: HostSessionIdCommand,
        changed: Boolean,
        rotatePublicProjection: Boolean = false,
    ) = HostSessionTransitionResult(
        detail = queries.detail(command.host, command.sessionId),
        changed = changed,
        publicProjectionEffect =
            if (changed && rotatePublicProjection) {
                publicProjection.rotate(command.host.clubId, command.sessionId)
            } else {
                null
            },
    )
}
