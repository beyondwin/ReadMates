package com.readmates.sessionrecord.application.service

import com.readmates.session.application.InvalidHostSessionCursorException
import com.readmates.sessionrecord.application.model.HostSessionHistoryCursor
import com.readmates.sessionrecord.application.model.HostSessionHistoryItem
import com.readmates.sessionrecord.application.model.HostSessionHistoryType
import com.readmates.sessionrecord.application.port.`in`.GetHostSessionHistoryUseCase
import com.readmates.sessionrecord.application.port.out.HostSessionHistoryPort
import com.readmates.shared.paging.CursorCodec
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service
import java.time.OffsetDateTime
import java.util.UUID

@Service
class HostSessionHistoryQueryService(
    private val historyPort: HostSessionHistoryPort,
) : GetHostSessionHistoryUseCase {
    override fun history(
        host: CurrentMember,
        sessionId: UUID,
        pageRequest: PageRequest,
    ): CursorPage<HostSessionHistoryItem> {
        if (!host.isHost) throw AccessDeniedException("Host role required")
        val cursor = pageRequest.cursor.toHistoryCursor(host.clubId, sessionId)
        val sourceLimit = pageRequest.limit + 1
        val rows =
            (
                historyPort.loadAuditHistory(host, sessionId, cursor, sourceLimit) +
                    historyPort.loadRevisionHistory(host, sessionId, cursor, sourceLimit) +
                    historyPort.loadNotificationHistory(host, sessionId, cursor, sourceLimit)
            ).sortedWith(historyComparator)
        val visible = rows.take(pageRequest.limit)
        return CursorPage(
            items = visible,
            nextCursor =
                if (rows.size > pageRequest.limit) {
                    visible.lastOrNull()?.toHistoryCursor(host.clubId, sessionId)
                } else {
                    null
                },
        )
    }
}

private val historyComparator =
    compareByDescending<HostSessionHistoryItem> { it.createdAt }
        .thenByDescending { it.type.typeSort }
        .thenByDescending { it.id.toString() }

internal val HostSessionHistoryType.typeSort: Int
    get() =
        when (this) {
            HostSessionHistoryType.BASIC_INFO_UPDATED -> BASIC_INFO_SORT
            HostSessionHistoryType.ATTENDANCE_UPDATED -> ATTENDANCE_SORT
            HostSessionHistoryType.RECORD_REVISION_APPLIED -> REVISION_APPLIED_SORT
            HostSessionHistoryType.RECORD_REVISION_RESTORED -> REVISION_RESTORED_SORT
            HostSessionHistoryType.NOTIFICATION_SENT -> NOTIFICATION_SENT_SORT
            HostSessionHistoryType.NOTIFICATION_SKIPPED -> NOTIFICATION_SKIPPED_SORT
        }

private fun Map<String, String>.toHistoryCursor(
    expectedClubId: UUID,
    expectedSessionId: UUID,
): HostSessionHistoryCursor? {
    if (isEmpty()) return null
    if (keys != setOf("createdAt", "typeSort", "id", "clubId", "sessionId")) {
        invalidCursor()
    }
    val createdAt =
        get("createdAt")
            ?.let { runCatching { OffsetDateTime.parse(it) }.getOrNull() }
            ?: invalidCursor()
    val typeSort = get("typeSort")?.toIntOrNull() ?: invalidCursor()
    if (typeSort !in HISTORY_TYPE_SORTS) invalidCursor()
    val id =
        get("id")
            ?.let { runCatching { UUID.fromString(it) }.getOrNull() }
            ?: invalidCursor()
    val clubId =
        get("clubId")
            ?.let { runCatching { UUID.fromString(it) }.getOrNull() }
            ?: invalidCursor()
    if (clubId != expectedClubId) invalidCursor()
    val sessionId =
        get("sessionId")
            ?.let { runCatching { UUID.fromString(it) }.getOrNull() }
            ?: invalidCursor()
    if (sessionId != expectedSessionId) invalidCursor()
    return HostSessionHistoryCursor(createdAt, typeSort, id)
}

private fun invalidCursor(): Nothing = throw InvalidHostSessionCursorException()

private fun HostSessionHistoryItem.toHistoryCursor(
    clubId: UUID,
    sessionId: UUID,
): String? =
    CursorCodec.encode(
        mapOf(
            "createdAt" to createdAt.toString(),
            "typeSort" to type.typeSort.toString(),
            "id" to id.toString(),
            "clubId" to clubId.toString(),
            "sessionId" to sessionId.toString(),
        ),
    )

private const val BASIC_INFO_SORT = 10
private const val ATTENDANCE_SORT = 20
private const val REVISION_APPLIED_SORT = 30
private const val REVISION_RESTORED_SORT = 40
private const val NOTIFICATION_SENT_SORT = 50
private const val NOTIFICATION_SKIPPED_SORT = 60
private val HISTORY_TYPE_SORTS =
    setOf(
        BASIC_INFO_SORT,
        ATTENDANCE_SORT,
        REVISION_APPLIED_SORT,
        REVISION_RESTORED_SORT,
        NOTIFICATION_SENT_SORT,
        NOTIFICATION_SKIPPED_SORT,
    )
