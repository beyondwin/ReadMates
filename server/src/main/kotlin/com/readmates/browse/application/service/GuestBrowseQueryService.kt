package com.readmates.browse.application.service

import com.readmates.browse.application.GuestBrowseInvalidCursorException
import com.readmates.browse.application.GuestBrowseInvalidLimitException
import com.readmates.browse.application.model.GuestArchiveDetailResult
import com.readmates.browse.application.model.GuestArchiveSessionResult
import com.readmates.browse.application.model.GuestBrowseShellResult
import com.readmates.browse.application.model.GuestCurrentSessionResult
import com.readmates.browse.application.model.GuestCursorPage
import com.readmates.browse.application.model.GuestNoteFeedCursor
import com.readmates.browse.application.model.GuestNoteFeedResult
import com.readmates.browse.application.model.GuestNoteSessionResult
import com.readmates.browse.application.model.GuestRecordCursor
import com.readmates.browse.application.model.GuestUpcomingSessionCursor
import com.readmates.browse.application.model.GuestUpcomingSessionResult
import com.readmates.browse.application.port.`in`.GetGuestArchiveDetailUseCase
import com.readmates.browse.application.port.`in`.GetGuestBrowseShellUseCase
import com.readmates.browse.application.port.`in`.GetGuestCurrentSessionUseCase
import com.readmates.browse.application.port.`in`.ListGuestArchiveSessionsUseCase
import com.readmates.browse.application.port.`in`.ListGuestNoteSessionsUseCase
import com.readmates.browse.application.port.`in`.ListGuestNotesFeedUseCase
import com.readmates.browse.application.port.`in`.ListGuestUpcomingSessionsUseCase
import com.readmates.browse.application.port.out.LoadGuestRecordBrowsePort
import com.readmates.browse.application.port.out.LoadGuestSessionBrowsePort
import com.readmates.shared.architecture.ReadOnlyApplicationService
import com.readmates.shared.paging.CursorCodec
import org.springframework.stereotype.Service
import java.time.LocalDate
import java.time.LocalTime
import java.time.OffsetDateTime
import java.util.UUID

@ReadOnlyApplicationService
@Service
@Suppress("TooManyFunctions")
class GuestBrowseQueryService(
    private val loadGuestSessionBrowsePort: LoadGuestSessionBrowsePort,
    private val loadGuestRecordBrowsePort: LoadGuestRecordBrowsePort,
) : GetGuestBrowseShellUseCase,
    GetGuestCurrentSessionUseCase,
    ListGuestUpcomingSessionsUseCase,
    ListGuestNoteSessionsUseCase,
    ListGuestNotesFeedUseCase,
    ListGuestArchiveSessionsUseCase,
    GetGuestArchiveDetailUseCase {
    override fun getShell(clubSlug: String): GuestBrowseShellResult? = loadGuestSessionBrowsePort.loadShell(clubSlug)

    override fun getCurrentSession(clubSlug: String): GuestCurrentSessionResult? {
        if (loadGuestSessionBrowsePort.loadShell(clubSlug) == null) return null
        return loadGuestSessionBrowsePort.loadCurrentSession(clubSlug)
    }

    override fun listUpcomingSessions(
        clubSlug: String,
        requestedLimit: Int?,
        rawCursor: String?,
    ): GuestCursorPage<GuestUpcomingSessionResult>? {
        if (loadGuestSessionBrowsePort.loadShell(clubSlug) == null) return null
        if (requestedLimit != null && requestedLimit > MAX_LIMIT) throw GuestBrowseInvalidLimitException()
        val pageLimit = (requestedLimit ?: DEFAULT_LIMIT).coerceIn(1, MAX_LIMIT)
        val cursor = parseCursor(clubSlug, rawCursor)
        val rows = loadGuestSessionBrowsePort.loadUpcomingSessions(clubSlug, cursor, pageLimit + 1)
        val visibleRows = rows.take(pageLimit)
        return GuestCursorPage(
            items = visibleRows,
            nextCursor =
                if (rows.size > pageLimit) {
                    visibleRows.lastOrNull()?.toCursor(clubSlug)
                } else {
                    null
                },
        )
    }

    override fun listNoteSessions(
        clubSlug: String,
        requestedLimit: Int?,
        rawCursor: String?,
    ): GuestCursorPage<GuestNoteSessionResult>? =
        listRecordPage(clubSlug, requestedLimit, rawCursor, loadGuestRecordBrowsePort::loadNoteSessions) { item ->
            recordCursor(clubSlug, item.sessionNumber, item.sessionId)
        }

    override fun listArchiveSessions(
        clubSlug: String,
        requestedLimit: Int?,
        rawCursor: String?,
    ): GuestCursorPage<GuestArchiveSessionResult>? =
        listRecordPage(clubSlug, requestedLimit, rawCursor, loadGuestRecordBrowsePort::loadArchiveSessions) { item ->
            recordCursor(clubSlug, item.sessionNumber, item.sessionId)
        }

    override fun listNotesFeed(
        clubSlug: String,
        sessionId: String?,
        requestedLimit: Int?,
        rawCursor: String?,
    ): GuestCursorPage<GuestNoteFeedResult>? {
        if (loadGuestSessionBrowsePort.loadShell(clubSlug) == null) return null
        val normalizedSessionId = normalizeOptionalSessionId(sessionId)
        val pageLimit = validatedLimit(requestedLimit)
        val cursor = parseNoteFeedCursor(clubSlug, normalizedSessionId, rawCursor)
        val rows = loadGuestRecordBrowsePort.loadNotesFeed(clubSlug, normalizedSessionId, cursor, pageLimit + 1)
        val visibleRows = rows.take(pageLimit)
        return GuestCursorPage(
            items = visibleRows,
            nextCursor =
                if (rows.size > pageLimit) {
                    visibleRows.lastOrNull()?.let { item ->
                        CursorCodec.encode(
                            mapOf(
                                "clubSlug" to clubSlug,
                                "feedSessionId" to normalizedSessionId.orEmpty(),
                                "sessionNumber" to item.sessionNumber.toString(),
                                "createdAt" to item.createdAt,
                                "sourceOrder" to item.sourceOrder.toString(),
                                "itemOrder" to item.itemOrder.toString(),
                                "itemId" to item.itemId,
                            ),
                        )
                    }
                } else {
                    null
                },
        )
    }

    override fun getArchiveDetail(
        clubSlug: String,
        sessionId: String,
    ): GuestArchiveDetailResult? {
        if (loadGuestSessionBrowsePort.loadShell(clubSlug) == null) return null
        if (runCatching { UUID.fromString(sessionId) }.isFailure) invalidCursor()
        return loadGuestRecordBrowsePort.loadArchiveDetail(clubSlug, sessionId)
    }

    private fun <T> listRecordPage(
        clubSlug: String,
        requestedLimit: Int?,
        rawCursor: String?,
        loader: (String, GuestRecordCursor?, Int) -> List<T>,
        cursorEncoder: (T) -> String?,
    ): GuestCursorPage<T>? {
        if (loadGuestSessionBrowsePort.loadShell(clubSlug) == null) return null
        val pageLimit = validatedLimit(requestedLimit)
        val rows = loader(clubSlug, parseRecordCursor(clubSlug, rawCursor), pageLimit + 1)
        val visibleRows = rows.take(pageLimit)
        return GuestCursorPage(
            items = visibleRows,
            nextCursor = if (rows.size > pageLimit) visibleRows.lastOrNull()?.let(cursorEncoder) else null,
        )
    }

    private fun validatedLimit(requestedLimit: Int?): Int {
        if (requestedLimit != null && requestedLimit > MAX_LIMIT) throw GuestBrowseInvalidLimitException()
        return (requestedLimit ?: DEFAULT_LIMIT).coerceIn(1, MAX_LIMIT)
    }

    private fun parseRecordCursor(
        clubSlug: String,
        rawCursor: String?,
    ): GuestRecordCursor? {
        if (rawCursor == null) return null
        val values = decodeCursor(rawCursor)
        if (values.keys != RECORD_CURSOR_KEYS || values["clubSlug"] != clubSlug) invalidCursor()
        val sessionNumber = values["sessionNumber"]?.toIntOrNull()?.takeIf { it > 0 } ?: invalidCursor()
        val sessionId = values["sessionId"]?.takeIf { runCatching { UUID.fromString(it) }.isSuccess } ?: invalidCursor()
        return GuestRecordCursor(sessionNumber, sessionId)
    }

    private fun parseNoteFeedCursor(
        clubSlug: String,
        sessionId: String?,
        rawCursor: String?,
    ): GuestNoteFeedCursor? {
        if (rawCursor == null) return null
        val values = decodeCursor(rawCursor)
        if (
            values.keys != NOTE_FEED_CURSOR_KEYS ||
            values["clubSlug"] != clubSlug ||
            values["feedSessionId"] != sessionId.orEmpty()
        ) {
            invalidCursor()
        }
        val sessionNumber = values["sessionNumber"]?.toIntOrNull()?.takeIf { it > 0 } ?: invalidCursor()
        val createdAt =
            values["createdAt"]?.takeIf { runCatching { OffsetDateTime.parse(it) }.isSuccess }
                ?: invalidCursor()
        val sourceOrder = values["sourceOrder"]?.toIntOrNull() ?: invalidCursor()
        val itemOrder = values["itemOrder"]?.toIntOrNull() ?: invalidCursor()
        val itemId = values["itemId"]?.takeIf { runCatching { UUID.fromString(it) }.isSuccess } ?: invalidCursor()
        return GuestNoteFeedCursor(sessionNumber, createdAt, sourceOrder, itemOrder, itemId)
    }

    private fun normalizeOptionalSessionId(sessionId: String?): String? =
        sessionId?.let { value ->
            runCatching { UUID.fromString(value).toString() }
                .getOrElse { invalidCursor() }
        }

    private fun decodeCursor(rawCursor: String): Map<String, String> =
        runCatching { CursorCodec.decodeStrict(rawCursor) }
            .getOrElse { invalidCursor() }
            ?: invalidCursor()

    private fun recordCursor(
        clubSlug: String,
        sessionNumber: Int,
        sessionId: String,
    ): String? =
        CursorCodec.encode(
            mapOf(
                "clubSlug" to clubSlug,
                "sessionNumber" to sessionNumber.toString(),
                "sessionId" to sessionId,
            ),
        )

    private fun parseCursor(
        clubSlug: String,
        rawCursor: String?,
    ): GuestUpcomingSessionCursor? {
        if (rawCursor == null) return null
        val values =
            runCatching { CursorCodec.decodeStrict(rawCursor) }
                .getOrElse { invalidCursor() }
                ?: invalidCursor()
        if (values.keys != CURSOR_KEYS || values["clubSlug"] != clubSlug) {
            invalidCursor()
        }
        val date = values["date"]?.takeIf { runCatching { LocalDate.parse(it) }.isSuccess }
        val startTime = values["startTime"]?.takeIf { runCatching { LocalTime.parse(it) }.isSuccess }
        val sessionId = values["sessionId"]?.takeIf { runCatching { UUID.fromString(it) }.isSuccess }
        if (date == null || startTime == null || sessionId == null) {
            invalidCursor()
        }
        return GuestUpcomingSessionCursor(date = date, startTime = startTime, sessionId = sessionId)
    }

    private fun invalidCursor(): Nothing = throw GuestBrowseInvalidCursorException()

    private fun GuestUpcomingSessionResult.toCursor(clubSlug: String): String? =
        CursorCodec.encode(
            mapOf(
                "clubSlug" to clubSlug,
                "date" to date,
                "startTime" to startTime,
                "sessionId" to sessionId,
            ),
        )

    private companion object {
        const val DEFAULT_LIMIT = 20
        const val MAX_LIMIT = 50
        val CURSOR_KEYS = setOf("clubSlug", "date", "startTime", "sessionId")
        val RECORD_CURSOR_KEYS = setOf("clubSlug", "sessionNumber", "sessionId")
        val NOTE_FEED_CURSOR_KEYS =
            setOf("clubSlug", "feedSessionId", "sessionNumber", "createdAt", "sourceOrder", "itemOrder", "itemId")
    }
}
