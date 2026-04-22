package com.readmates.session.adapter.`in`.web

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
        "spring.autoconfigure.exclude=org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration,org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration",
    ],
)
@AutoConfigureMockMvc(addFilters = false)
class RsvpControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
) {
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
