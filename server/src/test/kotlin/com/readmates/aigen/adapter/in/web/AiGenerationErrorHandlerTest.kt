package com.readmates.aigen.adapter.`in`.web

import com.readmates.aigen.adapter.out.llm.common.LlmGenerationException
import com.readmates.aigen.adapter.out.messaging.AiGenerationJobPublishException
import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationError
import com.readmates.sessionimport.application.model.SessionImportIssue
import com.readmates.sessionimport.application.service.InvalidSessionImportException
import com.readmates.shared.security.AccessDeniedException
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import org.springframework.http.HttpStatus
import java.util.UUID

class AiGenerationErrorHandlerTest {
    private val handler = AiGenerationErrorHandler()

    @Test
    fun `maps invalid transcript speakers to safe 422 labels only`() {
        val response =
            handler.handleInvalidTranscriptSpeakers(
                AiGenerationException.InvalidTranscriptSpeakers(
                    ErrorCode.TRANSCRIPT_SPEAKER_NOT_MEMBER,
                    listOf("없는이름", "화자 1"),
                ),
            )

        assertThat(response.statusCode).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY)
        assertThat(response.body!!.code).isEqualTo("TRANSCRIPT_SPEAKER_NOT_MEMBER")
        assertThat(response.body!!.invalidSpeakerLabels).containsExactly("없는이름", "화자 1")
        assertThat(response.body!!.detail).doesNotContain("membershipId", "clubId")
    }

    @ParameterizedTest
    @MethodSource("errorCodeToStatus")
    fun `maps each AiGenerationException Coded error code to expected HTTP status and problem detail`(
        code: ErrorCode,
        expectedStatus: HttpStatus,
    ) {
        val response =
            handler.handleCoded(
                AiGenerationException.Coded(code, "context message"),
            )

        assertThat(response.statusCode).isEqualTo(expectedStatus)
        val body = response.body!!
        assertThat(body.code).isEqualTo(code.name)
        assertThat(body.status).isEqualTo(expectedStatus.value())
        assertThat(body.type).isEqualTo("about:blank")
        assertThat(body.title).isNotBlank()
    }

    @Test
    fun `maps JobNotFound to 410 JOB_EXPIRED with typed problem URI`() {
        val response = handler.handleJobNotFound(AiGenerationException.JobNotFound(UUID.randomUUID()))
        assertThat(response.statusCode).isEqualTo(HttpStatus.GONE)
        assertThat(response.body!!.code).isEqualTo(ErrorCode.JOB_EXPIRED.name)
        assertThat(response.body!!.status).isEqualTo(410)
        assertThat(response.body!!.type).isEqualTo("/problems/aigen/job-not-found")
    }

    @Test
    fun `maps JobSessionMismatch to 404 with typed problem URI`() {
        val response =
            handler.handleJobSessionMismatch(
                AiGenerationException.JobSessionMismatch(
                    jobId = UUID.randomUUID(),
                    expectedSessionId = UUID.randomUUID(),
                    actualSessionId = UUID.randomUUID(),
                ),
            )
        assertThat(response.statusCode).isEqualTo(HttpStatus.NOT_FOUND)
        assertThat(response.body!!.status).isEqualTo(404)
        assertThat(response.body!!.type).isEqualTo("/problems/aigen/job-session-mismatch")
    }

    @Test
    fun `maps IllegalGenerationState to 409 CONFLICT with typed problem URI`() {
        val response =
            handler.handleIllegalGenerationState(
                AiGenerationException.IllegalGenerationState(
                    jobId = UUID.randomUUID(),
                    currentStatus = "PENDING",
                    attemptedAction = "commit",
                ),
            )
        assertThat(response.statusCode).isEqualTo(HttpStatus.CONFLICT)
        assertThat(response.body!!.code).isEqualTo("ILLEGAL_GENERATION_STATE")
        assertThat(response.body!!.type).isEqualTo("/problems/aigen/illegal-generation-state")
    }

    @Test
    fun `maps AiGenerationJobPublishException to 503 QUEUE_UNAVAILABLE`() {
        val response =
            handler.handleQueueFailure(
                AiGenerationJobPublishException("boom", RuntimeException("inner")),
            )
        assertThat(response.statusCode).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE)
        assertThat(response.body!!.code).isEqualTo(ErrorCode.QUEUE_UNAVAILABLE.name)
    }

    @Test
    fun `maps LlmGenerationException with PROVIDER_UNAVAILABLE to 502`() {
        val response =
            handler.handleLlmGeneration(
                LlmGenerationException(GenerationError(ErrorCode.PROVIDER_UNAVAILABLE, "provider down")),
            )
        assertThat(response.statusCode).isEqualTo(HttpStatus.BAD_GATEWAY)
        assertThat(response.body!!.code).isEqualTo(ErrorCode.PROVIDER_UNAVAILABLE.name)
    }

    @Test
    fun `maps LlmGenerationException with SCHEMA_INVALID to 422`() {
        val response =
            handler.handleLlmGeneration(
                LlmGenerationException(GenerationError(ErrorCode.SCHEMA_INVALID, "bad schema")),
            )
        assertThat(response.statusCode).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY)
        assertThat(response.body!!.code).isEqualTo(ErrorCode.SCHEMA_INVALID.name)
    }

    @Test
    fun `maps AccessDeniedException to 403 with PERMISSION_DENIED problem detail`() {
        val response = handler.handleAccessDenied(AccessDeniedException("nope"))
        assertThat(response.statusCode).isEqualTo(HttpStatus.FORBIDDEN)
        assertThat(response.body!!.status).isEqualTo(403)
        // shape is RFC 7807, code from problem-detail convention
        assertThat(response.body!!.code).isEqualTo("PERMISSION_DENIED")
    }

    @Test
    fun `falls back to 500 UNKNOWN for plain RuntimeException without leaking message`() {
        val response = handler.handleUnknown(RuntimeException("transcript: secret PII"))
        assertThat(response.statusCode).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR)
        assertThat(response.body!!.code).isEqualTo("UNKNOWN")
        assertThat(response.body!!.detail).doesNotContain("PII")
        assertThat(response.body!!.detail).doesNotContain("transcript")
    }

    @Test
    fun `unknown handler scrubs invalid session import details from response`() {
        val handler = AiGenerationErrorHandler()
        val error =
            InvalidSessionImportException(
                listOf(SessionImportIssue("AUTHOR_NOT_FOUND", "작성자 'Private Name'을 찾을 수 없습니다.")),
            )

        val response = handler.handleUnknown(error)

        assertThat(response.statusCode.value()).isEqualTo(500)
        assertThat(response.body!!.code).isEqualTo(ErrorCode.UNKNOWN.name)
        assertThat(response.body!!.detail).isEqualTo("internal error")
        assertThat(response.body!!.detail).doesNotContain("Private Name")
    }

    @Test
    fun `produces RFC 7807 fields (type, title, status, detail, code)`() {
        val response = handler.handleCoded(AiGenerationException.Coded(ErrorCode.AI_DISABLED))
        val body = response.body!!
        assertThat(body.type).isEqualTo("about:blank")
        assertThat(body.title).isNotBlank()
        assertThat(body.status).isEqualTo(503)
        // detail may be null but field must exist as nullable in DTO
        assertThat(body.code).isEqualTo("AI_DISABLED")
    }

    companion object {
        @JvmStatic
        fun errorCodeToStatus(): List<Array<Any>> =
            listOf(
                arrayOf(ErrorCode.AI_DISABLED, HttpStatus.SERVICE_UNAVAILABLE),
                arrayOf(ErrorCode.JOB_EXPIRED, HttpStatus.GONE),
                arrayOf(ErrorCode.HOST_DAILY_CAP_EXCEEDED, HttpStatus.BAD_REQUEST),
                arrayOf(ErrorCode.CLUB_MONTHLY_CAP_EXCEEDED, HttpStatus.BAD_REQUEST),
                arrayOf(ErrorCode.RATE_LIMITED, HttpStatus.TOO_MANY_REQUESTS),
                arrayOf(ErrorCode.MAX_CALLS_EXCEEDED, HttpStatus.TOO_MANY_REQUESTS),
                arrayOf(ErrorCode.QUEUE_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE),
                arrayOf(ErrorCode.PROVIDER_UNAVAILABLE, HttpStatus.BAD_GATEWAY),
                arrayOf(ErrorCode.PROVIDER_RATE_LIMITED, HttpStatus.BAD_GATEWAY),
                arrayOf(ErrorCode.SCHEMA_INVALID, HttpStatus.UNPROCESSABLE_ENTITY),
                arrayOf(ErrorCode.AUTHOR_NAME_MISMATCH, HttpStatus.UNPROCESSABLE_ENTITY),
                arrayOf(ErrorCode.HIGHLIGHTS_OUT_OF_RANGE, HttpStatus.UNPROCESSABLE_ENTITY),
                arrayOf(ErrorCode.ONE_LINE_REVIEWS_DUPLICATE, HttpStatus.UNPROCESSABLE_ENTITY),
                arrayOf(ErrorCode.FEEDBACK_TEMPLATE_INVALID, HttpStatus.UNPROCESSABLE_ENTITY),
                arrayOf(ErrorCode.TRANSCRIPT_FORMAT_INVALID, HttpStatus.UNPROCESSABLE_ENTITY),
                arrayOf(ErrorCode.TRANSCRIPT_EMPTY, HttpStatus.UNPROCESSABLE_ENTITY),
                arrayOf(ErrorCode.TRANSCRIPT_DURATION_EXCEEDED, HttpStatus.UNPROCESSABLE_ENTITY),
                arrayOf(ErrorCode.TRANSCRIPT_SPEAKER_NOT_MEMBER, HttpStatus.UNPROCESSABLE_ENTITY),
                arrayOf(ErrorCode.TRANSCRIPT_SPEAKER_AMBIGUOUS, HttpStatus.UNPROCESSABLE_ENTITY),
                arrayOf(ErrorCode.MODEL_CAPABILITY_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE),
                arrayOf(ErrorCode.TRANSCRIPT_TOO_LONG_FOR_MODEL, HttpStatus.UNPROCESSABLE_ENTITY),
                arrayOf(ErrorCode.UNKNOWN, HttpStatus.INTERNAL_SERVER_ERROR),
            )
    }
}
