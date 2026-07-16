package com.readmates.shared.observability

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.http.server.observation.ServerRequestObservationContext
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse

class ContentSafeServerRequestObservationConventionTest {
    @Test
    fun `raw identifier-bearing URL is excluded while route template is retained`() {
        val request = MockHttpServletRequest("GET", "/api/invitations/private-token-value")
        request.queryString = "invite=another-private-value"
        val context = ServerRequestObservationContext(request, MockHttpServletResponse())
        context.pathPattern = "/api/invitations/{token}"

        val convention = ContentSafeServerRequestObservationConvention()
        val lowCardinality = convention.getLowCardinalityKeyValues(context).associate { it.key to it.value }

        assertThat(convention.name).isEqualTo("http.server.requests")
        assertThat(convention.getHighCardinalityKeyValues(context)).isEmpty()
        assertThat(lowCardinality["uri"]).isEqualTo("/api/invitations/{token}")
        assertThat(lowCardinality.values).noneMatch { it.contains("private-token-value") }
        assertThat(lowCardinality.values).noneMatch { it.contains("another-private-value") }
    }
}
