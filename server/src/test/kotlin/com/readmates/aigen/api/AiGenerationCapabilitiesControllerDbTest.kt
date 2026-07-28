package com.readmates.aigen.api

import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.aigen.enabled=false",
    ],
)
@AutoConfigureMockMvc
@Tag("integration")
class AiGenerationCapabilitiesControllerDbTest(
    @param:Autowired private val mockMvc: MockMvc,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `disabled AI capability remains readable without calling a kill switched endpoint`() {
        mockMvc
            .get("/api/host/clubs/reading-sai/ai-generation/capabilities") {
                with(user("host@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.enabled") { value(false) }
            }
    }

    @Test
    fun `AI capability rejects members and cross club host paths`() {
        mockMvc
            .get("/api/host/clubs/reading-sai/ai-generation/capabilities") {
                with(user("member1@example.com"))
            }.andExpect {
                status { isForbidden() }
            }

        mockMvc
            .get("/api/host/clubs/another-club/ai-generation/capabilities") {
                with(user("host@example.com"))
            }.andExpect {
                status { isForbidden() }
            }
    }
}
