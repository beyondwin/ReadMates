package com.readmates.browse.application.service

import com.readmates.browse.application.GuestBrowseInvalidCursorException
import com.readmates.browse.application.model.GuestBrowseShellResult
import com.readmates.browse.application.model.GuestCurrentSessionResult
import com.readmates.browse.application.model.GuestCursorPage
import com.readmates.browse.application.model.GuestUpcomingSessionCursor
import com.readmates.browse.application.model.GuestUpcomingSessionResult
import com.readmates.browse.application.port.`in`.GetGuestBrowseShellUseCase
import com.readmates.browse.application.port.`in`.GetGuestCurrentSessionUseCase
import com.readmates.browse.application.port.`in`.ListGuestUpcomingSessionsUseCase
import com.readmates.browse.application.port.out.LoadGuestSessionBrowsePort
import com.readmates.shared.architecture.ReadOnlyApplicationService
import com.readmates.shared.paging.CursorCodec
import org.springframework.stereotype.Service
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID

@ReadOnlyApplicationService
@Service
class GuestBrowseQueryService(
    private val loadGuestSessionBrowsePort: LoadGuestSessionBrowsePort,
) : GetGuestBrowseShellUseCase,
    GetGuestCurrentSessionUseCase,
    ListGuestUpcomingSessionsUseCase {
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
    }
}
