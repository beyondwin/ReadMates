package com.readmates.session.adapter.`in`.web

import com.readmates.session.application.SessionRecordVisibility
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.UpdateHostSessionCommand
import com.readmates.session.application.model.UpdateHostSessionVisibilityCommand
import com.readmates.session.application.port.`in`.ManageHostSessionUseCase
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
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

data class HostSessionVisibilityRequest(
    val visibility: SessionRecordVisibility,
) {
    fun toCommand(host: CurrentMember, sessionId: UUID): UpdateHostSessionVisibilityCommand =
        UpdateHostSessionVisibilityCommand(host, sessionId, visibility)
}

@RestController
@RequestMapping("/api/host/sessions")
class HostSessionController(
    private val manageHostSessionUseCase: ManageHostSessionUseCase,
) {
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(
        @Valid @RequestBody request: HostSessionRequest,
        member: CurrentMember,
    ) = manageHostSessionUseCase.create(request.toCommand(member))

    @GetMapping
    fun list(member: CurrentMember) = manageHostSessionUseCase.list(member)

    @GetMapping("/{sessionId}")
    fun detail(
        member: CurrentMember,
        @PathVariable sessionId: String,
    ) = manageHostSessionUseCase.detail(HostSessionIdCommand(member, parseHostSessionId(sessionId)))

    @PatchMapping("/{sessionId}")
    fun update(
        @PathVariable sessionId: String,
        @Valid @RequestBody request: HostSessionRequest,
        member: CurrentMember,
    ) = manageHostSessionUseCase.update(
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
    ) = manageHostSessionUseCase.updateVisibility(request.toCommand(member, parseHostSessionId(sessionId)))

    @PostMapping("/{sessionId}/open")
    fun open(
        member: CurrentMember,
        @PathVariable sessionId: String,
    ) = manageHostSessionUseCase.open(HostSessionIdCommand(member, parseHostSessionId(sessionId)))

    @GetMapping("/{sessionId}/deletion-preview")
    fun deletionPreview(
        member: CurrentMember,
        @PathVariable sessionId: String,
    ) = manageHostSessionUseCase.deletionPreview(HostSessionIdCommand(member, parseHostSessionId(sessionId)))

    @DeleteMapping("/{sessionId}")
    fun delete(
        member: CurrentMember,
        @PathVariable sessionId: String,
    ) = manageHostSessionUseCase.delete(HostSessionIdCommand(member, parseHostSessionId(sessionId)))
}

internal fun parseHostSessionId(sessionId: String): UUID =
    runCatching { UUID.fromString(sessionId) }
        .getOrElse { throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid session id") }
