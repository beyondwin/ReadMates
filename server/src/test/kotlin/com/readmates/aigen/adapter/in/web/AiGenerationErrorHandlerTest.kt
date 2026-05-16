package com.readmates.aigen.adapter.`in`.web

import com.readmates.aigen.adapter.out.llm.common.LlmGenerationException
import com.readmates.aigen.adapter.out.messaging.AiGenerationJobPublishException
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationError
import com.readmates.aigen.application.port.`in`.JobNotFoundException
import com.readmates.aigen.application.port.`in`.JobSessionMismatchException
import com.readmates.shared.security.AccessDeniedException
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import org.springframework.http.HttpStatus
import java.util.UUID

class AiGenerationErrorHandlerTest {
    private val handler = AiGenerationErrorHandler()

    @ParameterizedTest
    @MethodSource("errorCodeToStatus")
    fun `maps each AiGenerationException error code to expected HTTP status and problem detail`(
        code: ErrorCode,
        expectedStatus: HttpStatus,
    ) {
        val response =
            handler.handleAiGenerationException(
                AiGenerationException(code, "context message"),
            )

        assertThat(response.statusCode).isEqualTo(expectedStatus)
        val body = response.body!!
        assertThat(body.code).isEqualTo(code.name)
        assertThat(body.status).isEqualTo(expectedStatus.value())
        assertThat(body.type).isEqualTo("about:blank")
        assertThat(body.title).isNotBlank()
    }

    @Test
    fun `maps JobNotFoundException to 410 JOB_EXPIRED`() {
        val response = handler.handleJobNotFound(JobNotFoundException(UUID.randomUUID()))
        assertThat(response.statusCode).isEqualTo(HttpStatus.GONE)
        assertThat(response.body!!.code).isEqualTo(ErrorCode.JOB_EXPIRED.name)
        assertThat(response.body!!.status).isEqualTo(410)
    }

    @Test
    fun `maps JobSessionMismatchException to 404`() {
        val response =
            handler.handleJobSessionMismatch(
                JobSessionMismatchException(
                    jobId = UUID.randomUUID(),
                    expectedSessionId = UUID.randomUUID(),
                    actualSessionId = UUID.randomUUID(),
                ),
            )
        assertThat(response.statusCode).isEqualTo(HttpStatus.NOT_FOUND)
        assertThat(response.body!!.status).isEqualTo(404)
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
    fun `produces RFC 7807 fields (type, title, status, detail, code)`() {
        val response = handler.handleAiGenerationException(AiGenerationException(ErrorCode.AI_DISABLED))
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
                arrayOf(ErrorCode.QUEUE_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE),
                arrayOf(ErrorCode.PROVIDER_UNAVAILABLE, HttpStatus.BAD_GATEWAY),
                arrayOf(ErrorCode.PROVIDER_RATE_LIMITED, HttpStatus.BAD_GATEWAY),
                arrayOf(ErrorCode.SCHEMA_INVALID, HttpStatus.UNPROCESSABLE_ENTITY),
                arrayOf(ErrorCode.AUTHOR_NAME_MISMATCH, HttpStatus.UNPROCESSABLE_ENTITY),
                arrayOf(ErrorCode.HIGHLIGHTS_OUT_OF_RANGE, HttpStatus.UNPROCESSABLE_ENTITY),
                arrayOf(ErrorCode.ONE_LINE_REVIEWS_DUPLICATE, HttpStatus.UNPROCESSABLE_ENTITY),
                arrayOf(ErrorCode.FEEDBACK_TEMPLATE_INVALID, HttpStatus.UNPROCESSABLE_ENTITY),
                arrayOf(ErrorCode.UNKNOWN, HttpStatus.INTERNAL_SERVER_ERROR),
            )
    }
}
