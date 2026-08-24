package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostAttendanceResponse
import com.readmates.session.application.HostSessionParticipantNotFoundException
import com.readmates.session.application.InvalidSessionScheduleException
import com.readmates.session.application.model.ActualAttendanceStatus
import com.readmates.session.application.model.AttendanceEntryCommand
import com.readmates.session.application.model.ConfirmAttendanceCommand
import com.readmates.session.application.model.UpdateParticipantAttendanceCommand
import com.readmates.shared.db.dbString
import com.readmates.shared.security.CurrentMember
import org.springframework.jdbc.core.BatchPreparedStatementSetter
import org.springframework.jdbc.core.JdbcTemplate
import java.sql.PreparedStatement
import java.util.UUID

private const val CLUB_ID_PARAMETER = 3
private const val MEMBERSHIP_ID_PARAMETER = 4
private const val EXPECTED_REVISION_PARAMETER = 5

internal class HostSessionAttendanceWriteOperations(
    private val jdbcTemplate: JdbcTemplate,
    private val queries: HostSessionWriteQueries,
    private val policy: HostSessionWritePolicy,
) {
    fun confirm(command: ConfirmAttendanceCommand): HostAttendanceResponse {
        queries.requireHostSession(command.host, command.sessionId)
        val rows = parsedRows(command.entries)
        if (rows.isEmpty()) {
            throw InvalidSessionScheduleException()
        }
        val participantSetRevision =
            queries.locks.lockParticipantSetRevision(command.host, command.sessionId)
                ?: throwConflict(command.host, command.sessionId)
        if (rows.size > 1) {
            val expectedSetRevision =
                command.expectedParticipantSetRevision ?: throw InvalidSessionScheduleException()
            if (participantSetRevision != expectedSetRevision) {
                throwConflict(command.host, command.sessionId)
            }
        }
        val ordered = rows.sortedBy { it.membershipId.toString() }
        val locked = queries.locks.lockAttendanceRows(command.host, command.sessionId, ordered.map { it.membershipId })
        validateLocked(command.host, command.sessionId, ordered, locked)
        writeRows(command.host, command.sessionId, ordered)
        return HostAttendanceResponse(
            sessionId = command.sessionId.toString(),
            count = rows.size,
        )
    }

    private fun parsedRows(entries: List<AttendanceEntryCommand>): List<UpdateParticipantAttendanceCommand> {
        val rows =
            entries.map { entry ->
                UpdateParticipantAttendanceCommand(
                    membershipId = policy.membershipId(entry.membershipId),
                    status = parseStatus(entry.attendanceStatus),
                    expectedAttendanceRevision = entry.expectedAttendanceRevision,
                    expectedCurrentStatus = entry.expectedCurrentStatus?.let(::parseStatus),
                )
            }
        if (rows.map { it.membershipId }.distinct().size != rows.size) {
            throw InvalidSessionScheduleException()
        }
        return rows
    }

    private fun parseStatus(value: String): ActualAttendanceStatus =
        runCatching { ActualAttendanceStatus.valueOf(value) }
            .getOrElse { throw InvalidSessionScheduleException() }

    private fun validateLocked(
        host: CurrentMember,
        sessionId: UUID,
        rows: List<UpdateParticipantAttendanceCommand>,
        locked: Map<UUID, LockedAttendanceRow>,
    ) {
        rows.forEach { row ->
            val current = locked[row.membershipId] ?: throwConflict(host, sessionId)
            if (current.participationStatus != "ACTIVE") {
                throwConflict(host, sessionId)
            }
            val expectedStatus = row.expectedCurrentStatus?.name ?: current.attendanceStatus
            val actualHash =
                attendanceRowHash(current.membershipId, current.attendanceStatus, current.attendanceRevision)
            val expectedHash =
                attendanceRowHash(row.membershipId, expectedStatus, row.expectedAttendanceRevision)
            if (actualHash != expectedHash) {
                throwConflict(host, sessionId)
            }
        }
    }

    private fun writeRows(
        host: CurrentMember,
        sessionId: UUID,
        rows: List<UpdateParticipantAttendanceCommand>,
    ) {
        val updated =
            jdbcTemplate.batchUpdate(
                """
                update session_participants
                set attendance_status = ?,
                    attendance_revision = attendance_revision + 1,
                    updated_at = utc_timestamp(6)
                where session_id = ?
                  and club_id = ?
                  and membership_id = ?
                  and participation_status = 'ACTIVE'
                  and attendance_revision = ?
                """.trimIndent(),
                object : BatchPreparedStatementSetter {
                    override fun setValues(
                        preparedStatement: PreparedStatement,
                        index: Int,
                    ) {
                        val row = rows[index]
                        preparedStatement.setString(1, row.status.name)
                        preparedStatement.setString(2, sessionId.dbString())
                        preparedStatement.setString(CLUB_ID_PARAMETER, host.clubId.dbString())
                        preparedStatement.setString(MEMBERSHIP_ID_PARAMETER, row.membershipId.dbString())
                        preparedStatement.setLong(EXPECTED_REVISION_PARAMETER, row.expectedAttendanceRevision)
                    }

                    override fun getBatchSize(): Int = rows.size
                },
            )
        if (updated.any { count -> count == 0 }) {
            throwConflict(host, sessionId)
        }
    }

    private fun throwConflict(
        host: CurrentMember,
        sessionId: UUID,
    ): Nothing = throw queries.revisions.revisionConflict(host, sessionId) ?: HostSessionParticipantNotFoundException()
}

private fun attendanceRowHash(
    membershipId: UUID,
    attendanceStatus: String,
    attendanceRevision: Long,
) = "$membershipId:$attendanceStatus:$attendanceRevision"
