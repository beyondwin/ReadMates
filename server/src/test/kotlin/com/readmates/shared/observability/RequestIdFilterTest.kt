package com.readmates.shared.observability

import jakarta.servlet.FilterChain
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.slf4j.MDC
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse

class RequestIdFilterTest {
    private val filter = RequestIdFilter()

    @Test
    fun `generates a 12-char alphanumeric request id when no incoming header`() {
        val request = MockHttpServletRequest()
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, FilterChain { _, _ -> })

        val id = response.getHeader(RequestIdFilter.HEADER)
        assertThat(id).isNotNull().hasSize(12).matches("[A-Za-z0-9]+")
    }

    @Test
    fun `echoes a valid incoming request id`() {
        val validId = "abc123def456"
        val request = MockHttpServletRequest().apply {
            addHeader(RequestIdFilter.HEADER, validId)
        }
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, FilterChain { _, _ -> })

        assertThat(response.getHeader(RequestIdFilter.HEADER)).isEqualTo(validId)
    }

    @Test
    fun `replaces an invalid incoming request id that is too short`() {
        val shortId = "abc"
        val request = MockHttpServletRequest().apply {
            addHeader(RequestIdFilter.HEADER, shortId)
        }
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, FilterChain { _, _ -> })

        val id = response.getHeader(RequestIdFilter.HEADER)
        assertThat(id).isNotEqualTo(shortId).isNotNull().hasSize(12)
    }

    @Test
    fun `clears MDC after the request completes`() {
        val request = MockHttpServletRequest()
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, FilterChain { _, _ -> })

        assertThat(MDC.get(RequestIdFilter.MDC_KEY)).isNull()
    }

    @Test
    fun `MDC value matches response header during filter execution`() {
        val request = MockHttpServletRequest()
        val response = MockHttpServletResponse()
        var mdcValueDuringFilter: String? = null

        filter.doFilter(
            request,
            response,
            FilterChain { _, _ -> mdcValueDuringFilter = MDC.get(RequestIdFilter.MDC_KEY) },
        )

        assertThat(mdcValueDuringFilter).isNotNull()
        assertThat(mdcValueDuringFilter).isEqualTo(response.getHeader(RequestIdFilter.HEADER))
    }
}
