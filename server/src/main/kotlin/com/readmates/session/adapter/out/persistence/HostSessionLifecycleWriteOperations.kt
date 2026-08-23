package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.OpenSessionAlreadyExistsException
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.port.out.HostSessionTransitionResult
import com.readmates.session.application.requireHost
import com.readmates.shared.db.dbString
import org.springframework.jdbc.core.BatchPreparedStatementSetter
import org.springframework.jdbc.core.JdbcTemplate
import java.sql.PreparedStatement
import java.util.UUID

private const val SESSION_ID_PARAMETER = 3
private const val MEMBERSHIP_ID_PARAMETER = 4

internal class HostSessionLifecycleWriteOperations(
    private val jdbcTemplate: JdbcTemplate,
    private val queries: HostSessionWriteQueries,
    private val policy: HostSessionWritePolicy,
) {
    fun open(command: HostSessionIdCommand): HostSessionTransitionResult {
        requireHost(command.host)
        queries.lockClub(command.host.clubId)
        val state = queries.state(command.host, command.sessionId) ?: throw HostSessionNotFoundException()
        val changed =
            if (policy.openDecision(state) == HostSessionTransitionDecision.UNCHANGED) {
                verifyRevision(command)
                false
            } else {
                openDraft(command)
            }
        return result(command, changed)
    }

    private fun openDraft(command: HostSessionIdCommand): Boolean {
        val clubId = command.host.clubId
        val membershipId = command.host.membershipId
        val sessionId = command.sessionId
        val openSessionId = queries.findOpenSessionId(clubId)
        if (openSessionId != null) throw OpenSessionAlreadyExistsException(openSessionId)
        queries.locks.requireActiveClubAndMembership(clubId, membershipId, hostRequired = true)
        val locked = queries.locks.lockSession(clubId, sessionId) ?: throw HostSessionNotFoundException()
        if (locked.state != "DRAFT") {
            verifyRevision(command)
            policy.openDecision(locked.state)
            return false
        }
        val updated =
            jdbcTemplate.update(
                """
                update sessions
                set state = 'OPEN',
                    access_scope = 'GUEST_READABLE',
                    visibility = case when visibility = 'HOST_ONLY' then 'MEMBER' else visibility end,
                    session_revision = session_revision + 1,
                    participant_set_revision = participant_set_revision + 1,
                    exposure_revision = exposure_revision + 1,
                    updated_at = utc_timestamp(6)
                where id = ?
                  and club_id = ?
                  and deleted_at is null
                  and state = 'DRAFT'
                  and session_revision = ?
                """.trimIndent(),
                command.sessionId.dbString(),
                command.host.clubId.dbString(),
                queries.expectedRevision(command.expectedSessionRevision),
            )
        queries.revisions.throwIfStale(updated, command.host, command.sessionId)
        hidePublicPlacement(command)
        createActiveParticipants(command.host.clubId, command.sessionId)
        return true
    }

    fun close(command: HostSessionIdCommand): HostSessionTransitionResult {
        requireHost(command.host)
        val clubId = command.host.clubId
        val membershipId = command.host.membershipId
        queries.locks.requireActiveClubAndMembership(clubId, membershipId, hostRequired = true)
        val locked = queries.locks.lockSession(clubId, command.sessionId) ?: throw HostSessionNotFoundException()
        verifyCloseExpected(command)
        if (locked.state != "OPEN") {
            verifyRevision(command)
            policy.closeDecision(locked.state)
            return result(command, false)
        }
        val closedRows =
            jdbcTemplate.update(
                """
                update sessions
                set state = 'CLOSED',
                    session_revision = session_revision + 1,
                    updated_at = utc_timestamp(6)
                where id = ?
                  and club_id = ?
                  and deleted_at is null
                  and state = 'OPEN'
                  and session_revision = ?
                """.trimIndent(),
                command.sessionId.dbString(),
                command.host.clubId.dbString(),
                queries.expectedRevision(command.expectedSessionRevision),
            )
        queries.revisions.throwIfStale(closedRows, command.host, command.sessionId)
        return result(command, true)
    }

    fun publish(command: HostSessionIdCommand): HostSessionTransitionResult {
        requireHost(command.host)
        val publishedRows =
            jdbcTemplate.update(
                """
                update sessions
                set state = 'PUBLISHED',
                    session_revision = session_revision + 1,
                    updated_at = utc_timestamp(6)
                where id = ?
                  and club_id = ?
                  and deleted_at is null
                  and state = 'CLOSED'
                  and session_revision = ?
                  and access_scope = 'GUEST_READABLE'
                  and exists (
                    select 1
                    from public_session_publications
                    where public_session_publications.session_id = sessions.id
                      and public_session_publications.club_id = sessions.club_id
                      and public_session_publications.visibility in ('MEMBER', 'PUBLIC')
                      and trim(public_session_publications.public_summary) <> ''
                  )
                """.trimIndent(),
                command.sessionId.dbString(),
                command.host.clubId.dbString(),
                queries.expectedRevision(command.expectedSessionRevision),
            )
        if (publishedRows == 0) {
            verifyRevision(command)
            val state = queries.state(command.host, command.sessionId) ?: throw HostSessionNotFoundException()
            policy.publishDecision(state)
            return result(command, false)
        }
        exposePublicPublication(command)
        return result(command, true)
    }

    private fun verifyCloseExpected(command: HostSessionIdCommand) {
        command.expectedParticipantSetRevision?.let { expected ->
            val current =
                queries.locks.lockParticipantSetRevision(command.host, command.sessionId)
                    ?: throw HostSessionNotFoundException()
            if (current != expected) {
                queries.revisions.throwIfStale(0, command.host, command.sessionId)
            }
        }
        command.expectedAttendanceSnapshotId?.let { expected ->
            if (queries.revisions.attendanceSnapshotId(command.host, command.sessionId) != expected) {
                queries.revisions.throwIfStale(0, command.host, command.sessionId)
            }
        }
    }

    private fun verifyRevision(command: HostSessionIdCommand) {
        val expected = queries.expectedRevision(command.expectedSessionRevision)
        val current =
            queries.locks.sessionRevision(command.host, command.sessionId)
                ?: throw HostSessionNotFoundException()
        if (current != expected) {
            queries.revisions.throwIfStale(0, command.host, command.sessionId)
        }
    }

    private fun hidePublicPlacement(command: HostSessionIdCommand) {
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

    private fun exposePublicPublication(command: HostSessionIdCommand) {
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

    private fun createActiveParticipants(
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

    private fun result(
        command: HostSessionIdCommand,
        changed: Boolean,
    ) = HostSessionTransitionResult(
        detail = queries.detail(command.host, command.sessionId),
        changed = changed,
    )
}
