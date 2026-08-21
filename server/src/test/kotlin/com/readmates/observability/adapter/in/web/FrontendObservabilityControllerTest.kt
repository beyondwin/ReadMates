@file:Suppress("ktlint:standard:package-name")

package com.readmates.observability.adapter.`in`.web

import com.readmates.observability.application.model.FrontendObservabilityEvent
import com.readmates.observability.application.model.FrontendObservabilityResult
import com.readmates.observability.application.model.HostAttentionResultEvent
import com.readmates.observability.application.model.HostOperationsCardLoadEvent
import com.readmates.observability.application.model.HostScheduleDefaultsEvent
import com.readmates.observability.application.port.`in`.RecordFrontendObservabilityUseCase
import org.assertj.core.api.Assertions.assertThat
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
import java.time.Duration

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

    @Test
    fun `accepts bounded host operation events and ignores extra identifiers`() {
        lateinit var captured: List<FrontendObservabilityEvent>
        `when`(useCase.record(anyList())).thenAnswer { invocation ->
            captured = invocation.getArgument(0)
            FrontendObservabilityResult(accepted = captured.size, dropped = 0)
        }

        mockMvc
            .post("/api/observability/frontend-events") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "events": [
                        {
                          "type": "HOST_SCHEDULE_DEFAULTS",
                          "routePattern": "/app/host/sessions/new",
                          "outcome": "legacy_404",
                          "hasPasscode": false,
                          "clubId": "club-1"
                        },
                        {
                          "type": "HOST_OPERATIONS_CARD_LOAD",
                          "routePattern": "/app/host/operations",
                          "card": "ai_defaults",
                          "outcome": "success",
                          "durationMs": 90000
                        },
                        {
                          "type": "HOST_ATTENTION_RESULT",
                          "routePattern": "/app/host/operations",
                          "size": 50000,
                          "sessionId": "session-1",
                          "membershipId": "membership-1"
                        }
                      ]
                    }
                    """.trimIndent()
            }.andExpect {
                status { isAccepted() }
                jsonPath("$.accepted") { value(3) }
                jsonPath("$.dropped") { value(0) }
            }

        assertThat(captured).containsExactly(
            HostScheduleDefaultsEvent("/app/host/sessions/new", "legacy_404"),
            HostOperationsCardLoadEvent(
                "/app/host/operations",
                "ai_defaults",
                "success",
                Duration.ofMillis(60_000),
            ),
            HostAttentionResultEvent("/app/host/operations", 10_000),
        )
    }

    @Test
    fun `rejects unknown host operation values`() {
        mockMvc
            .post("/api/observability/frontend-events") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "events": [
                        {
                          "type": "HOST_SCHEDULE_DEFAULTS",
                          "routePattern": "/app/host/sessions/new",
                          "outcome": "timeout"
                        },
                        {
                          "type": "HOST_OPERATIONS_CARD_LOAD",
                          "routePattern": "/app/host/operations",
                          "card": "dashboard",
                          "outcome": "success",
                          "durationMs": 12
                        }
                      ]
                    }
                    """.trimIndent()
            }.andExpect {
                status { isAccepted() }
                jsonPath("$.accepted") { value(0) }
                jsonPath("$.dropped") { value(2) }
            }

        verify(useCase, times(2)).recordDropped("invalid_event")
        verify(useCase, times(0)).record(anyList())
    }
}
