package com.readmates.session.api

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

@SpringBootTest(
    properties = [
        "spring.flyway.enabled=false",
        "spring.autoconfigure.exclude=org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration,org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration",
    ],
)
@AutoConfigureMockMvc(addFilters = false)
class CurrentSessionControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
) {
    @Test
    fun `returns unauthorized when current member cannot be resolved`() {
        mockMvc.get("/api/sessions/current")
            .andExpect {
                status { isUnauthorized() }
            }
    }
}
