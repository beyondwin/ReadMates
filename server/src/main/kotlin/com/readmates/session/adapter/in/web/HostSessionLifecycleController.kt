@file:Suppress("ktlint:standard:package-name")

package com.readmates.session.adapter.`in`.web

import com.readmates.session.application.model.ExpectedSessionRevision
import com.readmates.session.application.model.HostMutationEnvelope
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
    ) = hostSessionLifecycleUseCase.open(envelopes.sessionRevision(body).toSessionCommand(member, sessionId))

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
        hostSessionLifecycleUseCase.publish(envelopes.sessionRevision(body).toSessionCommand(member, sessionId))
    }

    @PostMapping("/{sessionId}/reopen")
    fun reopen(
        member: CurrentMember,
        @PathVariable sessionId: String,
        @RequestBody body: JsonNode,
    ) = hostSessionLifecycleUseCase.reopen(envelopes.reverse(body).toReverseCommand(member, sessionId))

    @PostMapping("/{sessionId}/unpublish")
    fun unpublish(
        member: CurrentMember,
        @PathVariable sessionId: String,
        @RequestBody body: JsonNode,
    ) = hostSessionLifecycleUseCase.unpublish(envelopes.reverse(body).toReverseCommand(member, sessionId))

    @PostMapping("/{sessionId}/return-to-draft")
    fun returnToDraft(
        member: CurrentMember,
        @PathVariable sessionId: String,
        @RequestBody body: JsonNode,
    ) = hostSessionLifecycleUseCase.returnToDraft(envelopes.reverse(body).toReverseCommand(member, sessionId))

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
    ) = hostSessionLifecycleUseCase.delete(envelopes.sessionRevision(body).toSessionCommand(member, sessionId))
}

private fun HostMutationEnvelope<Unit, ExpectedSessionOnlyBody>.toSessionCommand(
    member: CurrentMember,
    sessionId: String,
) = HostSessionIdCommand(
    host = member,
    sessionId = parseHostSessionId(sessionId),
    expectedSessionRevision = ExpectedSessionRevision(expected.toExpected().sessionRevision),
    idempotencyKey = idempotencyKey,
)

private fun HostMutationEnvelope<HostLifecycleCommandBody, ExpectedSessionOnlyBody>.toReverseCommand(
    member: CurrentMember,
    sessionId: String,
): HostSessionReverseCommand =
    HostSessionReverseCommand(
        host = member,
        sessionId = parseHostSessionId(sessionId),
        reasonCode = command.reasonCode?.let(::parseReasonCode),
        reasonNote = command.reasonNote,
        expectedSessionRevision = ExpectedSessionRevision(expected.toExpected().sessionRevision),
        idempotencyKey = idempotencyKey,
    )

private fun parseReasonCode(raw: String): HostSessionLifecycleReasonCode =
    runCatching { HostSessionLifecycleReasonCode.valueOf(raw) }
        .getOrElse { throw InvalidHostSessionLifecycleReasonException() }
        .takeIf(USER_SELECTABLE_LIFECYCLE_REASONS::contains)
        ?: throw InvalidHostSessionLifecycleReasonException()

@RestController
@RequestMapping("/api/host/sessions")
class HostSessionCorrectionController(
    private val hostSessionLifecycleUseCase: HostSessionLifecycleUseCase,
    private val envelopes: HostMutationEnvelopeReader,
) {
    @PostMapping("/{sessionId}/correction-publish")
    fun correctionPublish(
        member: CurrentMember,
        @PathVariable sessionId: String,
        @RequestBody body: JsonNode,
    ): Any =
        hostSessionLifecycleUseCase.correctionPublish(
            envelopes.correctionPublishVector(body).toCorrectionPublishCommand(member, sessionId),
        )

    @GetMapping("/{sessionId}/correction-publish-preview")
    fun correctionPublishPreview(
        member: CurrentMember,
        @PathVariable sessionId: String,
    ) = hostSessionLifecycleUseCase.correctionPublishPreview(
        HostSessionIdCommand(member, parseHostSessionId(sessionId)),
    )
}

private fun HostMutationEnvelope<Unit, ExpectedCorrectionPublishVectorBody>.toCorrectionPublishCommand(
    member: CurrentMember,
    sessionId: String,
): HostSessionIdCommand {
    val vector = expected.toExpected()
    return HostSessionIdCommand(
        host = member,
        sessionId = parseHostSessionId(sessionId),
        expectedSessionRevision = ExpectedSessionRevision(vector.sessionRevision),
        expectedCorrectionVector = vector,
        idempotencyKey = idempotencyKey,
    )
}

data class HostSessionReverseRequest(
    val reasonCode: String? = null,
    val reasonNote: String? = null,
    val expectedSessionRevision: Long? = null,
)
