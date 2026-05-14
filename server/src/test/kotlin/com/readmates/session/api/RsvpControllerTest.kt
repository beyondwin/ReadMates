package com.readmates.session.adapter.`in`.web

import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.patch

@SpringBootTest(
    properties = [
        "spring.flyway.enabled=false",
    ],
)
@AutoConfigureMockMvc(addFilters = false)
@Tag("integration")
class RsvpControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
) : ReadmatesMySqlIntegrationTestSupport() {

    @Test
    fun `rejects an invalid RSVP status`() {
        mockMvc.patch("/api/sessions/current/rsvp") {
            contentType = MediaType.APPLICATION_JSON
            content = """{ "status": "LATE" }"""
        }.andExpect {
            status { isBadRequest() }
        }
    }
}
