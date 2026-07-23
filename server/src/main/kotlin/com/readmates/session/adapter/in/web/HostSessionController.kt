package com.readmates.session.adapter.`in`.web

import com.readmates.session.application.HostSessionListQuery
import com.readmates.session.application.InvalidHostSessionCursorException
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.UpdateHostSessionCommand
import com.readmates.session.application.model.UpdateHostSessionVisibilityCommand
import com.readmates.session.application.port.`in`.HostSessionDraftUseCase
import com.readmates.session.application.port.`in`.HostSessionLifecycleUseCase
import com.readmates.session.application.port.`in`.HostSessionQueryUseCase
import com.readmates.sessionrecord.application.model.SessionRecordStatus
import com.readmates.shared.paging.CursorCodec
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
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

@RestController
@RequestMapping("/api/host/sessions")
class HostSessionController(
    private val hostSessionLifecycleUseCase: HostSessionLifecycleUseCase,
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

    @PatchMapping("/{sessionId}/visibility")
    fun visibility(
        @PathVariable sessionId: String,
        @Valid @RequestBody request: HostSessionVisibilityRequest,
        member: CurrentMember,
    ) = hostSessionLifecycleUseCase.updateVisibility(request.toCommand(member, parseHostSessionId(sessionId)))

    @PostMapping("/{sessionId}/open")
    fun open(
        member: CurrentMember,
        @PathVariable sessionId: String,
    ) = hostSessionLifecycleUseCase.open(HostSessionIdCommand(member, parseHostSessionId(sessionId)))

    @PostMapping("/{sessionId}/close")
    fun close(
        member: CurrentMember,
        @PathVariable sessionId: String,
    ) = hostSessionLifecycleUseCase.close(HostSessionIdCommand(member, parseHostSessionId(sessionId)))

    @PostMapping("/{sessionId}/publish")
    fun publish(
        member: CurrentMember,
        @PathVariable sessionId: String,
    ) = hostSessionLifecycleUseCase.publish(HostSessionIdCommand(member, parseHostSessionId(sessionId)))

    @GetMapping("/{sessionId}/deletion-preview")
    fun deletionPreview(
        member: CurrentMember,
        @PathVariable sessionId: String,
    ) = hostSessionLifecycleUseCase.deletionPreview(HostSessionIdCommand(member, parseHostSessionId(sessionId)))

    @DeleteMapping("/{sessionId}")
    fun delete(
        member: CurrentMember,
        @PathVariable sessionId: String,
    ) = hostSessionLifecycleUseCase.delete(HostSessionIdCommand(member, parseHostSessionId(sessionId)))
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
