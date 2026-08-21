package com.readmates.session.adapter.`in`.web

import com.readmates.session.application.HostSessionListQuery
import com.readmates.session.application.InvalidHostSessionCursorException
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.UpdateHostSessionCommand
import com.readmates.session.application.model.UpdateHostSessionVisibilityCommand
import com.readmates.session.application.port.`in`.HostSessionDraftUseCase
import com.readmates.session.application.port.`in`.HostSessionQueryUseCase
import com.readmates.session.domain.SessionAccessScope
import com.readmates.sessionrecord.application.model.SessionRecordStatus
import com.readmates.sessionrecord.application.model.SessionRecordVisibility
import com.readmates.shared.paging.CursorCodec
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

data class HostSessionVisibilityRequest(
    val visibility: SessionRecordVisibility,
    val previewId: String? = null,
    val notificationDecision: String? = null,
) {
    fun toCommand(
        host: CurrentMember,
        sessionId: UUID,
    ): UpdateHostSessionVisibilityCommand {
        if (previewId != null || notificationDecision != null) {
            throw ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Legacy notification decision contract is not accepted",
            )
        }
        return UpdateHostSessionVisibilityCommand(
            host = host,
            sessionId = sessionId,
            visibility = visibility,
        )
    }
}

data class HostSessionAccessScopeRequest(
    val accessScope: SessionAccessScope,
) {
    fun toCommand(
        host: CurrentMember,
        sessionId: UUID,
    ) = UpdateHostSessionVisibilityCommand(host = host, sessionId = sessionId, accessScope = accessScope)
}

@RestController
@RequestMapping("/api/host/sessions")
class HostSessionController(
    private val hostSessionQueryUseCase: HostSessionQueryUseCase,
    private val hostSessionDraftUseCase: HostSessionDraftUseCase,
) {
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(
        @Valid @RequestBody request: HostSessionRequest,
        member: CurrentMember,
    ) = hostSessionDraftUseCase.create(request.toCommand(member))

    @GetMapping
    fun list(
        member: CurrentMember,
        @RequestParam(required = false) limit: Int?,
        @RequestParam(required = false) cursor: String?,
        @RequestParam(required = false) search: String?,
        @RequestParam(required = false) state: String?,
        @RequestParam(required = false) recordStatus: SessionRecordStatus?,
        @RequestParam(required = false) needsAttention: Boolean?,
    ) = hostSessionQueryUseCase.list(
        member,
        PageRequest.cursor(limit, requireValidCursor(cursor), defaultLimit = 50, maxLimit = 100),
        HostSessionListQuery(search, state, recordStatus, needsAttention),
    )

    @GetMapping("/schedule-defaults")
    fun scheduleDefaults(member: CurrentMember) =
        HostSessionScheduleDefaultsResponse.from(hostSessionQueryUseCase.scheduleDefaults(member))

    @GetMapping("/{sessionId}")
    fun detail(
        member: CurrentMember,
        @PathVariable sessionId: String,
    ) = hostSessionQueryUseCase.detail(HostSessionIdCommand(member, parseHostSessionId(sessionId)))

    @PatchMapping("/{sessionId}")
    fun update(
        @PathVariable sessionId: String,
        @Valid @RequestBody request: HostSessionRequest,
        member: CurrentMember,
    ) = hostSessionDraftUseCase.update(
        UpdateHostSessionCommand(
            host = member,
            sessionId = parseHostSessionId(sessionId),
            session = request.toCommand(member),
        ),
    )
}

private fun requireValidCursor(cursor: String?): String? {
    try {
        CursorCodec.decodeStrict(cursor)
    } catch (_: IllegalArgumentException) {
        throw InvalidHostSessionCursorException()
    }
    return cursor
}

internal fun parseHostSessionId(sessionId: String): UUID =
    runCatching { UUID.fromString(sessionId) }
        .getOrElse { throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid session id") }
