@file:Suppress("ktlint:standard:package-name")

package com.readmates.session.adapter.`in`.web

import com.readmates.session.application.model.ExpectedSessionRevision
import com.readmates.session.application.model.HostSessionLifecycleReasonCode
import com.readmates.session.application.model.HostSessionReverseCommand
import com.readmates.session.application.model.InvalidHostSessionLifecycleReasonException
import com.readmates.session.application.model.USER_SELECTABLE_LIFECYCLE_REASONS
import com.readmates.session.application.port.`in`.HostSessionLifecycleUseCase
import com.readmates.shared.security.CurrentMember
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode

@RestController
@RequestMapping("/api/host/sessions")
class HostSessionReverseLifecycleController(
    private val hostSessionLifecycleUseCase: HostSessionLifecycleUseCase,
    private val envelopes: HostMutationEnvelopeReader,
) {
    @PostMapping("/{sessionId}/reopen")
    fun reopen(
        member: CurrentMember,
        @PathVariable sessionId: String,
        @RequestBody body: JsonNode,
    ) = hostSessionLifecycleUseCase.reopen(reverseCommand(member, sessionId, body))

    @PostMapping("/{sessionId}/unpublish")
    fun unpublish(
        member: CurrentMember,
        @PathVariable sessionId: String,
        @RequestBody body: JsonNode,
    ) = hostSessionLifecycleUseCase.unpublish(reverseCommand(member, sessionId, body))

    @PostMapping("/{sessionId}/return-to-draft")
    fun returnToDraft(
        member: CurrentMember,
        @PathVariable sessionId: String,
        @RequestBody body: JsonNode,
    ) = hostSessionLifecycleUseCase.returnToDraft(reverseCommand(member, sessionId, body))

    private fun reverseCommand(
        member: CurrentMember,
        sessionId: String,
        body: JsonNode,
    ): HostSessionReverseCommand {
        val envelope = envelopes.reverse(body)
        val parsed =
            envelope.command.reasonCode?.let { raw ->
                runCatching { HostSessionLifecycleReasonCode.valueOf(raw) }
                    .getOrElse { throw InvalidHostSessionLifecycleReasonException() }
                    .takeIf(USER_SELECTABLE_LIFECYCLE_REASONS::contains)
                    ?: throw InvalidHostSessionLifecycleReasonException()
            }
        return HostSessionReverseCommand(
            host = member,
            sessionId = parseHostSessionId(sessionId),
            reasonCode = parsed,
            reasonNote = envelope.command.reasonNote,
            expectedSessionRevision = ExpectedSessionRevision(envelope.expected.toExpected().sessionRevision),
            idempotencyKey = envelope.idempotencyKey,
        )
    }
}
