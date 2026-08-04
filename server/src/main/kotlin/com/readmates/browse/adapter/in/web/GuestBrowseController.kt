@file:Suppress("ktlint:standard:package-name")

package com.readmates.browse.adapter.`in`.web

import com.readmates.browse.application.GuestBrowseInvalidRequestException
import com.readmates.browse.application.port.`in`.GetGuestArchiveDetailUseCase
import com.readmates.browse.application.port.`in`.GetGuestBrowseShellUseCase
import com.readmates.browse.application.port.`in`.GetGuestCurrentSessionUseCase
import com.readmates.browse.application.port.`in`.ListGuestArchiveSessionsUseCase
import com.readmates.browse.application.port.`in`.ListGuestNoteSessionsUseCase
import com.readmates.browse.application.port.`in`.ListGuestNotesFeedUseCase
import com.readmates.browse.application.port.`in`.ListGuestUpcomingSessionsUseCase
import com.readmates.shared.adapter.`in`.web.ApiErrorResponse
import com.readmates.shared.adapter.`in`.web.apiErrorResponse
import com.readmates.shared.adapter.`in`.web.defaultApiErrorCode
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException
import org.springframework.web.server.ResponseStatusException

@Suppress("TooManyFunctions")
@RestController
@RequestMapping("/api/public/clubs/{clubSlug}/browse")
class GuestBrowseController(
    private val getGuestBrowseShellUseCase: GetGuestBrowseShellUseCase,
    private val getGuestCurrentSessionUseCase: GetGuestCurrentSessionUseCase,
    private val listGuestUpcomingSessionsUseCase: ListGuestUpcomingSessionsUseCase,
    private val listGuestNoteSessionsUseCase: ListGuestNoteSessionsUseCase,
    private val listGuestNotesFeedUseCase: ListGuestNotesFeedUseCase,
    private val listGuestArchiveSessionsUseCase: ListGuestArchiveSessionsUseCase,
    private val getGuestArchiveDetailUseCase: GetGuestArchiveDetailUseCase,
) {
    @GetMapping
    fun shell(
        @PathVariable clubSlug: String,
    ): ResponseEntity<GuestBrowseShellResponse> =
        getGuestBrowseShellUseCase.getShell(clubSlug)?.toResponse()?.let(::noStore)
            ?: notFound()

    @GetMapping("/sessions/current")
    fun currentSession(
        @PathVariable clubSlug: String,
    ): ResponseEntity<GuestCurrentSessionResponse> =
        getGuestCurrentSessionUseCase.getCurrentSession(clubSlug)?.toResponse()?.let(::noStore)
            ?: getGuestBrowseShellUseCase.getShell(clubSlug)?.let {
                noStore(GuestCurrentSessionResponse(currentSession = null))
            }
            ?: notFound()

    @GetMapping("/sessions/upcoming")
    fun upcomingSessions(
        @PathVariable clubSlug: String,
        @RequestParam(required = false) limit: Int?,
        @RequestParam(required = false) cursor: String?,
    ): ResponseEntity<GuestCursorPageResponse<GuestUpcomingSessionResponse>> {
        val page =
            try {
                listGuestUpcomingSessionsUseCase.listUpcomingSessions(clubSlug, limit, cursor)
            } catch (_: GuestBrowseInvalidRequestException) {
                throw ResponseStatusException(HttpStatus.BAD_REQUEST)
            }
        return page?.toResponse()?.let(::noStore) ?: notFound()
    }

    @GetMapping("/notes/sessions")
    fun noteSessions(
        @PathVariable clubSlug: String,
        @RequestParam(required = false) limit: Int?,
        @RequestParam(required = false) cursor: String?,
    ): ResponseEntity<GuestCursorPageResponse<GuestNoteSessionResponse>> =
        paged { listGuestNoteSessionsUseCase.listNoteSessions(clubSlug, limit, cursor)?.toNoteSessionsResponse() }

    @GetMapping("/notes/feed")
    fun notesFeed(
        @PathVariable clubSlug: String,
        @RequestParam(required = false) sessionId: String?,
        @RequestParam(required = false) limit: Int?,
        @RequestParam(required = false) cursor: String?,
    ): ResponseEntity<GuestCursorPageResponse<GuestNoteFeedItemResponse>> =
        paged { listGuestNotesFeedUseCase.listNotesFeed(clubSlug, sessionId, limit, cursor)?.toNotesFeedResponse() }

    @GetMapping("/archive")
    fun archive(
        @PathVariable clubSlug: String,
        @RequestParam(required = false) limit: Int?,
        @RequestParam(required = false) cursor: String?,
    ): ResponseEntity<GuestCursorPageResponse<GuestArchiveSessionResponse>> =
        paged { listGuestArchiveSessionsUseCase.listArchiveSessions(clubSlug, limit, cursor)?.toArchiveResponse() }

    @GetMapping("/archive/{sessionId}")
    fun archiveDetail(
        @PathVariable clubSlug: String,
        @PathVariable sessionId: String,
    ): ResponseEntity<GuestArchiveDetailResponse> {
        val detail =
            try {
                getGuestArchiveDetailUseCase.getArchiveDetail(clubSlug, sessionId)
            } catch (_: GuestBrowseInvalidRequestException) {
                throw ResponseStatusException(HttpStatus.BAD_REQUEST)
            }
        return detail?.toResponse()?.let(::noStore) ?: notFound()
    }

    private fun <T : Any> paged(load: () -> T?): ResponseEntity<T> {
        val body =
            try {
                load()
            } catch (_: GuestBrowseInvalidRequestException) {
                throw ResponseStatusException(HttpStatus.BAD_REQUEST)
            }
        return body?.let(::noStore) ?: notFound()
    }

    private fun <T : Any> noStore(body: T): ResponseEntity<T> =
        ResponseEntity
            .ok()
            .header(HttpHeaders.CACHE_CONTROL, "no-store")
            .body(body)

    @ExceptionHandler(ResponseStatusException::class)
    fun handleGuestBrowseError(error: ResponseStatusException): ResponseEntity<ApiErrorResponse> {
        val status = HttpStatus.resolve(error.statusCode.value()) ?: HttpStatus.INTERNAL_SERVER_ERROR
        val body = apiErrorResponse(status, status.defaultApiErrorCode()).body
        return ResponseEntity
            .status(status)
            .header(HttpHeaders.CACHE_CONTROL, "no-store")
            .body(body)
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException::class)
    fun handleGuestBrowseBindingError(): ResponseEntity<ApiErrorResponse> {
        val status = HttpStatus.BAD_REQUEST
        return ResponseEntity
            .status(status)
            .header(HttpHeaders.CACHE_CONTROL, "no-store")
            .body(apiErrorResponse(status, status.defaultApiErrorCode()).body)
    }

    private fun notFound(): Nothing = throw ResponseStatusException(HttpStatus.NOT_FOUND)
}
