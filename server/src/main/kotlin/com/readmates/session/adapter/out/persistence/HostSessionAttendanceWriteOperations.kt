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
        val participantSetRevision = lockSession(command.host, command.sessionId)
        if (rows.size > 1) {
            val expectedSetRevision =
                command.expectedParticipantSetRevision ?: throw InvalidSessionScheduleException()
            if (participantSetRevision != expectedSetRevision) {
                throwConflict(command.host, command.sessionId)
            }
        }
        val ordered = rows.sortedBy { it.membershipId.toString() }
        val locked = lockRows(command.host, command.sessionId, ordered.map { it.membershipId })
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

    private fun lockSession(
        host: CurrentMember,
        sessionId: UUID,
    ): Long =
        jdbcTemplate
            .query(
                """
                select participant_set_revision
                from sessions
                where id = ?
                  and club_id = ?
                  and deleted_at is null
                for update
                """.trimIndent(),
                { resultSet, _ -> resultSet.getLong("participant_set_revision") },
                sessionId.dbString(),
                host.clubId.dbString(),
            ).firstOrNull() ?: throwConflict(host, sessionId)

    private fun lockRows(
        host: CurrentMember,
        sessionId: UUID,
        membershipIds: List<UUID>,
    ): Map<UUID, LockedAttendanceRow> {
        val ordered = membershipIds.distinct().sortedBy { it.toString() }
        return ordered
            .mapNotNull { membershipId ->
                jdbcTemplate
                    .query(
                        """
                        select membership_id, attendance_status, rsvp_status, attendance_revision, participation_status
                        from session_participants
                        where session_id = ?
                          and club_id = ?
                          and membership_id = ?
                        for update
                        """.trimIndent(),
                        { resultSet, _ ->
                            LockedAttendanceRow(
                                membershipId = membershipId,
                                attendanceStatus = resultSet.getString("attendance_status"),
                                rsvpStatus = resultSet.getString("rsvp_status"),
                                attendanceRevision = resultSet.getLong("attendance_revision"),
                                participationStatus = resultSet.getString("participation_status"),
                            )
                        },
                        sessionId.dbString(),
                        host.clubId.dbString(),
                        membershipId.dbString(),
                    ).firstOrNull()
            }.associateBy { it.membershipId }
    }

    private fun validateLocked(
        host: CurrentMember,
        sessionId: UUID,
        rows: List<UpdateParticipantAttendanceCommand>,
        locked: Map<UUID, LockedAttendanceRow>,
    ) {
        rows.forEach { row ->
            val current = locked[row.membershipId] ?: throwConflict(host, sessionId)
            val rowHash =
                "${current.membershipId}:${current.attendanceStatus}:" +
                    "${current.attendanceRevision}:${current.rsvpStatus}"
            if (rowHash.isBlank() ||
                current.participationStatus != "ACTIVE" ||
                current.attendanceRevision != row.expectedAttendanceRevision
            ) {
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
    ): Nothing = throw queries.revisionConflict(host, sessionId) ?: HostSessionParticipantNotFoundException()
}

private data class LockedAttendanceRow(
    val membershipId: UUID,
    val attendanceStatus: String,
    val rsvpStatus: String,
    val attendanceRevision: Long,
    val participationStatus: String,
)
