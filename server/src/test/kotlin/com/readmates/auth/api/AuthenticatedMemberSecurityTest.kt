package com.readmates.auth.api

import com.readmates.support.MySqlTestContainer
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@AutoConfigureMockMvc
class AuthenticatedMemberSecurityTest(
    @param:Autowired private val mockMvc: MockMvc,
) {
    @Test
    fun `rejects authenticated principal without active membership from protected api`() {
        mockMvc.get("/api/sessions/current") {
            with(user("nonmember@example.com"))
        }
            .andExpect {
                status { isForbidden() }
            }
    }

    @Test
    fun `allows seeded member principal to reach protected api without explicit role`() {
        mockMvc.get("/api/sessions/current") {
            with(user("member5@example.com"))
        }
            .andExpect {
                status { isOk() }
            }
    }

    @Test
    fun `allows seeded host principal to reach host api without explicit role`() {
        mockMvc.get("/api/host/dashboard") {
            with(user("host@example.com"))
        }
            .andExpect {
                status { isOk() }
            }
    }

    @Test
    fun `rejects seeded member principal from host api`() {
        mockMvc.get("/api/host/dashboard") {
            with(user("member5@example.com"))
        }
            .andExpect {
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
