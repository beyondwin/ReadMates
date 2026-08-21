@file:Suppress("ktlint:standard:package-name")

package com.readmates.session.adapter.`in`.web

import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.HostSessionLifecycleReasonCode
import com.readmates.session.application.model.HostSessionReverseCommand
import com.readmates.session.application.model.InvalidHostSessionLifecycleReasonException
import com.readmates.session.application.model.USER_SELECTABLE_LIFECYCLE_REASONS
import com.readmates.session.application.port.`in`.HostSessionLifecycleUseCase
import com.readmates.shared.security.CurrentMember
import jakarta.validation.Valid
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api/host/sessions")
class HostSessionLifecycleController(
    private val hostSessionLifecycleUseCase: HostSessionLifecycleUseCase,
) {
    @PatchMapping("/{sessionId}/visibility")
    fun visibility(
        @PathVariable sessionId: String,
        @Valid @RequestBody request: HostSessionVisibilityRequest,
        member: CurrentMember,
    ) = hostSessionLifecycleUseCase.updateVisibility(request.toCommand(member, parseHostSessionId(sessionId)))

    @PatchMapping("/{sessionId}/access-scope")
    fun accessScope(
        @PathVariable sessionId: String,
        @Valid @RequestBody request: HostSessionAccessScopeRequest,
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

    @PostMapping("/{sessionId}/reopen")
    fun reopen(
        member: CurrentMember,
        @PathVariable sessionId: String,
        @RequestBody(required = false) request: HostSessionReverseRequest?,
    ) = hostSessionLifecycleUseCase.reopen(request.toCommand(member, parseHostSessionId(sessionId)))

    @PostMapping("/{sessionId}/unpublish")
    fun unpublish(
        member: CurrentMember,
        @PathVariable sessionId: String,
        @RequestBody(required = false) request: HostSessionReverseRequest?,
    ) = hostSessionLifecycleUseCase.unpublish(request.toCommand(member, parseHostSessionId(sessionId)))

    @PostMapping("/{sessionId}/return-to-draft")
    fun returnToDraft(
        member: CurrentMember,
        @PathVariable sessionId: String,
        @RequestBody(required = false) request: HostSessionReverseRequest?,
    ) = hostSessionLifecycleUseCase.returnToDraft(request.toCommand(member, parseHostSessionId(sessionId)))

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

data class HostSessionReverseRequest(
    val reasonCode: String? = null,
    val reasonNote: String? = null,
)

private fun HostSessionReverseRequest?.toCommand(
    host: CurrentMember,
    sessionId: UUID,
): HostSessionReverseCommand {
    val parsed =
        this?.reasonCode?.let { raw ->
            runCatching { HostSessionLifecycleReasonCode.valueOf(raw) }
                .getOrElse { throw InvalidHostSessionLifecycleReasonException() }
                .takeIf(USER_SELECTABLE_LIFECYCLE_REASONS::contains)
                ?: throw InvalidHostSessionLifecycleReasonException()
        }
    return HostSessionReverseCommand(host, sessionId, parsed, this?.reasonNote)
}
