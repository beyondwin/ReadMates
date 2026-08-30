package com.readmates.hostworkspace.api

import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.HttpMethod
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@SpringBootTest(
    properties =
        [
            "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
            "readmates.bff-secret=test-bff-secret",
            "readmates.allowed-origins=http://localhost:3000",
        ],
)
@AutoConfigureMockMvc
@Tag("integration")
class HostWorkboxBffSecurityTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `completed invitation work uses the old audited revision without exposing private link data`() {
        val linkId = "00000000-0000-0000-0000-000000004901"
        val eventId = "00000000-0000-0000-0000-000000004902"
        cleanupInvitationFixture(linkId)
        try {
            jdbcTemplate.update(
                """
                insert into host_invitation_links (
                  id, club_id, created_by_membership_id, name, token_hash, status,
                  max_uses, used_count, expires_at, revision, created_at, updated_at
                ) values (?, '00000000-0000-0000-0000-000000000001',
                  '00000000-0000-0000-0000-000000000201', 'Contract link', ?, 'ACTIVE',
                  10, 0, timestampadd(day, 10, utc_timestamp(6)), 4,
                  timestampadd(day, -1, utc_timestamp(6)), utc_timestamp(6))
                """.trimIndent(),
                linkId,
                "b".repeat(64),
            )
            jdbcTemplate.update(
                """
                insert into host_invitation_link_events (
                  id, link_id, club_id, revision, action, before_settings_json,
                  after_settings_json, actor_membership_id, idempotency_key_hash,
                  request_hash, occurred_at
                ) values (?, ?, '00000000-0000-0000-0000-000000000001', 4, 'UPDATED',
                  json_object('status','ACTIVE','maxUses','10','usedCount','0',
                    'expiresAt', date_format(timestampadd(day, 1, utc_timestamp(6)), '%Y-%m-%dT%H:%i:%sZ')),
                  json_object('status','ACTIVE','maxUses','10','usedCount','0',
                    'expiresAt', date_format(timestampadd(day, 10, utc_timestamp(6)), '%Y-%m-%dT%H:%i:%sZ')),
                  '00000000-0000-0000-0000-000000000201', ?, ?, utc_timestamp(6))
                """.trimIndent(),
                eventId,
                linkId,
                "c".repeat(64),
                "d".repeat(64),
            )

            val body =
                mockMvc
                    .perform(
                        get("/api/host/workbox")
                            .with(user("host@example.com"))
                            .header("X-Readmates-Bff-Secret", "test-bff-secret")
                            .header("X-Readmates-Club-Slug", "reading-sai")
                            .queryParam("state", "COMPLETED"),
                    ).andExpect(status().isOk)
                    .andExpect(
                        jsonPath("$.items[?(@.key == 'INVITATION_EXPIRY:$linkId:r3')]").exists(),
                    ).andReturn()
                    .response
                    .contentAsString

            assertFalse(body.contains("Contract link"))
            assertFalse(body.contains("${"b".repeat(16)}"))
        } finally {
            cleanupInvitationFixture(linkId)
        }
    }

    @Test
    fun `host read evaluates source owned queries while member read is forbidden`() {
        val response =
            mockMvc
                .perform(
                    get("/api/host/workbox")
                        .with(user("host@example.com"))
                        .header("X-Readmates-Bff-Secret", "test-bff-secret")
                        .header("X-Readmates-Club-Slug", "reading-sai")
                        .queryParam("state", "NOW")
                        .queryParam("limit", "2"),
                ).andExpect(status().isOk)
                .andExpect(jsonPath("$.evaluatedAt").isString)
                .andExpect(jsonPath("$.items").isArray)
                .andReturn()
                .response
                .contentAsString
        assertFalse(response.contains("errorMessage"))
        assertFalse(response.contains("destination\""))
        assertFalse(response.contains("@"))

        mockMvc
            .perform(
                get("/api/host/workbox")
                    .with(user("member5@example.com"))
                    .header("X-Readmates-Bff-Secret", "test-bff-secret")
                    .header("X-Readmates-Club-Slug", "reading-sai"),
            ).andExpect(status().isForbidden)
    }

    @Test
    fun `exact put and delete reach controller with trusted bff origin and no spring csrf token`() {
        mockMvc.perform(workboxRequest(HttpMethod.PUT)).andExpect(status().isBadRequest)
        mockMvc
            .perform(
                workboxRequest(
                    HttpMethod.DELETE,
                    path = "/api/host/workbox/items/${"x".repeat(256)}/deferral",
                ),
            ).andExpect(status().isBadRequest)
    }

    @Test
    fun `mutations reject missing invalid secret and missing invalid origin`() {
        mockMvc
            .perform(workboxRequest(HttpMethod.PUT, secret = null))
            .andExpect(status().isUnauthorized)
        mockMvc
            .perform(workboxRequest(HttpMethod.PUT, secret = "invalid-secret"))
            .andExpect(status().isUnauthorized)
        mockMvc
            .perform(workboxRequest(HttpMethod.PUT, origin = null))
            .andExpect(status().isForbidden)
        mockMvc
            .perform(workboxRequest(HttpMethod.PUT, origin = "https://evil.example.com"))
            .andExpect(status().isForbidden)
    }

    @Test
    fun `forged browser role headers authority loss and cross club scope fail closed`() {
        mockMvc
            .perform(
                workboxRequest(
                    HttpMethod.PUT,
                    username = "member5@example.com",
                    forgedRole = "HOST",
                ),
            ).andExpect(status().isForbidden)
        mockMvc
            .perform(workboxRequest(HttpMethod.DELETE, clubSlug = "sample-book-club"))
            .andExpect(status().isForbidden)
    }

    @Test
    fun `csrf exception is exact to put and delete deferral paths`() {
        mockMvc.perform(workboxRequest(HttpMethod.POST)).andExpect(status().isForbidden)
        mockMvc
            .perform(
                workboxRequest(
                    HttpMethod.PUT,
                    path = "/api/host/workbox/items/not-authoritative/deferral/extra",
                ),
            ).andExpect(status().isForbidden)
    }

    private fun workboxRequest(
        method: HttpMethod,
        path: String = "/api/host/workbox/items/not-authoritative/deferral",
        username: String = "host@example.com",
        secret: String? = "test-bff-secret",
        origin: String? = "http://localhost:3000",
        clubSlug: String = "reading-sai",
        forgedRole: String? = null,
    ) = request(method, path)
        .with(user(username))
        .header("X-Readmates-Club-Slug", clubSlug)
        .contentType(MediaType.APPLICATION_JSON)
        .content("""{"deferredUntil":"not-time"}""")
        .also { builder -> secret?.let { builder.header("X-Readmates-Bff-Secret", it) } }
        .also { builder -> origin?.let { builder.header("Origin", it) } }
        .also { builder -> forgedRole?.let { builder.header("X-Readmates-Role", it) } }

    private fun cleanupInvitationFixture(linkId: String) {
        jdbcTemplate.update("delete from host_invitation_link_events where link_id = ?", linkId)
        jdbcTemplate.update("delete from host_invitation_links where id = ?", linkId)
    }
}
