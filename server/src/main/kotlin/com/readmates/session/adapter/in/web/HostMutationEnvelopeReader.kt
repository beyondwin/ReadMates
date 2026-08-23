@file:Suppress("TooManyFunctions", "ktlint:standard:package-name")

package com.readmates.session.adapter.`in`.web

import com.readmates.session.application.InvalidSessionScheduleException
import com.readmates.session.application.model.HostMutationEnvelope
import jakarta.validation.ConstraintViolationException
import jakarta.validation.Validator
import org.springframework.stereotype.Component
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

@Component
class HostMutationEnvelopeReader(
    private val validator: Validator,
) {
    private val mapper: JsonMapper =
        JsonMapper
            .builder()
            .findAndAddModules()
            .build()

    fun create(body: JsonNode): HostMutationEnvelope<HostSessionRequest, HostCreateExpectedBody> =
        read(body, HostCreateExpectedBody::class.java, HostSessionRequest::class.java, emptySet()) {
            HostCreateExpectedBody() to convert(body, HostSessionRequest::class.java)
        }

    fun update(body: JsonNode): HostMutationEnvelope<HostSessionRequest, ExpectedSessionOnlyBody> =
        read(body, ExpectedSessionOnlyBody::class.java, HostSessionRequest::class.java, setOf("sessionRevision")) {
            ExpectedSessionOnlyBody(body.path("expectedSessionRevision").asLongOrNull()) to
                convert(body, HostSessionRequest::class.java)
        }

    fun sessionRevision(body: JsonNode): HostMutationEnvelope<Unit, ExpectedSessionOnlyBody> =
        read(body, ExpectedSessionOnlyBody::class.java, Unit::class.java, setOf("sessionRevision")) {
            ExpectedSessionOnlyBody(body.path("expectedSessionRevision").asLongOrNull()) to Unit
        }

    fun publishVector(body: JsonNode): HostMutationEnvelope<Unit, ExpectedPublishVectorBody> =
        read(
            body,
            ExpectedPublishVectorBody::class.java,
            Unit::class.java,
            setOf("sessionRevision", "liveRecordRevision", "exposureRevision", "publicationRevision"),
        ) { throw InvalidSessionScheduleException() }

    fun correctionPublishVector(body: JsonNode): HostMutationEnvelope<Unit, ExpectedCorrectionPublishVectorBody> =
        read(
            body,
            ExpectedCorrectionPublishVectorBody::class.java,
            Unit::class.java,
            setOf(
                "sessionRevision",
                "recordDraftRevision",
                "liveRecordRevision",
                "exposureRevision",
                "publicationRevision",
            ),
        ) { throw InvalidSessionScheduleException() }

    fun close(body: JsonNode): HostMutationEnvelope<Unit, ExpectedCloseRevisionsBody> {
        val envelope =
            read(
                body,
                ExpectedCloseRevisionsBody::class.java,
                Unit::class.java,
                setOf("sessionRevision", "participantSetRevision", "attendanceSnapshotId"),
            ) {
                ExpectedCloseRevisionsBody(
                    sessionRevision = body.path("expectedSessionRevision").asLongOrNull(),
                ) to Unit
            }
        if (body.has("idempotencyKey") &&
            (
                envelope.expected.participantSetRevision == null ||
                    envelope.expected.attendanceSnapshotId.isNullOrBlank()
            )
        ) {
            throw InvalidSessionScheduleException()
        }
        return envelope
    }

    fun reverse(body: JsonNode): HostMutationEnvelope<HostLifecycleCommandBody, ExpectedSessionOnlyBody> =
        read(body, ExpectedSessionOnlyBody::class.java, HostLifecycleCommandBody::class.java, setOf("sessionRevision")) {
            ExpectedSessionOnlyBody(body.path("expectedSessionRevision").asLongOrNull()) to
                convert(body, HostLifecycleCommandBody::class.java)
        }

    fun attendance(body: JsonNode): HostMutationEnvelope<HostAttendanceCommandBody, ExpectedAttendanceRowsBody> {
        if (body.isArray) {
            val entries = mutableListOf<AttendanceEntry>()
            body.forEach { node -> entries += convert(node, AttendanceEntry::class.java) }
            return HostMutationEnvelope(
                idempotencyKey = generatedKey(),
                expected =
                    ExpectedAttendanceRowsBody(
                        rows =
                            entries.map { entry ->
                                ExpectedAttendanceRowBody(
                                    membershipId = UUID.fromString(entry.membershipId),
                                    attendanceRevision = entry.expectedAttendanceRevision,
                                )
                            },
                    ),
                command = HostAttendanceCommandBody(entries),
            )
        }
        return read(
            body,
            ExpectedAttendanceRowsBody::class.java,
            HostAttendanceCommandBody::class.java,
            setOf("rows", "participantSetRevision"),
        ) {
            throw InvalidSessionScheduleException()
        }
    }

    fun access(body: JsonNode): HostMutationEnvelope<HostSessionAccessScopeRequest, ExpectedExposureRevisionBody> {
        val envelope =
            read(
                body,
                ExpectedExposureRevisionBody::class.java,
                HostSessionAccessScopeRequest::class.java,
                setOf("exposureRevision"),
            ) {
                ExpectedExposureRevisionBody() to convert(body, HostSessionAccessScopeRequest::class.java)
            }
        if (body.has("idempotencyKey") && envelope.expected.exposureRevision == null) {
            throw InvalidSessionScheduleException()
        }
        return envelope
    }

    fun publication(body: JsonNode): HostMutationEnvelope<HostSessionPublicationRequest, ExpectedPublicationRevisionBody> {
        val envelope =
            read(
                body,
                ExpectedPublicationRevisionBody::class.java,
                HostSessionPublicationRequest::class.java,
                setOf("publicationRevision", "exposureRevision"),
            ) {
                ExpectedPublicationRevisionBody() to convert(body, HostSessionPublicationRequest::class.java)
            }
        if (body.has("idempotencyKey") && envelope.expected.publicationRevision == null) {
            throw InvalidSessionScheduleException()
        }
        if (envelope.command.accessScope != null && envelope.expected.exposureRevision == null) {
            throw InvalidSessionScheduleException()
        }
        return envelope
    }

    fun restoreChange(body: JsonNode): HostMutationEnvelope<HostRestoreCommandBody, ExpectedSessionOnlyBody> =
        read(body, ExpectedSessionOnlyBody::class.java, HostRestoreCommandBody::class.java, setOf("sessionRevision")) {
            ExpectedSessionOnlyBody(body.path("expectedSessionRevision").asLongOrNull()) to
                convert(body, HostRestoreCommandBody::class.java)
        }

    private fun <C : Any, E : Any> read(
        body: JsonNode,
        expectedType: Class<E>,
        commandType: Class<C>,
        expectedFields: Set<String>,
        legacy: () -> Pair<E, C>,
    ): HostMutationEnvelope<C, E> {
        if (!body.isObject) {
            throw InvalidSessionScheduleException()
        }
        val names = body.propertyNames().asSequence().toSet()
        val envelopeFields = setOf("idempotencyKey", "expected", "command")
        if (names.any { name -> name in envelopeFields }) {
            if (names != envelopeFields) {
                throw InvalidSessionScheduleException()
            }
            val key =
                body.get("idempotencyKey")?.asString()?.takeIf { value -> value.isNotBlank() }
                    ?: throw InvalidSessionScheduleException()
            requireExactProperties(body.get("expected"), expectedFields)
            val expected = convert(body.get("expected"), expectedType)
            val command =
                if (commandType == Unit::class.java) {
                    @Suppress("UNCHECKED_CAST")
                    Unit as C
                } else {
                    convert(body.get("command"), commandType)
                }
            validate(expected)
            if (commandType != Unit::class.java) {
                validate(command)
            }
            return HostMutationEnvelope(key, expected, command)
        }
        val (expected, command) = legacy()
        if (commandType != Unit::class.java) {
            validate(command)
        }
        return HostMutationEnvelope(generatedKey(), expected, command)
    }

    private fun <T> convert(
        node: JsonNode?,
        type: Class<T>,
    ): T {
        if (node == null || node.isNull) {
            throw InvalidSessionScheduleException()
        }
        return mapper.convertValue(node, type)
    }

    private fun validate(value: Any) {
        val violations = validator.validate(value)
        if (violations.isNotEmpty()) {
            throw ConstraintViolationException(violations)
        }
    }

    private fun requireExactProperties(
        node: JsonNode?,
        allowed: Set<String>,
    ) {
        if (node == null || !node.isObject) {
            throw InvalidSessionScheduleException()
        }
        val names = node.propertyNames().asSequence().toSet()
        if (names.any { name -> name !in allowed }) {
            throw InvalidSessionScheduleException()
        }
    }

    private fun generatedKey(): String = "k${UUID.randomUUID().toString().replace("-", "")}"
}

private fun JsonNode.asLongOrNull(): Long? = if (isMissingNode || isNull) null else asLong()
