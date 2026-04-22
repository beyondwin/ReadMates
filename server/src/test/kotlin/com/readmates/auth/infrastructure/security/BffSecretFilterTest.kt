package com.readmates.auth.infrastructure.security

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
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.bff-secret=test-bff-secret",
    ],
)
@AutoConfigureMockMvc
class BffSecretFilterTest(
    @param:Autowired private val mockMvc: MockMvc,
) {
    @Test
    fun `protected api request without bff secret is rejected`() {
        mockMvc.get("/api/auth/me")
            .andExpect {
                status { isUnauthorized() }
            }
    }

    @Test
    fun `protected api request with bff secret reaches controller`() {
        mockMvc.get("/api/auth/me") {
            header("X-Readmates-Bff-Secret", "test-bff-secret")
        }.andExpect {
            status { isOk() }
            jsonPath("$.authenticated") { value(false) }
        }
    }

    @Test
    fun `protected api request with wrong bff secret is rejected`() {
        mockMvc.get("/api/auth/me") {
            header("X-Readmates-Bff-Secret", "wrong-secret")
        }.andExpect {
            status { isUnauthorized() }
        }
    }

    @Test
    fun `non api health path remains reachable without bff secret`() {
        mockMvc.get("/internal/health")
            .andExpect {
                status { isOk() }
                jsonPath("$.service") { value("readmates-server") }
            }
    }

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
