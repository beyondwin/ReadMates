package com.readmates.shared.api

import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.flywaydb.core.Flyway
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.ApplicationContext
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import javax.sql.DataSource

@SpringBootTest(
    properties = [
        "spring.flyway.enabled=false",
        "spring.autoconfigure.exclude=org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration,org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration",
    ],
)
@AutoConfigureMockMvc
class HealthControllerTest(
    @param:Autowired private val applicationContext: ApplicationContext,
    @param:Autowired private val mockMvc: MockMvc,
) {
    @Test
    fun `returns server health payload without authentication`() {
        mockMvc.get("/internal/health")
            .andExpect {
                status { isOk() }
                jsonPath("$.service") { value("readmates-server") }
            }
    }

    @Test
    fun `does not create datasource infrastructure for this test`() {
        assertTrue(applicationContext.getBeansOfType(DataSource::class.java).isEmpty())
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
