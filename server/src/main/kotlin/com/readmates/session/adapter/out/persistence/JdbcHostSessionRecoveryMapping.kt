package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostAttendanceAuditTransition
import com.readmates.session.application.HostSessionBasicAuditSnapshot
import com.readmates.session.application.model.HostSessionChangeKind
import com.readmates.session.application.port.out.HostSessionRecoverableChange
import com.readmates.shared.db.toUtcOffsetDateTime
import tools.jackson.core.type.TypeReference
import tools.jackson.databind.ObjectMapper
import java.sql.ResultSet
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID

internal fun ResultSet.toHostSessionBasicSnapshot() =
    HostSessionBasicAuditSnapshot(
        title = getString("title"),
        bookTitle = getString("book_title"),
        bookAuthor = getString("book_author"),
        bookLink = getString("book_link"),
        bookImageUrl = getString("book_image_url"),
        date = getObject("session_date", LocalDate::class.java).toString(),
        startTime = getObject("start_time", LocalTime::class.java).toString(),
        endTime = getObject("end_time", LocalTime::class.java).toString(),
        questionDeadlineAt =
            getTimestamp("question_deadline_at")
                .toLocalDateTime()
                .toUtcOffsetDateTime()
                .toString(),
        locationLabel = getString("location_label"),
        meetingUrl = getString("meeting_url"),
        meetingPasscode = getString("meeting_passcode"),
    )

internal fun ResultSet.toRecoverableChange(objectMapper: ObjectMapper): HostSessionRecoverableChange {
    val actionType = getString("action_type")
    val beforeJson = getString("before_snapshot_json")
    val afterJson = getString("after_snapshot_json")
    val changedJson = getString("changed_fields_json")
    val completeSnapshots = !beforeJson.isNullOrBlank() && !afterJson.isNullOrBlank()
    return if (actionType == "ATTENDANCE_UPDATED") {
        HostSessionRecoverableChange(
            changeId = UUID.fromString(getString("id")),
            sessionId = UUID.fromString(getString("session_id")),
            kind = HostSessionChangeKind.ATTENDANCE,
            changedFields = emptyList(),
            before = null,
            after = null,
            transitions =
                if (completeSnapshots) {
                    objectMapper.readAttendanceTransitions(beforeJson)
                } else {
                    emptyList()
                },
            alreadyRestored = false,
            completeSnapshots = completeSnapshots,
        )
    } else {
        HostSessionRecoverableChange(
            changeId = UUID.fromString(getString("id")),
            sessionId = UUID.fromString(getString("session_id")),
            kind = HostSessionChangeKind.BASIC_INFO,
            changedFields = objectMapper.readChangedFields(changedJson),
            before = objectMapper.readBasicSnapshot(beforeJson),
            after = objectMapper.readBasicSnapshot(afterJson),
            transitions = emptyList(),
            alreadyRestored = false,
            completeSnapshots = completeSnapshots,
        )
    }
}

private fun ObjectMapper.readChangedFields(json: String?): List<String> =
    json?.let { runCatching { readValue(it, object : TypeReference<List<String>>() {}) }.getOrNull() }.orEmpty()

private fun ObjectMapper.readBasicSnapshot(json: String?): HostSessionBasicAuditSnapshot? =
    json?.let { runCatching { readValue(it, HostSessionBasicAuditSnapshot::class.java) }.getOrNull() }

private fun ObjectMapper.readAttendanceTransitions(json: String?): List<HostAttendanceAuditTransition> =
    json
        ?.let {
            runCatching { readValue(it, object : TypeReference<List<HostAttendanceAuditTransition>>() {}) }.getOrNull()
        }.orEmpty()
