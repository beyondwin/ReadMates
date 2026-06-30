@file:Suppress("ktlint:standard:package-name")

package com.readmates.observability.adapter.`in`.web

import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.bff-secret=test-bff-secret",
        "readmates.allowed-origins=http://localhost:3000",
    ],
)
@AutoConfigureMockMvc
@Tag("integration")
class FrontendObservabilityBffSecurityTest(
    @param:Autowired private val mockMvc: MockMvc,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `frontend observability bff request reaches controller without spring csrf token or member session`() {
        mockMvc
            .post("/api/observability/frontend-events") {
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("Origin", "http://localhost:3000")
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "events": [
                        {
                          "type": "ROUTE_LOAD",
                          "routePattern": "/",
                          "durationMs": 123,
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
    }

    @Test
    fun `frontend observability without bff secret is rejected`() {
        mockMvc
            .post("/api/observability/frontend-events") {
                header("Origin", "http://localhost:3000")
                contentType = MediaType.APPLICATION_JSON
                content = """{"events":[]}"""
            }.andExpect {
                status { isUnauthorized() }
            }
    }

    @Test
    fun `frontend observability without allowed origin is rejected`() {
        mockMvc
            .post("/api/observability/frontend-events") {
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                contentType = MediaType.APPLICATION_JSON
                content = """{"events":[]}"""
            }.andExpect {
                status { isForbidden() }
            }
    }
}
