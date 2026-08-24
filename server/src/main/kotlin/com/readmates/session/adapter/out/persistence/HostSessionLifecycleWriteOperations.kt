package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.port.out.HostSessionTransitionResult
import com.readmates.session.application.requireHost
import com.readmates.shared.db.dbString
import org.springframework.jdbc.core.JdbcTemplate

internal class HostSessionLifecycleWriteOperations(
    private val jdbcTemplate: JdbcTemplate,
    private val queries: HostSessionWriteQueries,
    private val policy: HostSessionWritePolicy,
    private val publicProjection: HostPublicProjectionWriteOperations,
) {
    private val effects = HostSessionLifecycleEffects(jdbcTemplate, queries, publicProjection)

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
        return effects.result(command, changed, rotatePublicProjection = true)
    }

    private fun openDraft(command: HostSessionIdCommand): Boolean {
        val openSessionId = queries.findOpenSessionId(command.host.clubId)
        queries.denyExistingOpenSession(openSessionId)
        queries.requireActiveClubAndMembership(command.host.clubId, command.host.membershipId, hostRequired = true)
        val locked = queries.lockSession(command.host.clubId, command.sessionId) ?: throw HostSessionNotFoundException()
        val changed =
            if (locked.state != "DRAFT") {
                verifyRevision(command)
                policy.openDecision(locked.state)
                false
            } else {
                transitionDraftToOpen(command)
                true
            }
        return changed
    }

    private fun transitionDraftToOpen(command: HostSessionIdCommand) {
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
        queries.throwIfStale(updated, command.host, command.sessionId)
        effects.hidePublicPlacement(command)
        effects.createActiveParticipants(command.host.clubId, command.sessionId)
    }

    fun close(command: HostSessionIdCommand): HostSessionTransitionResult {
        requireHost(command.host)
        queries.requireActiveClubAndMembership(command.host.clubId, command.host.membershipId, hostRequired = true)
        val locked = queries.lockSession(command.host.clubId, command.sessionId) ?: throw HostSessionNotFoundException()
        verifyCloseExpected(command)
        if (locked.state != "OPEN") {
            verifyRevision(command)
            policy.closeDecision(locked.state)
            return effects.result(command, false)
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
        queries.throwIfStale(closedRows, command.host, command.sessionId)
        return effects.result(command, true)
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
            return effects.result(command, false)
        }
        effects.exposePublicPublication(command)
        return effects.result(command, true, rotatePublicProjection = true)
    }

    fun reopen(command: HostSessionIdCommand): HostSessionTransitionResult {
        requireHost(command.host)
        queries.lockClub(command.host.clubId)
        val state = queries.state(command.host, command.sessionId) ?: throw HostSessionNotFoundException()
        if (reopenDecision(state) == HostSessionTransitionDecision.UNCHANGED) {
            verifyRevision(command)
            return effects.result(command, false)
        }
        return effects.result(command, reopenClosedSession(command), rotatePublicProjection = true)
    }

    fun unpublish(command: HostSessionIdCommand): HostSessionTransitionResult {
        requireHost(command.host)
        val unpublishedRows =
            jdbcTemplate.update(
                """
                update sessions
                set state = 'CLOSED',
                    session_revision = session_revision + 1,
                    updated_at = utc_timestamp(6)
                where id = ?
                  and club_id = ?
                  and deleted_at is null
                  and state = 'PUBLISHED'
                  and session_revision = ?
                """.trimIndent(),
                command.sessionId.dbString(),
                command.host.clubId.dbString(),
                queries.expectedRevision(command.expectedSessionRevision),
            )
        if (unpublishedRows > 0) return effects.result(command, true, rotatePublicProjection = true)
        verifyRevision(command)
        val state = queries.state(command.host, command.sessionId) ?: throw HostSessionNotFoundException()
        unpublishDecision(state)
        return effects.result(command, false)
    }

    fun returnToDraft(command: HostSessionIdCommand): HostSessionTransitionResult {
        requireHost(command.host)
        queries.lockClub(command.host.clubId)
        val returnedRows =
            jdbcTemplate.update(
                """
                update sessions
                set state = 'DRAFT',
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
        if (returnedRows > 0) return effects.result(command, true)
        verifyRevision(command)
        val state = queries.state(command.host, command.sessionId) ?: throw HostSessionNotFoundException()
        returnToDraftDecision(state)
        return effects.result(command, false)
    }

    private fun reopenClosedSession(command: HostSessionIdCommand): Boolean {
        queries.denyOtherOpenSession(queries.findOpenSessionId(command.host.clubId), command.sessionId)
        val reopenedRows =
            jdbcTemplate.update(
                """
                update sessions
                set state = 'OPEN',
                    session_revision = session_revision + 1,
                    updated_at = utc_timestamp(6)
                where id = ?
                  and club_id = ?
                  and deleted_at is null
                  and state = 'CLOSED'
                  and session_revision = ?
                """.trimIndent(),
                command.sessionId.dbString(),
                command.host.clubId.dbString(),
                queries.expectedRevision(command.expectedSessionRevision),
            )
        if (reopenedRows > 0) {
            effects.hidePublicPlacement(command)
            return true
        }
        queries.throwIfStale(0, command.host, command.sessionId)
        val latest = queries.state(command.host, command.sessionId) ?: throw HostSessionNotFoundException()
        reopenDecision(latest)
        return false
    }

    private fun verifyCloseExpected(command: HostSessionIdCommand) {
        command.expectedParticipantSetRevision?.let { expected ->
            val current =
                queries.lockParticipantSetRevision(command.host, command.sessionId)
                    ?: throw HostSessionNotFoundException()
            if (current != expected) {
                queries.throwIfStale(0, command.host, command.sessionId)
            }
        }
        command.expectedAttendanceSnapshotId?.let { expected ->
            if (queries.attendanceSnapshotId(command.host, command.sessionId) != expected) {
                queries.throwIfStale(0, command.host, command.sessionId)
            }
        }
    }

    private fun verifyRevision(command: HostSessionIdCommand) {
        val expected = queries.expectedRevision(command.expectedSessionRevision)
        val current = queries.sessionRevision(command.host, command.sessionId) ?: throw HostSessionNotFoundException()
        if (current != expected) {
            queries.throwIfStale(0, command.host, command.sessionId)
        }
    }
}
