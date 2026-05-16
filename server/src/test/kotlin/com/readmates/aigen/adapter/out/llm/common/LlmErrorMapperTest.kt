package com.readmates.aigen.adapter.out.llm.common

import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.Provider
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Test
import java.io.IOException
import java.net.SocketTimeoutException

class LlmErrorMapperTest {
    @Test
    fun `IOException maps to PROVIDER_UNAVAILABLE`() {
        val err = LlmErrorMapper.mapException(IOException("connection reset"), Provider.CLAUDE)
        assertEquals(ErrorCode.PROVIDER_UNAVAILABLE, err.code)
        assertEquals("provider returned 5xx or timed out", err.message)
    }

    @Test
    fun `SocketTimeoutException maps to PROVIDER_UNAVAILABLE`() {
        val err = LlmErrorMapper.mapException(SocketTimeoutException("read timed out"), Provider.OPENAI)
        assertEquals(ErrorCode.PROVIDER_UNAVAILABLE, err.code)
    }

    @Test
    fun `RuntimeException with HTTP 503 maps to PROVIDER_UNAVAILABLE`() {
        val err = LlmErrorMapper.mapException(RuntimeException("HTTP 503 service unavailable"), Provider.GEMINI)
        assertEquals(ErrorCode.PROVIDER_UNAVAILABLE, err.code)
        assertEquals("provider returned 5xx or timed out", err.message)
    }

    @Test
    fun `RuntimeException mentioning rate_limit and 429 maps to PROVIDER_RATE_LIMITED`() {
        val err = LlmErrorMapper.mapException(RuntimeException("rate_limit_error 429"), Provider.CLAUDE)
        assertEquals(ErrorCode.PROVIDER_RATE_LIMITED, err.code)
        assertEquals("provider returned 429", err.message)
    }

    @Test
    fun `RuntimeException with only 429 maps to PROVIDER_RATE_LIMITED`() {
        val err = LlmErrorMapper.mapException(RuntimeException("HTTP 429 too many requests"), Provider.OPENAI)
        assertEquals(ErrorCode.PROVIDER_RATE_LIMITED, err.code)
    }

    @Test
    fun `unrelated RuntimeException maps to UNKNOWN with fixed message`() {
        val err = LlmErrorMapper.mapException(RuntimeException("unrelated"), Provider.CLAUDE)
        assertEquals(ErrorCode.UNKNOWN, err.code)
        assertEquals("unknown provider error", err.message)
    }

    @Test
    fun `PII invariant - error message never contains sentinel from upstream exception`() {
        val sentinel = "UNIQUE-SENTINEL-12345"
        val ex = RuntimeException("error around transcript $sentinel occurred")
        val err = LlmErrorMapper.mapException(ex, Provider.CLAUDE)
        assertFalse(
            err.message.contains(sentinel),
            "GenerationError.message must not echo upstream message containing transcript sentinel",
        )
    }

    @Test
    fun `PII invariant - rate limited error message never contains sentinel`() {
        val sentinel = "UNIQUE-SENTINEL-12345"
        val ex = RuntimeException("rate_limit 429 while processing $sentinel")
        val err = LlmErrorMapper.mapException(ex, Provider.OPENAI)
        assertFalse(err.message.contains(sentinel))
    }
}
