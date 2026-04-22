package com.readmates.note.api

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post

@SpringBootTest(
    properties = [
        "spring.flyway.enabled=false",
        "spring.autoconfigure.exclude=org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration,org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration",
    ],
)
@AutoConfigureMockMvc(addFilters = false)
class ReviewControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
) {
    @Test
    fun `rejects a blank one line review`() {
        mockMvc.post("/api/sessions/current/one-line-reviews") {
            contentType = MediaType.APPLICATION_JSON
            content = """{ "text": " " }"""
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun `rejects a blank long review`() {
        mockMvc.post("/api/sessions/current/reviews") {
            contentType = MediaType.APPLICATION_JSON
            content = """{ "body": " " }"""
        }.andExpect {
            status { isBadRequest() }
        }
    }
}
