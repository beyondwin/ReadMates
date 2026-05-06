package com.readmates.auth.api

import com.readmates.support.MySqlTestContainer
import org.junit.jupiter.api.Test
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import org.springframework.beans.factory.annotation.Autowired

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.app-base-url=http://localhost:3000",
        "readmates.auth.session-cookie-secure=false",
    ],
)
@AutoConfigureMockMvc
class PasswordResetControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
) {
    @Test
    fun `legacy host password reset issue endpoint is gone`() {
        mockMvc.post("/api/host/members/00000000-0000-0000-0000-000000009999/password-reset") {
            with(user("host@example.com"))
        }.andExpect {
            status { isGone() }
            jsonPath("$.code") { value("GONE") }
            jsonPath("$.message") { value("더 이상 사용할 수 없는 경로입니다.") }
            jsonPath("$.status") { value(410) }
        }
    }

    @Test
    fun `legacy password reset consume endpoint is gone`() {
        mockMvc.post("/api/auth/password-reset/raw-reset-token") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"password":"new correct password","passwordConfirmation":"new correct password"}"""
        }.andExpect {
            status { isGone() }
            jsonPath("$.code") { value("GONE") }
            jsonPath("$.message") { value("더 이상 사용할 수 없는 경로입니다.") }
            jsonPath("$.status") { value(410) }
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
