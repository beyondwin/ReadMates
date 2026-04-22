package com.readmates.note.api

import com.readmates.support.MySqlTestContainer
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.bff-secret=test-bff-secret",
        "readmates.allowed-origins=http://localhost:3000",
    ],
)
@AutoConfigureMockMvc
class ReviewBffSecurityTest(
    @param:Autowired private val mockMvc: MockMvc,
) {
    @Test
    fun `one-line review bff request reaches controller without spring csrf token`() {
        mockMvc.post("/api/sessions/current/one-line-reviews") {
            with(user("member5@example.com"))
            header("X-Readmates-Bff-Secret", "test-bff-secret")
            header("Origin", "http://localhost:3000")
            contentType = MediaType.APPLICATION_JSON
            content = """{"text":"BFF 한줄평"}"""
        }.andExpect {
            status { isConflict() }
        }
    }

    @Test
    fun `long review bff request reaches controller without spring csrf token`() {
        mockMvc.post("/api/sessions/current/reviews") {
            with(user("member5@example.com"))
            header("X-Readmates-Bff-Secret", "test-bff-secret")
            header("Origin", "http://localhost:3000")
            contentType = MediaType.APPLICATION_JSON
            content = """{"body":"BFF 장문 서평"}"""
        }.andExpect {
            status { isConflict() }
        }
    }

    @Test
    fun `review bff request without origin is rejected before controller`() {
        mockMvc.post("/api/sessions/current/reviews") {
            with(user("member5@example.com"))
            header("X-Readmates-Bff-Secret", "test-bff-secret")
            contentType = MediaType.APPLICATION_JSON
            content = """{"body":"missing origin"}"""
        }.andExpect {
            status { isForbidden() }
        }
    }

    @Test
    fun `review bff request with disallowed origin is rejected before controller`() {
        mockMvc.post("/api/sessions/current/reviews") {
            with(user("member5@example.com"))
            header("X-Readmates-Bff-Secret", "test-bff-secret")
            header("Origin", "https://attacker.example")
            contentType = MediaType.APPLICATION_JSON
            content = """{"body":"bad origin"}"""
        }.andExpect {
            status { isForbidden() }
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
