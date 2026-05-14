package com.readmates.note.adapter.`in`.web

import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.put

@SpringBootTest(
    properties = [
        "spring.flyway.enabled=false",
    ],
)
@AutoConfigureMockMvc(addFilters = false)
@Tag("integration")
class CheckinControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `rejects reading progress outside the accepted range`() {
        mockMvc
            .put("/api/sessions/current/checkin") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "readingProgress": 101
                    }
                    """.trimIndent()
            }.andExpect {
                status { isBadRequest() }
            }
    }
}
