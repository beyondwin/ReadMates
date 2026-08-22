package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostAttendanceResponse
import com.readmates.session.application.HostSessionParticipantNotFoundException
import com.readmates.session.application.model.ConfirmAttendanceCommand
import com.readmates.shared.db.dbString
import org.springframework.jdbc.core.BatchPreparedStatementSetter
import org.springframework.jdbc.core.JdbcTemplate
import java.sql.PreparedStatement

private const val CLUB_ID_PARAMETER = 3
private const val MEMBERSHIP_ID_PARAMETER = 4

internal class HostSessionAttendanceWriteOperations(
    private val jdbcTemplate: JdbcTemplate,
    private val queries: HostSessionWriteQueries,
    private val policy: HostSessionWritePolicy,
) {
    fun confirm(command: ConfirmAttendanceCommand): HostAttendanceResponse {
        queries.lockClub(command.host.clubId)
        queries.requireHostSession(command.host, command.sessionId)
        val entries =
            command.entries.map { entry ->
                policy.membershipId(entry.membershipId) to entry.attendanceStatus
            }
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
                  and (? is null or attendance_revision = ?)
                """.trimIndent(),
                object : BatchPreparedStatementSetter {
                    override fun setValues(
                        preparedStatement: PreparedStatement,
                        index: Int,
                    ) {
                        val (membershipId, attendanceStatus) = entries[index]
                        val expectedRevision = command.entries[index].expectedAttendanceRevision
                        preparedStatement.setString(1, attendanceStatus)
                        preparedStatement.setString(2, command.sessionId.dbString())
                        preparedStatement.setString(CLUB_ID_PARAMETER, command.host.clubId.dbString())
                        preparedStatement.setString(MEMBERSHIP_ID_PARAMETER, membershipId.dbString())
                        if (expectedRevision == null) {
                            preparedStatement.setObject(5, null)
                            preparedStatement.setObject(6, null)
                        } else {
                            preparedStatement.setLong(5, expectedRevision)
                            preparedStatement.setLong(6, expectedRevision)
                        }
                    }

                    override fun getBatchSize(): Int = entries.size
                },
            )
        if (updated.any { count -> count == 0 }) {
            if (command.entries.any { entry -> entry.expectedAttendanceRevision != null }) {
                throw queries.revisionConflict(command.host, command.sessionId)
                    ?: HostSessionParticipantNotFoundException()
            }
            throw HostSessionParticipantNotFoundException()
        }
        return HostAttendanceResponse(
            sessionId = command.sessionId.toString(),
            count = command.entries.size,
        )
    }
}
