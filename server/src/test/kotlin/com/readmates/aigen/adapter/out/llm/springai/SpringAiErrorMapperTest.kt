package com.readmates.aigen.adapter.out.llm.springai

import com.readmates.aigen.adapter.out.llm.common.LlmGenerationException
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.service.ProviderFailureClass
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.web.client.HttpClientErrorException
import java.io.IOException
import java.nio.charset.StandardCharsets
import java.time.Duration

class SpringAiErrorMapperTest {
    private val mapper = SpringAiErrorMapper()

    @Test
    fun `maps rate limit status and capped retry after without retaining provider content`() {
        val sensitive = "prompt-secret completion-secret schema-secret evidence-secret"
        val headers = HttpHeaders().apply { set(HttpHeaders.RETRY_AFTER, "999999") }
        val providerError =
            HttpClientErrorException.create(
                HttpStatus.TOO_MANY_REQUESTS,
                sensitive,
                headers,
                sensitive.toByteArray(),
                StandardCharsets.UTF_8,
            )

        val mapped = mapper.map(providerError, Provider.OPENAI)
        val thrown = mapped.toException()

        assertThat(mapped.failureClass).isEqualTo(ProviderFailureClass.RATE_LIMITED)
        assertThat(mapped.error.code).isEqualTo(ErrorCode.PROVIDER_RATE_LIMITED)
        assertThat(mapped.retryAfter).isEqualTo(Duration.ofHours(1))
        assertThat(thrown).isInstanceOf(LlmGenerationException::class.java)
        assertThat(thrown.cause).isNull()
        assertThat(thrown.message).doesNotContain(sensitive, "prompt", "completion", "schema", "evidence")
    }

    @Test
    fun `maps unknown post-call exceptions to safe transient uncertainty`() {
        val raw = IOException("provider response object: raw-secret")

        val mapped = mapper.map(raw, Provider.GEMINI)
        val thrown = mapped.toException()

        assertThat(mapped.failureClass).isEqualTo(ProviderFailureClass.TRANSIENT)
        assertThat(mapped.error.code).isEqualTo(ErrorCode.PROVIDER_UNAVAILABLE)
        assertThat(thrown.message).isEqualTo("Provider request outcome unknown")
        assertThat(thrown.cause).isNull()
        assertThat(thrown.toString()).doesNotContain("raw-secret", raw.toString())
    }
}
