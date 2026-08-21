package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostAttendanceAuditTransition
import com.readmates.session.application.HostSessionBasicAuditSnapshot
import com.readmates.session.application.model.HostSessionChangeKind
import com.readmates.session.application.model.HostSessionChangeReceipt
import com.readmates.session.application.port.out.HostSessionAuditPort
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcOffsetDateTime
import com.readmates.shared.security.CurrentMember
import org.slf4j.MDC
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import tools.jackson.databind.ObjectMapper
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID

@Repository
class JdbcHostSessionAuditAdapter(
    private val jdbcTemplate: JdbcTemplate,
    private val objectMapper: ObjectMapper,
) : HostSessionAuditPort {
    override fun loadBasicSnapshot(
        host: CurrentMember,
        sessionId: UUID,
    ): HostSessionBasicAuditSnapshot? =
        jdbcTemplate
            .query(
                """
                select title, book_title, book_author, book_link, book_image_url,
                       session_date, start_time, end_time, question_deadline_at,
                       location_label, meeting_url, meeting_passcode
                from sessions
                where club_id = ? and id = ?
                """.trimIndent(),
                { rs, _ ->
                    HostSessionBasicAuditSnapshot(
                        title = rs.getString("title"),
                        bookTitle = rs.getString("book_title"),
                        bookAuthor = rs.getString("book_author"),
                        bookLink = rs.getString("book_link"),
                        bookImageUrl = rs.getString("book_image_url"),
                        date = rs.getObject("session_date", LocalDate::class.java).toString(),
                        startTime = rs.getObject("start_time", LocalTime::class.java).toString(),
                        endTime = rs.getObject("end_time", LocalTime::class.java).toString(),
                        questionDeadlineAt =
                            rs
                                .getTimestamp("question_deadline_at")
                                .toLocalDateTime()
                                .toUtcOffsetDateTime()
                                .toString(),
                        locationLabel = rs.getString("location_label"),
                        meetingUrl = rs.getString("meeting_url"),
                        meetingPasscode = rs.getString("meeting_passcode"),
                    )
                },
                host.clubId.dbString(),
                sessionId.dbString(),
            ).firstOrNull()

    override fun loadAttendanceStates(
        host: CurrentMember,
        sessionId: UUID,
        membershipIds: Set<UUID>,
    ): Map<UUID, String> {
        if (membershipIds.isEmpty()) return emptyMap()
        val placeholders = membershipIds.joinToString(",") { "?" }
        val arguments =
            listOf(host.clubId.dbString(), sessionId.dbString()) +
                membershipIds.map(UUID::dbString)
        return jdbcTemplate
            .query(
                """
                select membership_id, attendance_status
                from session_participants
                where club_id = ?
                  and session_id = ?
                  and participation_status = 'ACTIVE'
                  and membership_id in ($placeholders)
                """.trimIndent(),
                { rs, _ -> UUID.fromString(rs.getString("membership_id")) to rs.getString("attendance_status") },
                *arguments.toTypedArray(),
            ).toMap()
    }

    override fun recordBasicUpdate(
        host: CurrentMember,
        sessionId: UUID,
        before: HostSessionBasicAuditSnapshot,
        after: HostSessionBasicAuditSnapshot,
        changedFields: Set<String>,
        restoredFromChangeId: UUID?,
    ): HostSessionChangeReceipt =
        insertAudit(
            host = host,
            sessionId = sessionId,
            actionType = "BASIC_INFO_UPDATED",
            kind = HostSessionChangeKind.BASIC_INFO,
            changedFieldsJson = objectMapper.writeValueAsString(changedFields.sorted()),
            beforeSnapshotJson = objectMapper.writeValueAsString(before),
            afterSnapshotJson = objectMapper.writeValueAsString(after),
            restoredFromChangeId = restoredFromChangeId,
        )

    override fun recordAttendanceUpdate(
        host: CurrentMember,
        sessionId: UUID,
        transitions: List<HostAttendanceAuditTransition>,
        restoredFromChangeId: UUID?,
    ): HostSessionChangeReceipt {
        val sortedTransitions = transitions.sortedWith(compareBy(HostAttendanceAuditTransition::membershipId))
        val snapshotJson = objectMapper.writeValueAsString(sortedTransitions)
        return insertAudit(
            host = host,
            sessionId = sessionId,
            actionType = "ATTENDANCE_UPDATED",
            kind = HostSessionChangeKind.ATTENDANCE,
            changedFieldsJson = objectMapper.writeValueAsString(sortedTransitions),
            beforeSnapshotJson = snapshotJson,
            afterSnapshotJson = snapshotJson,
            restoredFromChangeId = restoredFromChangeId,
        )
    }

    private fun insertAudit(
        host: CurrentMember,
        sessionId: UUID,
        actionType: String,
        kind: HostSessionChangeKind,
        changedFieldsJson: String,
        beforeSnapshotJson: String,
        afterSnapshotJson: String,
        restoredFromChangeId: UUID?,
    ): HostSessionChangeReceipt {
        val changeId = UUID.randomUUID()
        jdbcTemplate.update(
            """
            insert into host_session_change_audit (
              id, club_id, session_id, actor_membership_id,
              action_type, changed_fields_json, before_snapshot_json, after_snapshot_json,
              restored_from_change_id, request_id
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            changeId.dbString(),
            host.clubId.dbString(),
            sessionId.dbString(),
            host.membershipId.dbString(),
            actionType,
            changedFieldsJson,
            beforeSnapshotJson,
            afterSnapshotJson,
            restoredFromChangeId?.dbString(),
            MDC.get("requestId")?.takeIf(String::isNotBlank),
        )
        return HostSessionChangeReceipt(
            changeId = changeId,
            kind = kind,
            undoAvailable = true,
        )
    }
}
