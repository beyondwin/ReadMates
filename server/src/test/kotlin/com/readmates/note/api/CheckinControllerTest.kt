package com.readmates.note.api

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
        "spring.autoconfigure.exclude=org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration,org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration",
    ],
)
@AutoConfigureMockMvc(addFilters = false)
class CheckinControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
) {
    @Test
    fun `rejects reading progress outside the accepted range`() {
        mockMvc.put("/api/sessions/current/checkin") {
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "readingProgress": 101,
                  "note": "범위를 벗어난 체크인"
                }
                """.trimIndent()
        }.andExpect {
            status { isBadRequest() }
        }
    }
}
