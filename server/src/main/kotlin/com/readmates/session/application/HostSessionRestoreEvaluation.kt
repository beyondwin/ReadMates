package com.readmates.session.application

import com.readmates.session.application.model.AttendanceEntryCommand
import com.readmates.session.application.model.ConfirmAttendanceCommand
import com.readmates.session.application.model.HostSessionChangeKind
import com.readmates.session.application.model.HostSessionCommand
import com.readmates.session.application.model.HostSessionRestoreItem
import com.readmates.session.application.model.UpdateHostSessionCommand
import com.readmates.session.application.port.out.HostSessionRecoverableChange
import com.readmates.session.application.port.out.HostSessionRestoreCurrentState
import com.readmates.shared.security.CurrentMember
import java.util.UUID

internal const val RESTORE_BLOCKED_SNAPSHOT = "SNAPSHOT_UNAVAILABLE"
internal const val RESTORE_BLOCKED_ALREADY_RESTORED = "ALREADY_RESTORED"
internal const val RESTORE_BLOCKED_PARTICIPANT = "PARTICIPANT_NOT_ACTIVE"

private val SENSITIVE_FIELDS = setOf("meetingUrl", "meetingPasscode")

internal data class HostSessionRestoreEvaluation(
    val canRestore: Boolean,
    val blockedReason: String?,
    val items: List<HostSessionRestoreItem>,
    val hashValues: Map<String, String?>,
)

@Suppress("MaxLineLength")
internal fun HostSessionRecoverableChange.evaluate(current: HostSessionRestoreCurrentState): HostSessionRestoreEvaluation {
    val blocked = blockedReason(current)
    return HostSessionRestoreEvaluation(
        canRestore = blocked == null,
        blockedReason = blocked,
        items = restoreItems(current).map { it.redacted() },
        hashValues = hashValues(current),
    )
}

internal fun HostSessionRecoverableChange.transitionMembershipIds(): Set<UUID> =
    transitions.mapNotNull { runCatching { UUID.fromString(it.membershipId) }.getOrNull() }.toSet()

internal fun HostSessionRecoverableChange.toUpdateCommand(
    host: CurrentMember,
    current: HostSessionBasicAuditSnapshot,
): UpdateHostSessionCommand {
    val before = requireNotNull(this.before)

    fun required(
        field: String,
        value: String,
    ) = if (field in changedFields) before.valueOf(field) ?: value else value

    fun optional(
        field: String,
        value: String?,
    ) = if (field in changedFields) before.valueOf(field) ?: "" else value

    return UpdateHostSessionCommand(
        host = host,
        sessionId = sessionId,
        session =
            HostSessionCommand(
                host = host,
                title = required("title", current.title),
                bookTitle = required("bookTitle", current.bookTitle),
                bookAuthor = required("bookAuthor", current.bookAuthor),
                bookLink = optional("bookLink", current.bookLink),
                bookImageUrl = optional("bookImageUrl", current.bookImageUrl),
                date = required("date", current.date),
                startTime = optional("startTime", current.startTime),
                endTime = optional("endTime", current.endTime),
                questionDeadlineAt = optional("questionDeadlineAt", current.questionDeadlineAt),
                locationLabel = optional("locationLabel", current.locationLabel),
                meetingUrl = optional("meetingUrl", current.meetingUrl),
                meetingPasscode = optional("meetingPasscode", current.meetingPasscode),
            ),
    )
}

internal fun HostSessionRecoverableChange.toAttendanceCommand(host: CurrentMember): ConfirmAttendanceCommand =
    ConfirmAttendanceCommand(
        host = host,
        sessionId = sessionId,
        entries =
            transitions
                .sortedBy { it.membershipId }
                .map { AttendanceEntryCommand(it.membershipId, it.from) },
    )

@Suppress("MaxLineLength")
internal fun HostSessionRecoverableChange.restoreAttendanceTransitions(current: Map<UUID, String>): List<HostAttendanceAuditTransition> =
    transitions
        .sortedBy { it.membershipId }
        .mapNotNull { transition ->
            val membershipId =
                runCatching { UUID.fromString(transition.membershipId) }.getOrNull() ?: return@mapNotNull null
            HostAttendanceAuditTransition(
                membershipId = transition.membershipId,
                from = current[membershipId] ?: return@mapNotNull null,
                to = transition.from,
            )
        }

private fun HostSessionRecoverableChange.blockedReason(current: HostSessionRestoreCurrentState): String? {
    val missingAttendance = transitionMembershipIds().any { it !in current.attendance }
    return when {
        alreadyRestored -> RESTORE_BLOCKED_ALREADY_RESTORED
        !completeSnapshots -> RESTORE_BLOCKED_SNAPSHOT
        kind == HostSessionChangeKind.BASIC_INFO && (before == null || after == null || changedFields.isEmpty()) ->
            RESTORE_BLOCKED_SNAPSHOT
        kind == HostSessionChangeKind.ATTENDANCE && transitions.isEmpty() -> RESTORE_BLOCKED_SNAPSHOT
        kind == HostSessionChangeKind.ATTENDANCE && missingAttendance -> RESTORE_BLOCKED_PARTICIPANT
        kind != HostSessionChangeKind.BASIC_INFO && kind != HostSessionChangeKind.ATTENDANCE -> RESTORE_BLOCKED_SNAPSHOT
        else -> null
    }
}

private fun HostSessionRecoverableChange.hashValues(current: HostSessionRestoreCurrentState): Map<String, String?> =
    if (kind == HostSessionChangeKind.ATTENDANCE) {
        transitions
            .mapNotNull { transition ->
                val membershipId =
                    runCatching { UUID.fromString(transition.membershipId) }.getOrNull() ?: return@mapNotNull null
                membershipId.toString() to current.attendance[membershipId]
            }.toMap()
    } else {
        changedFields.associateWith { field -> current.basic?.valueOf(field) }
    }

@Suppress("MaxLineLength")
private fun HostSessionRecoverableChange.restoreItems(current: HostSessionRestoreCurrentState): List<HostSessionRestoreItem> =
    if (kind == HostSessionChangeKind.ATTENDANCE) {
        transitions
            .sortedBy { it.membershipId }
            .map { transition ->
                val membershipId = runCatching { UUID.fromString(transition.membershipId) }.getOrNull()
                HostSessionRestoreItem(
                    field = "attendanceStatus",
                    subjectId = membershipId,
                    currentValue = membershipId?.let { current.attendance[it] },
                    targetValue = transition.from,
                )
            }
    } else {
        changedFields.map { field ->
            HostSessionRestoreItem(
                field = field,
                currentValue = current.basic?.valueOf(field),
                targetValue = before?.valueOf(field),
            )
        }
    }

private fun HostSessionRestoreItem.redacted(): HostSessionRestoreItem =
    if (field in SENSITIVE_FIELDS) copy(currentValue = null, targetValue = null, sensitive = true) else this

internal fun HostSessionBasicAuditSnapshot.valueOf(field: String): String? =
    when (field) {
        "title" -> title
        "bookTitle" -> bookTitle
        "bookAuthor" -> bookAuthor
        "bookLink" -> bookLink
        "bookImageUrl" -> bookImageUrl
        "date" -> date
        "startTime" -> startTime
        "endTime" -> endTime
        "questionDeadlineAt" -> questionDeadlineAt
        "locationLabel" -> locationLabel
        "meetingUrl" -> meetingUrl
        "meetingPasscode" -> meetingPasscode
        else -> null
    }
