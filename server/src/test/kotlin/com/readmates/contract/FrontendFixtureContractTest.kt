package com.readmates.contract

import com.readmates.support.MySqlTestContainer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.nio.file.Paths

/**
 * Contract tests that verify server MockMvc responses match the top-level JSON key shapes
 * defined in frontend fixture files under front/tests/unit/__fixtures__/.
 *
 * The fixture files are the single source of truth for the expected shape.
 * If a fixture key set diverges from the actual server response, this test fails.
 * Intentional shape changes require updating both the fixture and this test together.
 */
@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@AutoConfigureMockMvc
class FrontendFixtureContractTest @Autowired constructor(
    private val mockMvc: MockMvc,
    private val objectMapper: ObjectMapper,
    private val jdbcTemplate: JdbcTemplate,
) {
    private val fixturesDir = Paths.get(
        System.getProperty("readmates.frontend.fixtures.dir")
            ?: error("System property 'readmates.frontend.fixtures.dir' is not set"),
    )

    // Seeded host session: session 1 (팩트풀니스), state=PUBLISHED, visibility=PUBLIC
    private val seededHostSessionId = "00000000-0000-0000-0000-000000000301"

    @Test
    fun `current session empty response matches frontend fixture key set`() {
        val response = mockMvc.get("/api/sessions/current") {
            with(user("member5@example.com"))
        }.andExpect {
            status { isOk() }
        }.andReturn().response.contentAsString

        assertTopLevelKeySetMatches(response, "current-session-empty.json")
    }

    @Test
    fun `archive session page response matches frontend fixture key set`() {
        val response = mockMvc.get("/api/archive/sessions") {
            with(user("member5@example.com"))
        }.andExpect {
            status { isOk() }
        }.andReturn().response.contentAsString

        assertTopLevelKeySetMatches(response, "archive-session-page.json")
    }

    @Test
    fun `host session detail response matches frontend fixture key set`() {
        val response = mockMvc.get("/api/host/sessions/$seededHostSessionId") {
            with(user("host@example.com"))
        }.andExpect {
            status { isOk() }
        }.andReturn().response.contentAsString

        assertTopLevelKeySetMatches(response, "host-session-detail.json")
    }

    @Test
    fun `host notification delivery list response matches frontend fixture key set`() {
        val response = mockMvc.get("/api/host/notifications/deliveries") {
            with(user("host@example.com"))
        }.andExpect {
            status { isOk() }
        }.andReturn().response.contentAsString

        assertTopLevelKeySetMatches(response, "host-notification-delivery-list.json")
    }

    private fun assertTopLevelKeySetMatches(actualJson: String, fixtureFileName: String) {
        val fixtureFile = fixturesDir.resolve(fixtureFileName).toFile()
        check(fixtureFile.exists()) {
            "Frontend fixture file not found: ${fixtureFile.absolutePath}. " +
                "Ensure 'readmates.frontend.fixtures.dir' points to front/tests/unit/__fixtures__."
        }

        val actual: JsonNode = objectMapper.readTree(actualJson)
        val expected: JsonNode = objectMapper.readTree(fixtureFile)

        val actualKeys = actual.propertyNames().toSet()
        val expectedKeys = expected.propertyNames().toSet()

        assertThat(actualKeys)
            .describedAs(
                "Top-level JSON key set from server response must match fixture '$fixtureFileName'.\n" +
                    "Keys in server response but not in fixture: ${actualKeys - expectedKeys}\n" +
                    "Keys in fixture but not in server response: ${expectedKeys - actualKeys}",
            )
            .isEqualTo(expectedKeys)
    }

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
