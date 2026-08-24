package com.readmates.session.api

import com.readmates.auth.application.port.out.AllowedOriginPort
import com.readmates.auth.infrastructure.security.BffSecretFilter
import com.readmates.auth.infrastructure.security.HostClientContractMode
import com.readmates.auth.infrastructure.security.HostClientContractProperties
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Profile
import org.springframework.http.HttpMethod
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockHttpServletRequestDsl
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.test.web.servlet.setup.StandaloneMockMvcBuilder
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestMethod
import org.springframework.web.bind.annotation.RestController
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import java.util.stream.Stream

private const val CLEANUP_BFF_DELETE_SESSION_SQL = """
    delete from public_session_publications
    where session_id in (
      '00000000-0000-0000-0000-000000009888',
      '00000000-0000-0000-0000-00000000b888'
    );
    delete from host_session_change_audit
    where session_id in (
      '00000000-0000-0000-0000-000000009888',
      '00000000-0000-0000-0000-00000000b888'
    );
    delete from host_session_lifecycle_audit
    where session_id in (
      '00000000-0000-0000-0000-000000009888',
      '00000000-0000-0000-0000-00000000b888'
    );
    delete from session_participants
    where session_id in (
      '00000000-0000-0000-0000-000000009888',
      '00000000-0000-0000-0000-00000000b888'
    );
    delete from sessions
    where id in (
      '00000000-0000-0000-0000-000000009888',
      '00000000-0000-0000-0000-00000000b888'
    );
    delete from memberships
    where id in (
      '00000000-0000-0000-0000-000000009216',
      '00000000-0000-0000-0000-00000000b201'
    );
    delete from users
    where id in (
      '00000000-0000-0000-0000-000000009116',
      '00000000-0000-0000-0000-00000000b101'
    );
"""

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
        CLEANUP_BFF_DELETE_SESSION_SQL,
    ],
    executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
)
@Sql(
    statements = [
        CLEANUP_BFF_DELETE_SESSION_SQL,
    ],
    executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
)
@Tag("integration")
class HostSessionBffSecurityTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    @ParameterizedTest
    @MethodSource("backendPolicyCases")
    fun `spring dispatch applies every backend policy before controller side effects`(case: BackendPolicyCase) {
        val probe = CompatibilityMutationProbeController()
        val policyMockMvc = compatibilityPolicyMockMvc(case.mode, probe)
        val request =
            request(HttpMethod.POST, "/api/host/invitations")
                .header("X-Readmates-Bff-Secret", "test-bff-secret")
                .header("Origin", "http://localhost:3000")
                .contentType(MediaType.APPLICATION_JSON)
                .content(INVITATION_BODY)
        case.generation?.let { request.header("X-Readmates-Client-Contract", it) }

        val result = policyMockMvc.perform(request).andExpect(status().`is`(case.expectedStatus))
        case.expectedCode?.let { result.andExpect(jsonPath("$.code").value(it)) }

        if (case.expectedStatus == 204) {
            assertEquals(1, probe.domainMutationCount.get())
            assertEquals(INVITATION_BODY, probe.lastBody.get())
        } else {
            assertEquals(0, probe.domainMutationCount.get())
            assertEquals(null, probe.lastBody.get())
        }
    }

    @ParameterizedTest
    @MethodSource("nonSessionV3Cases")
    fun `support mode preserves v3 non session request bodies`(case: NonSessionV3Case) {
        val probe = CompatibilityMutationProbeController()
        val policyMockMvc = compatibilityPolicyMockMvc(HostClientContractMode.SUPPORT_V2_V3, probe)
        val request =
            request(case.method, case.path)
                .header("X-Readmates-Bff-Secret", "test-bff-secret")
                .header("X-Readmates-Client-Contract", "v3")
                .header("Origin", "http://localhost:3000")
        case.body?.let {
            request.contentType(MediaType.APPLICATION_JSON).content(it)
        }

        policyMockMvc.perform(request).andExpect(status().isNoContent)

        assertEquals(1, probe.domainMutationCount.get())
        assertEquals(case.body, probe.lastBody.get())
    }

    private fun compatibilityPolicyMockMvc(
        mode: HostClientContractMode,
        probe: CompatibilityMutationProbeController,
    ): MockMvc =
        MockMvcBuilders
            .standaloneSetup(probe)
            .addFilters<StandaloneMockMvcBuilder>(
                BffSecretFilter(
                    configuredSecretsRaw = "",
                    legacyExpectedSecret = "test-bff-secret",
                    bffSecretRequired = true,
                    allowedOriginPort =
                        object : AllowedOriginPort {
                            override fun isAllowed(origin: String) = origin == "http://localhost:3000"
                        },
                    hostClientContractProperties = HostClientContractProperties(mode = mode.name),
                ),
            ).build()

    @ParameterizedTest
    @MethodSource("recordMutationCases")
    fun `trusted host bff reaches every record mutation controller without csrf`(case: RecordMutationCase) {
        val request =
            request(case.method, case.path)
                .with(user("host@example.com"))
                .header("X-Readmates-Bff-Secret", "test-bff-secret")
                .header("Origin", "http://localhost:3000")
        case.body?.let {
            request
                .contentType(MediaType.APPLICATION_JSON)
                .content(it)
        }

        mockMvc.perform(request).andExpect(status().isNotFound)
    }

    @Test
    fun `record mutations still reject missing invalid bff secret and non host identity`() {
        fun requestWith(
            username: String,
            secret: String?,
        ) = request(
            HttpMethod.PATCH,
            "/api/host/sessions/00000000-0000-0000-0000-000000009998/record-draft",
        ).with(user(username))
            .header("Origin", "http://localhost:3000")
            .contentType(MediaType.APPLICATION_JSON)
            .content(RECORD_DRAFT_BODY)
            .also { builder -> secret?.let { builder.header("X-Readmates-Bff-Secret", it) } }

        mockMvc.perform(requestWith("host@example.com", null)).andExpect(status().isUnauthorized)
        mockMvc.perform(requestWith("host@example.com", "invalid-secret")).andExpect(status().isUnauthorized)
        mockMvc.perform(requestWith("member5@example.com", "test-bff-secret")).andExpect(status().isForbidden)
    }

    @Test
    fun `host delete bff request reaches controller without spring csrf token`() {
        createOpenSession()

        mockMvc
            .delete("/api/host/sessions/00000000-0000-0000-0000-000000009888") {
                with(user("host@example.com"))
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("Origin", "http://localhost:3000")
                withExpectedRevision(SESSION_ID)
            }.andExpect {
                status { isOk() }
                jsonPath("$.sessionId") { value("00000000-0000-0000-0000-000000009888") }
                jsonPath("$.sessionNumber") { value(88) }
                jsonPath("$.trashed") { value(true) }
                jsonPath("$.counts.participants") { value(6) }
            }

        assertEquals(1, countRows("sessions", "id = '00000000-0000-0000-0000-000000009888' and deleted_at is not null"))
        assertEquals(6, countRows("session_participants", "session_id = '00000000-0000-0000-0000-000000009888'"))
    }

    @ParameterizedTest
    @MethodSource("recoveryAndTrashMutationCases")
    fun `trusted host bff reaches recovery and trash mutations without csrf`(case: RecordMutationCase) {
        val request =
            request(case.method, case.path)
                .with(user("host@example.com"))
                .header("X-Readmates-Bff-Secret", "test-bff-secret")
                .header("Origin", "http://localhost:3000")
        case.body?.let {
            request
                .contentType(MediaType.APPLICATION_JSON)
                .content(it)
        }

        mockMvc.perform(request).andExpect(status().isNotFound)
    }

    @Test
    fun `recovery and trash mutations reject viewer member and other club`() {
        createViewerMembership()
        createDraftSession()
        val changeId = patchTitle("BFF 복원 대상 제목")
        createOutsideClubSession()

        fun restoreChange(
            username: String,
            sessionId: String = SESSION_ID,
            targetChangeId: String = changeId,
        ) = request(
            HttpMethod.POST,
            "/api/host/sessions/$sessionId/changes/$targetChangeId/restore",
        ).with(user(username))
            .header("X-Readmates-Bff-Secret", "test-bff-secret")
            .header("Origin", "http://localhost:3000")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""{"expectedCurrentHash":"${"a".repeat(64)}"}""")

        fun restoreSession(
            username: String,
            sessionId: String = SESSION_ID,
        ) = request(HttpMethod.POST, "/api/host/sessions/$sessionId/restore")
            .with(user(username))
            .header("X-Readmates-Bff-Secret", "test-bff-secret")
            .header("Origin", "http://localhost:3000")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""{"expectedSessionRevision":${sessionRevision(sessionId)}}""")

        mockMvc.perform(restoreChange("recovery.viewer@example.com")).andExpect(status().isForbidden)
        mockMvc.perform(restoreSession("recovery.viewer@example.com")).andExpect(status().isForbidden)
        mockMvc.perform(restoreChange("member5@example.com")).andExpect(status().isForbidden)
        mockMvc.perform(restoreSession("member5@example.com")).andExpect(status().isForbidden)
        mockMvc
            .perform(restoreChange("host@example.com", OUTSIDE_SESSION_ID, OUTSIDE_CHANGE_ID))
            .andExpect(status().isNotFound)
        mockMvc
            .perform(restoreSession("host@example.com", OUTSIDE_SESSION_ID))
            .andExpect(status().isNotFound)
    }

    @Test
    fun `host session restore bff request reaches controller without spring csrf token`() {
        createDraftSession()
        mockMvc
            .delete("/api/host/sessions/00000000-0000-0000-0000-000000009888") {
                with(user("host@example.com"))
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("Origin", "http://localhost:3000")
                withExpectedRevision(SESSION_ID)
            }.andExpect { status { isOk() } }

        mockMvc
            .post("/api/host/sessions/00000000-0000-0000-0000-000000009888/restore") {
                with(user("host@example.com"))
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("Origin", "http://localhost:3000")
                withExpectedRevision(SESSION_ID)
            }.andExpect {
                status { isOk() }
                jsonPath("$.sessionId") { value("00000000-0000-0000-0000-000000009888") }
                jsonPath("$.state") { value("DRAFT") }
            }

        assertEquals(1, countRows("sessions", "id = '00000000-0000-0000-0000-000000009888' and deleted_at is null"))
    }

    @Test
    fun `host visibility bff request reaches controller without spring csrf token`() {
        createDraftSession()

        mockMvc
            .patch("/api/host/sessions/00000000-0000-0000-0000-000000009888/visibility") {
                with(user("host@example.com"))
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("Origin", "http://localhost:3000")
                contentType = MediaType.APPLICATION_JSON
                content = """{"visibility":"MEMBER"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.session.sessionId") { value("00000000-0000-0000-0000-000000009888") }
                jsonPath("$.session.visibility") { value("MEMBER") }
                jsonPath("$.composer.eventType") { value("NEXT_BOOK_PUBLISHED") }
            }

        assertEquals(
            0,
            countRows("notification_event_outbox", "aggregate_id = '00000000-0000-0000-0000-000000009888'"),
        )
        assertEquals(
            0,
            countRows("host_action_notification_decisions", "session_id = '00000000-0000-0000-0000-000000009888'"),
        )
    }

    @Test
    fun `host access scope accepts trusted host bff and rejects missing identity secret or host role`() {
        createDraftSession()

        fun accessScopeRequest(
            username: String,
            secret: String? = "test-bff-secret",
        ) = request(
            HttpMethod.PATCH,
            "/api/host/sessions/00000000-0000-0000-0000-000000009888/access-scope",
        ).with(user(username))
            .header("X-Readmates-Client-Contract", "v2")
            .header("Origin", "http://localhost:3000")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""{"accessScope":"GUEST_READABLE"}""")
            .also { builder -> secret?.let { builder.header("X-Readmates-Bff-Secret", it) } }

        mockMvc.perform(accessScopeRequest("host@example.com")).andExpect(status().isOk)
        assertEquals(
            "GUEST_READABLE",
            jdbcTemplate.queryForObject(
                "select access_scope from sessions where id = '00000000-0000-0000-0000-000000009888'",
                String::class.java,
            ),
        )

        mockMvc
            .perform(
                request(
                    HttpMethod.PATCH,
                    "/api/host/sessions/00000000-0000-0000-0000-000000009888/access-scope",
                ).header("X-Readmates-Bff-Secret", "test-bff-secret")
                    .header("X-Readmates-Client-Contract", "v2")
                    .header("Origin", "http://localhost:3000")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("""{"accessScope":"HOST_ONLY"}"""),
            ).andExpect(status().isUnauthorized)
        mockMvc.perform(accessScopeRequest("host@example.com", null)).andExpect(status().isUnauthorized)
        mockMvc.perform(accessScopeRequest("member5@example.com")).andExpect(status().isForbidden)
    }

    @Test
    fun `host open bff request reaches controller without spring csrf token`() {
        createDraftSession()

        mockMvc
            .post("/api/host/sessions/00000000-0000-0000-0000-000000009888/open") {
                with(user("host@example.com"))
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("Origin", "http://localhost:3000")
                withExpectedRevision(SESSION_ID)
            }.andExpect {
                status { isOk() }
                jsonPath("$.sessionId") { value("00000000-0000-0000-0000-000000009888") }
                jsonPath("$.state") { value("OPEN") }
                jsonPath("$.accessScope") { value("GUEST_READABLE") }
                jsonPath("$.siteVisibility") { value("HIDDEN") }
                jsonPath("$.visibility") { value("MEMBER") }
            }

        assertEquals(6, countRows("session_participants", "session_id = '00000000-0000-0000-0000-000000009888'"))
        assertEquals(
            "GUEST_READABLE",
            jdbcTemplate.queryForObject(
                "select access_scope from sessions where id = '00000000-0000-0000-0000-000000009888'",
                String::class.java,
            ),
        )
    }

    @Test
    fun `host close bff request reaches controller without spring csrf token`() {
        createOpenSession()

        mockMvc
            .post("/api/host/sessions/00000000-0000-0000-0000-000000009888/close") {
                with(user("host@example.com"))
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("Origin", "http://localhost:3000")
                withExpectedRevision(SESSION_ID)
            }.andExpect {
                status { isOk() }
                jsonPath("$.sessionId") { value("00000000-0000-0000-0000-000000009888") }
                jsonPath("$.state") { value("CLOSED") }
            }
    }

    @Test
    fun `host publish bff request reaches controller without spring csrf token`() {
        createClosedPublicSession()

        mockMvc
            .post("/api/host/sessions/00000000-0000-0000-0000-000000009888/publish") {
                with(user("host@example.com"))
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("Origin", "http://localhost:3000")
                withExpectedRevision(SESSION_ID)
            }.andExpect {
                status { isOk() }
                jsonPath("$.sessionId") { value("00000000-0000-0000-0000-000000009888") }
                jsonPath("$.state") { value("PUBLISHED") }
                jsonPath("$.publication.visibility") { value("PUBLIC") }
            }
    }

    @Test
    fun `host reopen bff request reaches controller without spring csrf token`() {
        createClosedSession()

        mockMvc
            .post("/api/host/sessions/00000000-0000-0000-0000-000000009888/reopen") {
                with(user("host@example.com"))
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("Origin", "http://localhost:3000")
                withExpectedRevision(SESSION_ID)
            }.andExpect {
                status { isOk() }
                jsonPath("$.sessionId") { value("00000000-0000-0000-0000-000000009888") }
                jsonPath("$.state") { value("OPEN") }
            }

        assertEquals(
            "OPEN",
            jdbcTemplate.queryForObject(
                "select state from sessions where id = '00000000-0000-0000-0000-000000009888'",
                String::class.java,
            ),
        )
    }

    @Test
    fun `host unpublish bff request reaches controller without spring csrf token`() {
        createPublishedSession()

        mockMvc
            .post("/api/host/sessions/00000000-0000-0000-0000-000000009888/unpublish") {
                with(user("host@example.com"))
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("Origin", "http://localhost:3000")
                withExpectedRevision(SESSION_ID)
            }.andExpect {
                status { isOk() }
                jsonPath("$.sessionId") { value("00000000-0000-0000-0000-000000009888") }
                jsonPath("$.state") { value("CLOSED") }
            }

        assertEquals(
            "CLOSED",
            jdbcTemplate.queryForObject(
                "select state from sessions where id = '00000000-0000-0000-0000-000000009888'",
                String::class.java,
            ),
        )
    }

    @Test
    fun `host return to draft bff request reaches controller without spring csrf token`() {
        createOpenSession()

        mockMvc
            .post("/api/host/sessions/00000000-0000-0000-0000-000000009888/return-to-draft") {
                with(user("host@example.com"))
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("Origin", "http://localhost:3000")
                withExpectedRevision(SESSION_ID)
            }.andExpect {
                status { isOk() }
                jsonPath("$.sessionId") { value("00000000-0000-0000-0000-000000009888") }
                jsonPath("$.state") { value("DRAFT") }
            }

        assertEquals(
            "DRAFT",
            jdbcTemplate.queryForObject(
                "select state from sessions where id = '00000000-0000-0000-0000-000000009888'",
                String::class.java,
            ),
        )
        assertEquals(6, countRows("session_participants", "session_id = '00000000-0000-0000-0000-000000009888'"))
    }

    private fun createDraftSession() {
        createSession(state = "DRAFT", visibility = "HOST_ONLY", accessScope = "HOST_ONLY")
    }

    private fun patchTitle(title: String): String =
        mockMvc
            .patch("/api/host/sessions/$SESSION_ID") {
                with(user("host@example.com"))
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("Origin", "http://localhost:3000")
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "title": "$title",
                      "bookTitle": "BFF 삭제 테스트 책",
                      "bookAuthor": "BFF 삭제 테스트 저자",
                      "date": "2026-07-01",
                      "locationLabel": "온라인",
                      "expectedSessionRevision": ${sessionRevision(SESSION_ID)}
                    }
                    """.trimIndent()
            }.andExpect { status { isOk() } }
            .andReturn()
            .response
            .contentAsString
            .let { body ->
                """"changeId"\s*:\s*"([^"]+)""""
                    .toRegex()
                    .find(body)
                    ?.groupValues
                    ?.get(1)
                    ?: error("changeReceipt.changeId was missing")
            }

    private fun createViewerMembership() {
        jdbcTemplate.update(
            """
            insert into users (id, email, name, short_name, auth_provider)
            values (?, 'recovery.viewer@example.com', '복원 뷰어', '뷰어', 'PASSWORD')
            """.trimIndent(),
            VIEWER_USER_ID,
        )
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            values (?, ?, ?, 'MEMBER', 'VIEWER', utc_timestamp(6), '뷰어', 'cloud-green-book')
            """.trimIndent(),
            VIEWER_MEMBERSHIP_ID,
            CLUB_ID,
            VIEWER_USER_ID,
        )
    }

    @Suppress("LongMethod")
    private fun createOutsideClubSession() {
        jdbcTemplate.update(
            """
            insert into users (id, email, name, short_name, auth_provider)
            values (?, 'recovery.outside@example.test', 'Outside Recovery Host', 'Outside', 'PASSWORD')
            """.trimIndent(),
            OUTSIDE_USER_ID,
        )
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            values (?, ?, ?, 'HOST', 'ACTIVE', utc_timestamp(6), 'Outside', 'globe-notebook')
            """.trimIndent(),
            OUTSIDE_MEMBERSHIP_ID,
            OUTSIDE_CLUB_ID,
            OUTSIDE_USER_ID,
        )
        jdbcTemplate.update(
            """
            insert into sessions (
              id,
              club_id,
              number,
              title,
              book_title,
              book_author,
              session_date,
              start_time,
              end_time,
              location_label,
              question_deadline_at,
              state,
              visibility,
              access_scope
            )
            values (
              ?,
              ?,
              188,
              '188회차 · 다른 클럽 휴지통',
              '다른 클럽 책',
              '다른 클럽 저자',
              '2026-07-01',
              '20:00:00',
              '22:00:00',
              '온라인',
              '2026-06-30 14:59:00',
              'DRAFT',
              'HOST_ONLY',
              'HOST_ONLY'
            )
            """.trimIndent(),
            OUTSIDE_SESSION_ID,
            OUTSIDE_CLUB_ID,
        )
        jdbcTemplate.update(
            """
            insert into host_session_change_audit (
              id, club_id, session_id, actor_membership_id, action_type,
              changed_fields_json, before_snapshot_json, after_snapshot_json
            ) values (?, ?, ?, ?, 'BASIC_INFO_UPDATED', '["title"]', '{"title":"a"}', '{"title":"b"}')
            """.trimIndent(),
            OUTSIDE_CHANGE_ID,
            OUTSIDE_CLUB_ID,
            OUTSIDE_SESSION_ID,
            OUTSIDE_MEMBERSHIP_ID,
        )
    }

    private fun createOpenSession() {
        createSession(state = "OPEN", visibility = "MEMBER", accessScope = "GUEST_READABLE")
        jdbcTemplate.update(
            """
            insert into session_participants (id, club_id, session_id, membership_id, rsvp_status, attendance_status)
            select uuid(), memberships.club_id, '00000000-0000-0000-0000-000000009888', memberships.id, 'NO_RESPONSE', 'UNKNOWN'
            from memberships
            where memberships.club_id = '00000000-0000-0000-0000-000000000001'
              and memberships.status = 'ACTIVE'
            """.trimIndent(),
        )
    }

    private fun createClosedSession() {
        createSession(state = "CLOSED", visibility = "HOST_ONLY", accessScope = "HOST_ONLY")
    }

    private fun createPublishedSession() {
        createSession(state = "PUBLISHED", visibility = "PUBLIC", accessScope = "GUEST_READABLE")
        jdbcTemplate.update(
            """
            insert into public_session_publications (
              id,
              club_id,
              session_id,
              public_summary,
              is_public,
              visibility,
              site_visibility,
              published_at
            )
            values (
              uuid(),
              '00000000-0000-0000-0000-000000000001',
              '00000000-0000-0000-0000-000000009888',
              'BFF 공개 취소 테스트 요약입니다.',
              true,
              'PUBLIC',
              'PUBLIC_RECORD',
              utc_timestamp(6)
            )
            """.trimIndent(),
        )
    }

    private fun createClosedPublicSession() {
        createSession(state = "CLOSED", visibility = "PUBLIC", accessScope = "GUEST_READABLE")
        jdbcTemplate.update(
            """
            insert into public_session_publications (
              id,
              club_id,
              session_id,
              public_summary,
              is_public,
              visibility,
              site_visibility,
              published_at
            )
            values (
              uuid(),
              '00000000-0000-0000-0000-000000000001',
              '00000000-0000-0000-0000-000000009888',
              'BFF 공개 전환 테스트 요약입니다.',
              false,
              'PUBLIC',
              'PUBLIC_RECORD',
              null
            )
            """.trimIndent(),
        )
    }

    private fun createSession(
        state: String,
        visibility: String,
        accessScope: String,
    ) {
        jdbcTemplate.update(
            """
            insert into sessions (
              id,
              club_id,
              number,
              title,
              book_title,
              book_author,
              session_date,
              start_time,
              end_time,
              location_label,
              question_deadline_at,
              state,
              visibility,
              access_scope
            )
            values (
              '00000000-0000-0000-0000-000000009888',
              '00000000-0000-0000-0000-000000000001',
              88,
              '88회차 · BFF 삭제 테스트 책',
              'BFF 삭제 테스트 책',
              'BFF 삭제 테스트 저자',
              '2026-07-01',
              '20:00:00',
              '22:00:00',
              '온라인',
              '2026-06-30 14:59:00',
              ?,
              ?,
              ?
            )
            """.trimIndent(),
            state,
            visibility,
            accessScope,
        )
    }

    private fun countRows(
        tableName: String,
        whereClause: String,
    ): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from $tableName where $whereClause",
            Int::class.java,
        ) ?: 0

    private fun sessionRevision(sessionId: String): Long =
        jdbcTemplate
            .query(
                "select session_revision from sessions where id = ?",
                { resultSet, _ -> resultSet.getLong("session_revision") },
                sessionId,
            ).firstOrNull() ?: 0

    private fun MockHttpServletRequestDsl.withExpectedRevision(sessionId: String) {
        contentType = MediaType.APPLICATION_JSON
        content = """{"expectedSessionRevision":${sessionRevision(sessionId)}}"""
    }

    private companion object {
        private const val INVITATION_BODY =
            "{\"email\":\"rollout.invite@example.com\",\"name\":\"호환성 초대\",\"applyToCurrentSession\":false}"
        private const val SESSION_ID = "00000000-0000-0000-0000-000000009888"
        private const val CLUB_ID = "00000000-0000-0000-0000-000000000001"
        private const val VIEWER_USER_ID = "00000000-0000-0000-0000-000000009116"
        private const val VIEWER_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000009216"
        private const val OUTSIDE_CLUB_ID = "00000000-0000-0000-0000-000000000002"
        private const val OUTSIDE_USER_ID = "00000000-0000-0000-0000-00000000b101"
        private const val OUTSIDE_MEMBERSHIP_ID = "00000000-0000-0000-0000-00000000b201"
        private const val OUTSIDE_SESSION_ID = "00000000-0000-0000-0000-00000000b888"
        private const val OUTSIDE_CHANGE_ID = "00000000-0000-0000-0000-00000000b401"
        private const val RECORD_DRAFT_BODY =
            """
            {
              "expectedDraftRevision": null,
              "snapshot": {
                "visibility": "HOST_ONLY",
                "publicationSummary": "",
                "highlights": [],
                "oneLineReviews": [],
                "feedbackDocument": {"fileName":"feedback.md","title":"Feedback","markdown":""}
              }
            }
            """

        @JvmStatic
        fun recordMutationCases(): Stream<RecordMutationCase> =
            Stream.of(
                RecordMutationCase(
                    HttpMethod.POST,
                    "/api/host/sessions/00000000-0000-0000-0000-000000009998/visibility-preview",
                    """{"visibility":"MEMBER"}""",
                ),
                RecordMutationCase(
                    HttpMethod.PATCH,
                    "/api/host/sessions/00000000-0000-0000-0000-000000009998/record-draft",
                    RECORD_DRAFT_BODY,
                ),
                RecordMutationCase(
                    HttpMethod.DELETE,
                    "/api/host/sessions/00000000-0000-0000-0000-000000009998/record-draft" +
                        "?expectedDraftRevision=1",
                    null,
                ),
                RecordMutationCase(
                    HttpMethod.POST,
                    "/api/host/sessions/00000000-0000-0000-0000-000000009998/record-draft/rebase",
                    """
                    {
                      "expectedDraftRevision":1,
                      "expectedSessionRevision":0,
                      "expectedLiveRevision":0,
                      "expectedExposureRevision":0,
                      "expectedPublicationRevision":0
                    }
                    """.trimIndent(),
                ),
                RecordMutationCase(
                    HttpMethod.POST,
                    "/api/host/sessions/00000000-0000-0000-0000-000000009998/record-apply-preview",
                    """{"expectedDraftRevision":1,"expectedLiveRevision":0}""",
                ),
                RecordMutationCase(
                    HttpMethod.POST,
                    "/api/host/sessions/00000000-0000-0000-0000-000000009998/record-apply",
                    """
                    {
                      "applyRequestId":"00000000-0000-0000-0000-000000008998",
                      "expectedDraftRevision":1,
                      "expectedLiveRevision":0,
                      "expectedDraftHash":"${"a".repeat(64)}"
                    }
                    """,
                ),
                RecordMutationCase(
                    HttpMethod.POST,
                    "/api/host/sessions/00000000-0000-0000-0000-000000009998/revisions/" +
                        "00000000-0000-0000-0000-000000007998/restore-to-draft",
                    """{"expectedDraftRevision":null}""",
                ),
            )

        @JvmStatic
        fun recoveryAndTrashMutationCases(): Stream<RecordMutationCase> =
            Stream.of(
                RecordMutationCase(
                    HttpMethod.POST,
                    "/api/host/sessions/00000000-0000-0000-0000-000000009998/changes/" +
                        "00000000-0000-0000-0000-000000007998/restore",
                    """{"expectedCurrentHash":"${"a".repeat(64)}"}""",
                ),
                RecordMutationCase(
                    HttpMethod.POST,
                    "/api/host/sessions/00000000-0000-0000-0000-000000009998/restore",
                    """{"expectedSessionRevision":0}""",
                ),
            )

        @JvmStatic
        fun backendPolicyCases(): Stream<BackendPolicyCase> {
            val upgrade = "HOST_CLIENT_UPGRADE_REQUIRED"
            val update = "CLIENT_UPDATE_REQUIRED"
            return Stream.of(
                BackendPolicyCase(HostClientContractMode.DISABLED, null, 204, null),
                BackendPolicyCase(HostClientContractMode.DISABLED, "v2", 204, null),
                BackendPolicyCase(HostClientContractMode.DISABLED, "v3", 204, null),
                BackendPolicyCase(HostClientContractMode.DISABLED, "v9", 204, null),
                BackendPolicyCase(HostClientContractMode.V2_ONLY, "v2", 204, null),
                BackendPolicyCase(HostClientContractMode.V2_ONLY, "v3", 409, upgrade),
                BackendPolicyCase(HostClientContractMode.V2_ONLY, null, 409, upgrade),
                BackendPolicyCase(HostClientContractMode.V2_ONLY, "v9", 409, upgrade),
                BackendPolicyCase(HostClientContractMode.SUPPORT_V2_V3, "v2", 204, null),
                BackendPolicyCase(HostClientContractMode.SUPPORT_V2_V3, "v3", 204, null),
                BackendPolicyCase(HostClientContractMode.SUPPORT_V2_V3, null, 409, upgrade),
                BackendPolicyCase(HostClientContractMode.SUPPORT_V2_V3, "v9", 409, upgrade),
                BackendPolicyCase(HostClientContractMode.ENFORCE_V3, "v3", 204, null),
                BackendPolicyCase(HostClientContractMode.ENFORCE_V3, "v2", 428, update),
                BackendPolicyCase(HostClientContractMode.ENFORCE_V3, null, 428, update),
                BackendPolicyCase(HostClientContractMode.ENFORCE_V3, "v9", 428, update),
            )
        }

        @JvmStatic
        fun nonSessionV3Cases(): Stream<NonSessionV3Case> =
            Stream.of(
                NonSessionV3Case(HttpMethod.POST, "/api/host/members/m-1/approve", null),
                NonSessionV3Case(HttpMethod.POST, "/api/host/invitations", INVITATION_BODY),
                NonSessionV3Case(
                    HttpMethod.PUT,
                    "/api/host/notifications/policy",
                    "{\"sessionReminderEnabled\":true}",
                ),
                NonSessionV3Case(
                    HttpMethod.POST,
                    "/api/host/notifications/manual/preview",
                    "{\"audience\":\"ALL_ACTIVE_MEMBERS\",\"requestedChannels\":\"BOTH\"}",
                ),
                NonSessionV3Case(
                    HttpMethod.POST,
                    "/api/host/notifications/manual",
                    "{\"previewId\":\"preview-fixture\",\"resendConfirmed\":false}",
                ),
                NonSessionV3Case(HttpMethod.POST, "/api/host/notifications/process", null),
                NonSessionV3Case(
                    HttpMethod.POST,
                    "/api/host/notifications/test-mail",
                    "{\"recipientEmail\":\"rollout.mail@example.com\"}",
                ),
            )
    }
}

data class BackendPolicyCase(
    val mode: HostClientContractMode,
    val generation: String?,
    val expectedStatus: Int,
    val expectedCode: String?,
)

data class NonSessionV3Case(
    val method: HttpMethod,
    val path: String,
    val body: String?,
)

@RestController
@Profile("compatibility-matrix-probe")
private class CompatibilityMutationProbeController {
    val domainMutationCount = AtomicInteger()
    val lastBody = AtomicReference<String?>()

    @RequestMapping(
        "/api/host/**",
        method = [RequestMethod.POST, RequestMethod.PUT, RequestMethod.PATCH, RequestMethod.DELETE],
    )
    fun mutate(
        @RequestBody(required = false) body: String?,
    ): ResponseEntity<Void> {
        lastBody.set(body)
        domainMutationCount.incrementAndGet()
        return ResponseEntity.noContent().build()
    }
}

data class RecordMutationCase(
    val method: HttpMethod,
    val path: String,
    val body: String?,
)

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.bff-secret=test-bff-secret",
        "readmates.allowed-origins=http://localhost:3000",
        "readmates.security.host-write-client-contract.mode=SUPPORT_V2_V3",
    ],
)
@AutoConfigureMockMvc
@Tag("integration")
class HostSessionBffClientContractSupportTest(
    @param:Autowired private val mockMvc: MockMvc,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `support mode accepts v2 and v3 host mutation and rejects missing unknown before controller`() {
        mockMvc.perform(hostAccessScopeRequest("v2")).andExpect(status().isNotFound)
        mockMvc.perform(hostAccessScopeRequest("v3")).andExpect(status().isNotFound)
        mockMvc
            .perform(hostAccessScopeRequest(null))
            .andExpect(status().isConflict)
            .andExpect(jsonPath("$.code").value("HOST_CLIENT_UPGRADE_REQUIRED"))
        mockMvc
            .perform(hostAccessScopeRequest("v9"))
            .andExpect(status().isConflict)
            .andExpect(jsonPath("$.code").value("HOST_CLIENT_UPGRADE_REQUIRED"))
    }

    @Test
    fun `support mode keeps host reads available without a client contract`() {
        mockMvc
            .get("/api/host/sessions") {
                with(user("host@example.com"))
                header("X-Readmates-Bff-Secret", "test-bff-secret")
            }.andExpect { status { isOk() } }
    }
}

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.bff-secret=test-bff-secret",
        "readmates.allowed-origins=http://localhost:3000",
        "readmates.security.host-write-client-contract.mode=ENFORCE_V3",
    ],
)
@AutoConfigureMockMvc
@Tag("integration")
class HostSessionBffClientContractEnforceTest(
    @param:Autowired private val mockMvc: MockMvc,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `enforce mode accepts v3 and rejects v2 missing unknown with 428 before controller`() {
        mockMvc.perform(hostAccessScopeRequest("v3")).andExpect(status().isNotFound)
        mockMvc
            .perform(hostAccessScopeRequest("v2"))
            .andExpect(status().isPreconditionRequired)
            .andExpect(jsonPath("$.code").value("CLIENT_UPDATE_REQUIRED"))
        mockMvc
            .perform(hostAccessScopeRequest(null))
            .andExpect(status().isPreconditionRequired)
            .andExpect(jsonPath("$.code").value("CLIENT_UPDATE_REQUIRED"))
        mockMvc
            .perform(hostAccessScopeRequest("v9"))
            .andExpect(status().isPreconditionRequired)
            .andExpect(jsonPath("$.code").value("CLIENT_UPDATE_REQUIRED"))
    }

    @Test
    fun `enforce mode rejects invalid secret and origin before client contract`() {
        mockMvc
            .perform(
                request(
                    HttpMethod.PATCH,
                    "/api/host/sessions/00000000-0000-0000-0000-000000009998/access-scope",
                ).with(user("host@example.com"))
                    .header("X-Readmates-Client-Contract", "v2")
                    .header("Origin", "http://localhost:3000")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("""{"accessScope":"GUEST_READABLE"}"""),
            ).andExpect(status().isUnauthorized)
        mockMvc
            .perform(
                request(
                    HttpMethod.PATCH,
                    "/api/host/sessions/00000000-0000-0000-0000-000000009998/access-scope",
                ).with(user("host@example.com"))
                    .header("X-Readmates-Bff-Secret", "test-bff-secret")
                    .header("X-Readmates-Client-Contract", "v3")
                    .header("Origin", "https://evil.example.com")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("""{"accessScope":"GUEST_READABLE"}"""),
            ).andExpect(status().isForbidden)
    }

    @Test
    fun `enforce mode keeps host reads available without a client contract`() {
        mockMvc
            .get("/api/host/sessions") {
                with(user("host@example.com"))
                header("X-Readmates-Bff-Secret", "test-bff-secret")
            }.andExpect { status { isOk() } }
    }
}

private fun hostAccessScopeRequest(contract: String?) =
    request(
        HttpMethod.PATCH,
        "/api/host/sessions/00000000-0000-0000-0000-000000009998/access-scope",
    ).with(user("host@example.com"))
        .header("X-Readmates-Bff-Secret", "test-bff-secret")
        .header("Origin", "http://localhost:3000")
        .contentType(MediaType.APPLICATION_JSON)
        .content("""{"accessScope":"GUEST_READABLE"}""")
        .also { builder ->
            contract?.let { builder.header("X-Readmates-Client-Contract", it) }
        }
