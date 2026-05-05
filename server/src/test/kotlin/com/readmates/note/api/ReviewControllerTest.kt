package com.readmates.note.adapter.`in`.web

import com.readmates.support.MySqlTestContainer
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post

@SpringBootTest(
    properties = [
        "spring.flyway.enabled=false",
    ],
)
@AutoConfigureMockMvc(addFilters = false)
class ReviewControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
) {
    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }

    @Test
    fun `rejects a blank one line review`() {
        mockMvc.post("/api/sessions/current/one-line-reviews") {
            contentType = MediaType.APPLICATION_JSON
            content = """{ "text": " " }"""
        }.andExpect {
            status { isBadRequest() }
        }
    }

}
