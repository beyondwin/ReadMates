@file:Suppress("ktlint:standard:package-name")

package com.readmates.observability.adapter.`in`.web

import com.readmates.observability.application.model.FrontendObservabilityResult
import com.readmates.observability.application.port.`in`.RecordFrontendObservabilityUseCase
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.anyList
import org.mockito.Mockito.mock
import org.mockito.Mockito.times
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.setup.MockMvcBuilders

class FrontendObservabilityControllerTest {
    private val useCase = mock(RecordFrontendObservabilityUseCase::class.java)
    private val mockMvc: MockMvc =
        MockMvcBuilders
            .standaloneSetup(FrontendObservabilityController(useCase))
            .build()

    @Test
    fun `accepts frontend telemetry batch and maps route load event`() {
        `when`(useCase.record(anyList())).thenReturn(FrontendObservabilityResult(accepted = 1, dropped = 0))

        mockMvc
            .post("/api/observability/frontend-events") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "events": [
                        {
                          "type": "ROUTE_LOAD",
                          "routePattern": "/clubs/:slug/app",
                          "durationMs": 120,
                          "navigationType": "LOAD",
                          "result": "success"
                        }
                      ]
                    }
                    """.trimIndent()
            }.andExpect {
                status { isAccepted() }
                jsonPath("$.accepted") { value(1) }
                jsonPath("$.dropped") { value(0) }
            }

        verify(useCase).record(anyList())
    }

    @Test
    fun `rejects unsafe raw route pattern`() {
        mockMvc
            .post("/api/observability/frontend-events") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "events": [
                        {
                          "type": "API_FAILURE",
                          "routePattern": "/clubs/reading-sai/app",
                          "apiGroup": "host-session",
                          "statusClass": "5xx",
                          "errorCode": "INTERNAL_ERROR"
                        }
                      ]
                    }
                    """.trimIndent()
            }.andExpect {
                status { isAccepted() }
                jsonPath("$.accepted") { value(0) }
                jsonPath("$.dropped") { value(1) }
            }

        verify(useCase).recordDropped("invalid_route_pattern")
    }

    @Test
    fun `records dropped reasons reported by trusted BFF sanitizer`() {
        mockMvc
            .post("/api/observability/frontend-events") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "events": [],
                      "droppedReasons": [
                        "invalid_route_pattern",
                        "invalid_event",
                        "private_member_value"
                      ]
                    }
                    """.trimIndent()
            }.andExpect {
                status { isAccepted() }
                jsonPath("$.accepted") { value(0) }
                jsonPath("$.dropped") { value(2) }
            }

        verify(useCase).recordDropped("invalid_route_pattern")
        verify(useCase).recordDropped("invalid_event")
        verify(useCase, times(0)).recordDropped("private_member_value")
    }
}
