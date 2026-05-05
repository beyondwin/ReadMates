package com.readmates.session.api

import com.readmates.support.MySqlTestContainer
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

@SpringBootTest(
    properties = [
        "spring.flyway.enabled=false",
    ],
)
@AutoConfigureMockMvc(addFilters = false)
class CurrentSessionControllerTest(
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
    fun `returns unauthorized when current member cannot be resolved`() {
        mockMvc.get("/api/sessions/current")
            .andExpect {
                status { isUnauthorized() }
            }
    }
}
