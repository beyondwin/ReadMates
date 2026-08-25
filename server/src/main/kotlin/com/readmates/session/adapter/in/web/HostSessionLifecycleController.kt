@file:Suppress("ktlint:standard:package-name")

package com.readmates.session.adapter.`in`.web

import com.readmates.session.application.model.ExpectedSessionRevision
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
import tools.jackson.databind.JsonNode

@RestController
@RequestMapping("/api/host/sessions")
@Suppress("TooManyFunctions")
class HostSessionLifecycleController(
    private val hostSessionLifecycleUseCase: HostSessionLifecycleUseCase,
    private val envelopes: HostMutationEnvelopeReader,
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
        @RequestBody body: JsonNode,
        member: CurrentMember,
    ): Any {
        val envelope = envelopes.access(body)
        val sessionIdValue = parseHostSessionId(sessionId)
        return hostSessionLifecycleUseCase.updateVisibility(
            envelope.command.toCommand(member, sessionIdValue).copy(
                expectedExposureRevision = envelope.expected.exposureRevision,
                idempotencyKey = envelope.idempotencyKey,
            ),
        )
    }

    @PostMapping("/{sessionId}/open")
    fun open(
        member: CurrentMember,
        @PathVariable sessionId: String,
        @RequestBody body: JsonNode,
    ) = hostSessionLifecycleUseCase.open(sessionCommand(member, sessionId, envelopes.sessionRevision(body)))

    @PostMapping("/{sessionId}/close")
    fun close(
        member: CurrentMember,
        @PathVariable sessionId: String,
        @RequestBody body: JsonNode,
    ): Any {
        val envelope = envelopes.close(body)
        return hostSessionLifecycleUseCase.close(
            HostSessionIdCommand(
                host = member,
                sessionId = parseHostSessionId(sessionId),
                expectedSessionRevision =
                    envelope.expected.sessionRevision?.let(::ExpectedSessionRevision),
                expectedParticipantSetRevision = envelope.expected.participantSetRevision,
                expectedAttendanceSnapshotId = envelope.expected.attendanceSnapshotId,
                idempotencyKey = envelope.idempotencyKey,
            ),
        )
    }

    @PostMapping("/{sessionId}/publish")
    fun publish(
        member: CurrentMember,
        @PathVariable sessionId: String,
        @RequestBody body: JsonNode,
    ) = if (body.has("idempotencyKey")) {
        val envelope = envelopes.publishVector(body)
        val expected = envelope.expected.toExpected()
        hostSessionLifecycleUseCase.publish(
            HostSessionIdCommand(
                host = member,
                sessionId = parseHostSessionId(sessionId),
                expectedSessionRevision = ExpectedSessionRevision(expected.sessionRevision),
                expectedPublishVector = expected,
                idempotencyKey = envelope.idempotencyKey,
            ),
        )
    } else {
        hostSessionLifecycleUseCase.publish(sessionCommand(member, sessionId, envelopes.sessionRevision(body)))
    }

    @PostMapping("/{sessionId}/correction-publish")
    fun correctionPublish(
        member: CurrentMember,
        @PathVariable sessionId: String,
        @RequestBody body: JsonNode,
    ): Any {
        val envelope = envelopes.correctionPublishVector(body)
        val expected = envelope.expected.toExpected()
        return hostSessionLifecycleUseCase.correctionPublish(
            HostSessionIdCommand(
                host = member,
                sessionId = parseHostSessionId(sessionId),
                expectedSessionRevision = ExpectedSessionRevision(expected.sessionRevision),
                expectedCorrectionVector = expected,
                idempotencyKey = envelope.idempotencyKey,
            ),
        )
    }

    @GetMapping("/{sessionId}/correction-publish-preview")
    fun correctionPublishPreview(
        member: CurrentMember,
        @PathVariable sessionId: String,
    ) = hostSessionLifecycleUseCase.correctionPublishPreview(
        HostSessionIdCommand(member, parseHostSessionId(sessionId)),
    )

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

    @GetMapping("/{sessionId}/deletion-preview")
    fun deletionPreview(
        member: CurrentMember,
        @PathVariable sessionId: String,
    ) = hostSessionLifecycleUseCase.deletionPreview(HostSessionIdCommand(member, parseHostSessionId(sessionId)))

    @DeleteMapping("/{sessionId}")
    fun delete(
        member: CurrentMember,
        @PathVariable sessionId: String,
        @RequestBody body: JsonNode,
    ) = hostSessionLifecycleUseCase.delete(sessionCommand(member, sessionId, envelopes.sessionRevision(body)))

    private fun sessionCommand(
        member: CurrentMember,
        sessionId: String,
        envelope: com.readmates.session.application.model.HostMutationEnvelope<Unit, ExpectedSessionOnlyBody>,
    ) = HostSessionIdCommand(
        host = member,
        sessionId = parseHostSessionId(sessionId),
        expectedSessionRevision = ExpectedSessionRevision(envelope.expected.toExpected().sessionRevision),
        idempotencyKey = envelope.idempotencyKey,
    )

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

data class HostSessionReverseRequest(
    val reasonCode: String? = null,
    val reasonNote: String? = null,
    val expectedSessionRevision: Long? = null,
)
