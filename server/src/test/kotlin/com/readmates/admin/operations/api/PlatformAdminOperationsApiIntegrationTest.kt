package com.readmates.admin.operations.api

import com.readmates.auth.application.service.AuthSessionService
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import jakarta.servlet.http.Cookie
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import java.util.UUID

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.auth.session-cookie-secure=false",
        "readmates.bff-secret=test-bff-secret",
        "readmates.allowed-origins=http://localhost:3000",
        "readmates.ai-generation.enabled=false",
    ],
)
@AutoConfigureMockMvc
@Tag("integration")
class PlatformAdminOperationsApiIntegrationTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val authSessionService: AuthSessionService,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val createdSessionTokenHashes = linkedSetOf<String>()

    @BeforeEach
    fun prepare() {
        cleanOperationRows()
        jdbcTemplate.update("delete from platform_admins where user_id = ?", DISABLED_ADMIN_ID)
        jdbcTemplate.update("delete from users where id = ?", DISABLED_ADMIN_ID)
    }

    @AfterEach
    fun cleanup() {
        cleanOperationRows()
        if (createdSessionTokenHashes.isNotEmpty()) {
            val placeholders = createdSessionTokenHashes.joinToString(",") { "?" }
            jdbcTemplate.update(
                "delete from auth_sessions where session_token_hash in ($placeholders)",
                *createdSessionTokenHashes.toTypedArray(),
            )
        }
        createdSessionTokenHashes.clear()
        jdbcTemplate.update("delete from platform_admins where user_id = ?", DISABLED_ADMIN_ID)
        jdbcTemplate.update("delete from users where id = ?", DISABLED_ADMIN_ID)
    }

    @Test
    fun `anonymous host and disabled platform admin are denied`() {
        mockMvc
            .get("/api/admin/operations/cases") {
                header(BFF_SECRET_HEADER, BFF_SECRET)
            }.andExpect {
                status { isUnauthorized() }
            }

        mockMvc
            .get("/api/admin/operations/cases") {
                header(BFF_SECRET_HEADER, BFF_SECRET)
                cookie(sessionCookieForUser(HOST_USER_ID))
            }.andExpect {
                status { isForbidden() }
            }

        seedDisabledAdmin()
        mockMvc
            .get("/api/admin/operations/cases") {
                header(BFF_SECRET_HEADER, BFF_SECRET)
                cookie(sessionCookieForUser(DISABLED_ADMIN_ID))
            }.andExpect {
                status { isForbidden() }
            }
    }

    @Test
    fun `owner and operator acknowledge through trusted BFF without spring csrf token`() {
        val cases = listOf(OWNER_USER_ID to OWNER_CASE_ID, OPERATOR_USER_ID to OPERATOR_CASE_ID)
        cases.forEach { (actorId, caseId) ->
            seedCase(caseId = caseId, sourceKey = "AI_JOB:$caseId", version = 0)

            mockMvc
                .post("/api/admin/operations/cases/$caseId/acknowledge") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"expectedVersion":0}"""
                    header(BFF_SECRET_HEADER, BFF_SECRET)
                    header("Origin", ALLOWED_ORIGIN)
                    cookie(sessionCookieForUser(actorId))
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.schema") { value("admin.operation_cases.v1") }
                    jsonPath("$.state") { value("ACKNOWLEDGED") }
                    jsonPath("$.assignedToMe") { value(true) }
                    jsonPath("$.version") { value(1) }
                    jsonPath("$.sourceKey") { doesNotExist() }
                    jsonPath("$.assigneeAdminId") { doesNotExist() }
                }

            assertThat(
                jdbcTemplate.queryForObject(
                    "select assignee_admin_id from admin_operation_cases where id = ?",
                    String::class.java,
                    caseId,
                ),
            ).isEqualTo(actorId)
            assertThat(
                jdbcTemplate.queryForObject(
                    "select count(*) from admin_operation_case_events where case_id = ? and actor_admin_id = ?",
                    Int::class.java,
                    caseId,
                    actorId,
                ),
            ).isEqualTo(1)
        }
    }

    @Test
    fun `mutation still requires trusted BFF secret and allowed origin`() {
        seedCase(caseId = BFF_CASE_ID, sourceKey = "AI_JOB:$BFF_CASE_ID", version = 0)
        val ownerCookie = sessionCookieForUser(OWNER_USER_ID)

        mockMvc
            .post("/api/admin/operations/cases/$BFF_CASE_ID/acknowledge") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"expectedVersion":0}"""
                header("Origin", ALLOWED_ORIGIN)
                cookie(ownerCookie)
            }.andExpect {
                status { isUnauthorized() }
            }

        mockMvc
            .post("/api/admin/operations/cases/$BFF_CASE_ID/acknowledge") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"expectedVersion":0}"""
                header(BFF_SECRET_HEADER, BFF_SECRET)
                cookie(ownerCookie)
            }.andExpect {
                status { isForbidden() }
            }

        assertThat(caseVersion(BFF_CASE_ID)).isZero()
        assertThat(eventCount(BFF_CASE_ID)).isZero()
    }

    @Test
    fun `support reads safe projections but mutation is forbidden`() {
        seedCase(caseId = SUPPORT_CASE_ID, sourceKey = INTERNAL_SOURCE_SENTINEL, version = 0)
        seedSourceFreshness()

        val body =
            mockMvc
                .get("/api/admin/operations/cases/$SUPPORT_CASE_ID") {
                    header(BFF_SECRET_HEADER, BFF_SECRET)
                    cookie(sessionCookieForUser(SUPPORT_USER_ID))
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.schema") { value("admin.operation_cases.v1") }
                    jsonPath("$.item.id") { value(SUPPORT_CASE_ID) }
                    jsonPath("$.item.allowedActions") { isEmpty() }
                    jsonPath("$.item.sourceType") { value("AI_JOB") }
                    jsonPath("$.item.sourceKey") { doesNotExist() }
                    jsonPath("$.item.assigneeAdminId") { doesNotExist() }
                }.andReturn()
                .response
                .contentAsString

        assertThat(body).doesNotContain(INTERNAL_SOURCE_SENTINEL)

        mockMvc
            .post("/api/admin/operations/cases/$SUPPORT_CASE_ID/acknowledge") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"expectedVersion":0}"""
                header(BFF_SECRET_HEADER, BFF_SECRET)
                header("Origin", ALLOWED_ORIGIN)
                cookie(sessionCookieForUser(SUPPORT_USER_ID))
            }.andExpect {
                status { isForbidden() }
                jsonPath("$.code") { value("PERMISSION_DENIED") }
                jsonPath("$.message") { value("이 작업을 수행할 권한이 없습니다.") }
                jsonPath("$.status") { value(403) }
            }

        assertThat(caseVersion(SUPPORT_CASE_ID)).isZero()
        assertThat(eventCount(SUPPORT_CASE_ID)).isZero()
    }

    @Test
    fun `stale mutation returns version conflict without writing an event`() {
        seedCase(caseId = VERSION_CASE_ID, sourceKey = "AI_JOB:$VERSION_CASE_ID", version = 2)

        mockMvc
            .post("/api/admin/operations/cases/$VERSION_CASE_ID/acknowledge") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"expectedVersion":1}"""
                header(BFF_SECRET_HEADER, BFF_SECRET)
                header("Origin", ALLOWED_ORIGIN)
                cookie(sessionCookieForUser(OWNER_USER_ID))
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("CASE_VERSION_CONFLICT") }
                jsonPath("$.message") { value("다른 운영자가 먼저 상태를 변경했습니다.") }
                jsonPath("$.status") { value(409) }
            }

        assertThat(caseVersion(VERSION_CASE_ID)).isEqualTo(2)
        assertThat(eventCount(VERSION_CASE_ID)).isZero()
    }

    @Test
    fun `resolve fails closed when source verification is unavailable`() {
        seedCase(caseId = UNAVAILABLE_CASE_ID, sourceKey = "AI_JOB:$UNAVAILABLE_CASE_ID", version = 0)

        mockMvc
            .post("/api/admin/operations/cases/$UNAVAILABLE_CASE_ID/resolve") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"expectedVersion":0}"""
                header(BFF_SECRET_HEADER, BFF_SECRET)
                header("Origin", ALLOWED_ORIGIN)
                cookie(sessionCookieForUser(OPERATOR_USER_ID))
            }.andExpect {
                status { isServiceUnavailable() }
                jsonPath("$.code") { value("CASE_SOURCE_UNAVAILABLE") }
                jsonPath("$.message") { value("운영 신호를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.") }
                jsonPath("$.status") { value(503) }
            }

        assertThat(caseState(UNAVAILABLE_CASE_ID)).isEqualTo("OPEN")
        assertThat(caseVersion(UNAVAILABLE_CASE_ID)).isZero()
        assertThat(eventCount(UNAVAILABLE_CASE_ID)).isZero()
    }

    private fun seedDisabledAdmin() {
        jdbcTemplate.update(
            """
            insert into users (id, email, name, short_name, auth_provider)
            values (?, 'disabled-admin@example.test', 'Disabled Admin', 'Disabled', 'GOOGLE')
            """.trimIndent(),
            DISABLED_ADMIN_ID,
        )
        jdbcTemplate.update(
            "insert into platform_admins (user_id, role, status) values (?, 'OPERATOR', 'DISABLED')",
            DISABLED_ADMIN_ID,
        )
    }

    private fun seedCase(
        caseId: String,
        sourceKey: String,
        version: Long,
    ) {
        jdbcTemplate.update(
            """
            insert into admin_operation_cases (
              id, source_type, source_key, club_id, state, severity, safe_summary_code,
              first_observed_at, last_observed_at, assignee_admin_id, reopen_count, version,
              impact_count, detail_href
            )
            values (?, 'AI_JOB', ?, null, 'OPEN', 'CRITICAL', 'AI_JOB_STALE',
                    '2026-08-04 00:00:00.000000', '2026-08-04 00:05:00.000000', null, 0, ?, 1,
                    '/admin/ai-ops')
            """.trimIndent(),
            caseId,
            sourceKey,
            version,
        )
    }

    private fun seedSourceFreshness() {
        jdbcTemplate.update(
            """
            insert into admin_operation_source_status (
              source_type, status, attempted_at, last_successful_at, authoritative
            )
            values ('AI_JOB', 'DISABLED', '2026-08-04 00:05:00.000000', null, false)
            """.trimIndent(),
        )
    }

    private fun cleanOperationRows() {
        jdbcTemplate.update("delete from admin_operation_case_events")
        jdbcTemplate.update("delete from admin_operation_cases")
        jdbcTemplate.update("delete from admin_operation_source_status")
    }

    private fun caseVersion(caseId: String): Long =
        jdbcTemplate.queryForObject(
            "select version from admin_operation_cases where id = ?",
            Long::class.java,
            caseId,
        ) ?: -1

    private fun caseState(caseId: String): String =
        jdbcTemplate
            .queryForObject(
                "select state from admin_operation_cases where id = ?",
                String::class.java,
                caseId,
            ).orEmpty()

    private fun eventCount(caseId: String): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from admin_operation_case_events where case_id = ?",
            Int::class.java,
            caseId,
        ) ?: -1

    private fun sessionCookieForUser(userId: String): Cookie {
        val issuedSession =
            authSessionService.issueSession(
                userId = UUID.fromString(userId).toString(),
                userAgent = "PlatformAdminOperationsApiIntegrationTest",
                ipAddress = "127.0.0.1",
            )
        createdSessionTokenHashes += issuedSession.storedTokenHash
        return Cookie(AuthSessionService.COOKIE_NAME, issuedSession.rawToken)
    }

    private companion object {
        const val BFF_SECRET_HEADER = "X-Readmates-Bff-Secret"
        const val BFF_SECRET = "test-bff-secret"
        const val ALLOWED_ORIGIN = "http://localhost:3000"
        const val OWNER_USER_ID = "00000000-0000-0000-0000-000000000901"
        const val OPERATOR_USER_ID = "00000000-0000-0000-0000-000000000902"
        const val SUPPORT_USER_ID = "00000000-0000-0000-0000-000000000903"
        const val HOST_USER_ID = "00000000-0000-0000-0000-000000000101"
        const val DISABLED_ADMIN_ID = "00000000-0000-0000-0000-00000000a699"
        const val OWNER_CASE_ID = "00000000-0000-0000-0000-00000000c611"
        const val OPERATOR_CASE_ID = "00000000-0000-0000-0000-00000000c612"
        const val SUPPORT_CASE_ID = "00000000-0000-0000-0000-00000000c613"
        const val VERSION_CASE_ID = "00000000-0000-0000-0000-00000000c614"
        const val UNAVAILABLE_CASE_ID = "00000000-0000-0000-0000-00000000c615"
        const val BFF_CASE_ID = "00000000-0000-0000-0000-00000000c616"
        const val INTERNAL_SOURCE_SENTINEL = "AI_JOB:INTERNAL_SOURCE_SENTINEL"
    }
}
