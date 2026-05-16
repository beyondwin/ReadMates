package com.readmates.aigen.adapter.`in`.web

import com.readmates.aigen.config.AiGenerationProperties
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.mock.web.MockFilterChain
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse

class AiGenerationKillSwitchFilterTest {
    @Test
    fun `passes through when aigen is enabled`() {
        val filter = AiGenerationKillSwitchFilter(properties(enabled = true))
        val request = MockHttpServletRequest("POST", "/api/host/sessions/abc-123/ai-generate/jobs")
        val response = MockHttpServletResponse()
        val chain = MockFilterChain()

        filter.doFilter(request, response, chain)

        assertThat(chain.request).isSameAs(request)
        assertThat(response.status).isEqualTo(200)
        assertThat(response.contentAsString).isEmpty()
    }

    @Test
    fun `returns 503 with problem+json for ai-generate path when disabled`() {
        val filter = AiGenerationKillSwitchFilter(properties(enabled = false))
        val request = MockHttpServletRequest("POST", "/api/host/sessions/abc-123/ai-generate/jobs")
        val response = MockHttpServletResponse()
        val chain = MockFilterChain()

        filter.doFilter(request, response, chain)

        assertThat(chain.request).isNull()
        assertThat(response.status).isEqualTo(503)
        assertThat(response.contentType).startsWith("application/problem+json")
        assertThat(response.contentAsString)
            .contains("\"status\":503")
            .contains("\"title\":\"AI generation is disabled\"")
            .contains("\"code\":\"AI_DISABLED\"")
    }

    @Test
    fun `returns 503 for ai-defaults path when disabled`() {
        val filter = AiGenerationKillSwitchFilter(properties(enabled = false))
        val request = MockHttpServletRequest("GET", "/api/host/clubs/my-club/ai-defaults")
        val response = MockHttpServletResponse()
        val chain = MockFilterChain()

        filter.doFilter(request, response, chain)

        assertThat(chain.request).isNull()
        assertThat(response.status).isEqualTo(503)
        assertThat(response.contentType).startsWith("application/problem+json")
    }

    @Test
    fun `passes through unrelated paths even when disabled`() {
        val filter = AiGenerationKillSwitchFilter(properties(enabled = false))
        val request = MockHttpServletRequest("POST", "/api/host/sessions/abc-123/import")
        val response = MockHttpServletResponse()
        val chain = MockFilterChain()

        filter.doFilter(request, response, chain)

        assertThat(chain.request).isSameAs(request)
        assertThat(response.status).isEqualTo(200)
    }

    @Test
    fun `passes through nested ai-defaults non-matching paths when disabled`() {
        // /api/host/clubs/{slug}/sessions/... must not be swallowed by the ai-defaults pattern.
        val filter = AiGenerationKillSwitchFilter(properties(enabled = false))
        val request = MockHttpServletRequest("GET", "/api/host/clubs/my-club/sessions")
        val response = MockHttpServletResponse()
        val chain = MockFilterChain()

        filter.doFilter(request, response, chain)

        assertThat(chain.request).isSameAs(request)
        assertThat(response.status).isEqualTo(200)
    }

    private fun properties(enabled: Boolean): AiGenerationProperties = AiGenerationProperties(enabled = enabled)
}
