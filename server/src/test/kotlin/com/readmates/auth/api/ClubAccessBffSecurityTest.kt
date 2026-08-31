package com.readmates.auth.api

import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.HttpMethod
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.bff-secret=test-bff-secret",
        "readmates.allowed-origins=http://localhost:3000",
    ],
)
@AutoConfigureMockMvc
@Sql(
    statements = [
        "delete from membership_club_access where membership_id = '00000000-0000-0000-0000-000000000206'",
    ],
    executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
)
@Sql(
    statements = [
        "delete from membership_club_access where membership_id = '00000000-0000-0000-0000-000000000206'",
    ],
    executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
)
@Tag("integration")
class ClubAccessBffSecurityTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `trusted member bff reaches exact club access put without csrf`() {
        mockMvc
            .perform(clubAccessRequest())
            .andExpect(status().isOk)

        assertEquals(1, accessRowCount())
    }

    @Test
    fun `club access rejects missing or invalid trusted bff and origin signals`() {
        mockMvc.perform(clubAccessRequest(secret = null)).andExpect(status().isUnauthorized)
        mockMvc.perform(clubAccessRequest(secret = "invalid-secret")).andExpect(status().isUnauthorized)
        mockMvc.perform(clubAccessRequest(origin = null)).andExpect(status().isForbidden)
        mockMvc.perform(clubAccessRequest(origin = "https://evil.example.com")).andExpect(status().isForbidden)

        assertEquals(0, accessRowCount())
    }

    @Test
    fun `club access csrf exception is limited to the exact put path`() {
        mockMvc
            .perform(clubAccessRequest(method = HttpMethod.POST))
            .andExpect(status().isForbidden)
        mockMvc
            .perform(clubAccessRequest(path = "/api/me/club-access/extra"))
            .andExpect(status().isForbidden)

        assertEquals(0, accessRowCount())
    }

    @Test
    fun `browser forged cross club context cannot create an access fact`() {
        mockMvc
            .perform(clubAccessRequest(clubSlug = "sample-book-club"))
            .andExpect(status().isForbidden)

        assertEquals(0, accessRowCount())
    }

    private fun clubAccessRequest(
        method: HttpMethod = HttpMethod.PUT,
        path: String = "/api/me/club-access",
        secret: String? = "test-bff-secret",
        origin: String? = "http://localhost:3000",
        clubSlug: String = "reading-sai",
    ) = request(method, path)
        .with(user("member5@example.com"))
        .header("X-Readmates-Club-Slug", clubSlug)
        .also { builder -> secret?.let { builder.header("X-Readmates-Bff-Secret", it) } }
        .also { builder -> origin?.let { builder.header("Origin", it) } }

    private fun accessRowCount(): Int =
        requireNotNull(
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from membership_club_access
                where membership_id = '00000000-0000-0000-0000-000000000206'
                """.trimIndent(),
                Int::class.java,
            ),
        )
}
