package com.readmates.shared.adapter.`in`.web

import com.readmates.support.MySqlTestContainer
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.flywaydb.core.Flyway
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.ApplicationContext
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import javax.sql.DataSource

@SpringBootTest(
    properties = [
        "spring.flyway.enabled=false",
    ],
)
@AutoConfigureMockMvc
class HealthControllerTest(
    @param:Autowired private val applicationContext: ApplicationContext,
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
    fun `returns server health payload without authentication`() {
        mockMvc.get("/internal/health")
            .andExpect {
                status { isOk() }
                jsonPath("$.status") { value("UP") }
                jsonPath("$.kind") { value("liveness") }
            }
    }

    @Test
    fun `keeps flyway disabled while datasource supports fail fast adapters`() {
        assertTrue(applicationContext.getBeansOfType(DataSource::class.java).isNotEmpty())
        assertTrue(applicationContext.getBeansOfType(Flyway::class.java).isEmpty())
    }

    @Test
    fun `keeps actuator health protected`() {
        mockMvc.get("/actuator/health")
            .andExpect {
                status { isUnauthorized() }
            }
    }
}
