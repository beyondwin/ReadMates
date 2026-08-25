package com.readmates.admin.takedown.api

import com.jayway.jsonpath.JsonPath
import com.readmates.admin.takedown.application.model.ConfirmPublicTakedownCommand
import com.readmates.admin.takedown.application.model.PublicTakedownActor
import com.readmates.admin.takedown.application.model.PublicTakedownError
import com.readmates.admin.takedown.application.model.PublicTakedownException
import com.readmates.admin.takedown.application.port.`in`.PreviewPublicTakedownUseCase
import com.readmates.admin.takedown.application.port.out.PublicTakedownPort
import com.readmates.admin.takedown.application.service.PublicTakedownService
import com.readmates.auth.application.service.AuthSessionService
import com.readmates.shared.mutation.config.MutationIdempotencyProperties
import com.readmates.shared.security.PlatformActor
import com.readmates.shared.security.PlatformCapability
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import jakarta.servlet.http.Cookie
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
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
import org.springframework.test.web.servlet.post
import java.time.Clock
import java.util.UUID

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.auth.session-cookie-secure=false",
        "readmates.bff-secret=test-bff-secret",
        "readmates.allowed-origins=http://localhost:3000",
        "readmates.ai-generation.enabled=false",
        "readmates.public-takedown.enabled=true",
        "readmates.public-takedown.r2a-cache-safety-evidence-verified=true",
        "readmates.public-takedown.elapsed-browser-cache-window-seconds=720",
    ],
)
@AutoConfigureMockMvc
@Tag("integration")
class PlatformAdminPublicTakedownIntegrationTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val authSessionService: AuthSessionService,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val previewUseCase: PreviewPublicTakedownUseCase,
    @param:Autowired private val takedownPort: PublicTakedownPort,
    @param:Autowired private val mutationProperties: MutationIdempotencyProperties,
    @param:Autowired private val clock: Clock,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val tokenHashes = linkedSetOf<String>()

    @BeforeEach
    fun prepare() {
        jdbcTemplate.update("delete from platform_admins where user_id = ?", INACTIVE_ADMIN_ID)
        jdbcTemplate.update("delete from users where id = ?", INACTIVE_ADMIN_ID)
        cleanTakedownRows()
        restoreProjection()
    }

    @AfterEach
    fun cleanup() {
        cleanTakedownRows()
        restoreProjection()
        if (tokenHashes.isNotEmpty()) {
            val placeholders = tokenHashes.joinToString(",") { "?" }
            jdbcTemplate.update(
                "delete from auth_sessions where session_token_hash in ($placeholders)",
                *tokenHashes.toTypedArray(),
            )
        }
        tokenHashes.clear()
        jdbcTemplate.update("delete from platform_admins where user_id = ?", INACTIVE_ADMIN_ID)
        jdbcTemplate.update("delete from users where id = ?", INACTIVE_ADMIN_ID)
    }

    @Test
    fun `owner and operator preview and confirm one bound public target`() {
        listOf(OWNER_USER_ID, OPERATOR_USER_ID).forEachIndexed { index, actorId ->
            restoreProjection()
            val preview = preview(actorId)
            val previewId = JsonPath.read<String>(preview, "$.previewId")
            val generation = JsonPath.read<Int>(preview, "$.targetGeneration")

            mockMvc
                .post("/api/admin/public-takedowns/confirm") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """{"previewId":"$previewId","reasonCategory":"PRIVACY","reason":"민감 정보 노출 우려","idempotencyKey":"takedown-$index"}"""
                    trustedAdmin(actorId)
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.schema") { value("admin.public_takedown.receipt.v1") }
                    jsonPath("$.originResult") { value("DENIED") }
                    jsonPath("$.committedGeneration") { value(generation + 1) }
                    jsonPath("$.convergenceId") { isNotEmpty() }
                    jsonPath("$.reason") { doesNotExist() }
                    jsonPath("$.provider") { doesNotExist() }
                    jsonPath("$.limitationCode") { value("STORED_OR_OFFLINE_COPY_MAY_REMAIN") }
                }

            assertThat(originReadable()).isFalse()
            assertThat(rowCount("admin_public_takedown_receipts")).isEqualTo(1)
            assertThat(rowCount("public_convergence_work")).isEqualTo(1)
            cleanTakedownRows()
        }
    }

    @Test
    fun `support host and inactive admin fail closed without mutation`() {
        seedInactiveAdmin()
        listOf(SUPPORT_USER_ID, HOST_USER_ID, INACTIVE_ADMIN_ID).forEach { actorId ->
            mockMvc
                .post("/api/admin/public-takedowns/preview") {
                    contentType = MediaType.APPLICATION_JSON
                    content = previewBody()
                    trustedAdmin(actorId)
                }.andExpect {
                    status { isForbidden() }
                }
        }
        assertThat(rowCount("admin_public_takedown_previews")).isZero()
        assertThat(originReadable()).isTrue()
    }

    @Test
    fun `capabilityless operator and unverified activation fail closed before persistence`() {
        val capabilityless =
            PublicTakedownActor(
                authority = PlatformActor(UUID.fromString(OPERATOR_USER_ID), emptySet()),
                roleSnapshot = "OPERATOR",
            )
        assertThatThrownBy {
            previewUseCase.preview(
                capabilityless,
                UUID.fromString(CLUB_ID),
                UUID.fromString(SESSION_ID),
                UUID.fromString(PUBLICATION_ID),
            )
        }.isInstanceOfSatisfying(PublicTakedownException::class.java) { error ->
            assertThat(error.error).isEqualTo(PublicTakedownError.PERMISSION_DENIED)
        }

        val capable =
            PublicTakedownActor(
                authority =
                    PlatformActor(
                        UUID.fromString(OPERATOR_USER_ID),
                        setOf(PlatformCapability.EMERGENCY_PUBLIC_TAKEDOWN),
                    ),
                roleSnapshot = "OPERATOR",
            )
        val unverified =
            PublicTakedownService(
                port = takedownPort,
                mutationProperties = mutationProperties,
                clock = clock,
                enabled = false,
                cacheSafetyEvidenceVerified = true,
                elapsedBrowserCacheWindowSeconds = 720,
            )
        assertThatThrownBy {
            unverified.preview(
                capable,
                UUID.fromString(CLUB_ID),
                UUID.fromString(SESSION_ID),
                UUID.fromString(PUBLICATION_ID),
            )
        }.isInstanceOfSatisfying(PublicTakedownException::class.java) { error ->
            assertThat(error.error).isEqualTo(PublicTakedownError.ACTIVATION_NOT_VERIFIED)
        }
        assertThat(rowCount("admin_public_takedown_previews")).isZero()
    }

    @Test
    fun `blank reason target drift expiry and generation drift fail closed`() {
        val blankPreview = JsonPath.read<String>(preview(OWNER_USER_ID), "$.previewId")
        confirmExpectingConflictOrBadRequest(blankPreview, reason = "   ", expectedStatus = 400)

        val targetPreview = JsonPath.read<String>(preview(OWNER_USER_ID), "$.previewId")
        jdbcTemplate.update(
            "update admin_public_takedown_previews set publication_id_snapshot = ? where id = ?",
            OTHER_PUBLICATION_ID,
            targetPreview,
        )
        confirmExpectingConflictOrBadRequest(targetPreview, expectedStatus = 409)

        val expiredPreview = JsonPath.read<String>(preview(OWNER_USER_ID), "$.previewId")
        jdbcTemplate.update(
            "update admin_public_takedown_previews set expires_at = timestampadd(second, -1, utc_timestamp(6)) where id = ?",
            expiredPreview,
        )
        confirmExpectingConflictOrBadRequest(expiredPreview, expectedStatus = 409)

        val generationPreview = JsonPath.read<String>(preview(OWNER_USER_ID), "$.previewId")
        jdbcTemplate.update(
            "update public_projection_current set generation = generation + 1 where session_id = ?",
            SESSION_ID,
        )
        confirmExpectingConflictOrBadRequest(generationPreview, expectedStatus = 409)

        assertThat(rowCount("admin_public_takedown_receipts")).isZero()
        assertThat(rowCount("public_convergence_work")).isZero()
        assertThat(originReadable()).isTrue()
    }

    @Test
    fun `same key reconciles response loss and different request conflicts without duplicate work`() {
        val previewId = JsonPath.read<String>(preview(OPERATOR_USER_ID), "$.previewId")
        val request =
            """{"previewId":"$previewId","reasonCategory":"PRIVACY","reason":"외부 노출 확인","idempotencyKey":"response-loss-key"}"""
        val first = confirm(OPERATOR_USER_ID, request)
        val replay = confirm(OPERATOR_USER_ID, request)

        assertThat(JsonPath.read<String>(replay, "$.receiptId"))
            .isEqualTo(JsonPath.read<String>(first, "$.receiptId"))
        assertThat(JsonPath.read<String>(replay, "$.convergenceId"))
            .isEqualTo(JsonPath.read<String>(first, "$.convergenceId"))
        assertThat(rowCount("admin_public_takedown_receipts")).isEqualTo(1)
        assertThat(rowCount("public_convergence_work")).isEqualTo(1)

        mockMvc
            .post("/api/admin/public-takedowns/confirm") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """{"previewId":"$previewId","reasonCategory":"SECURITY","reason":"다른 요청","idempotencyKey":"response-loss-key"}"""
                trustedAdmin(OPERATOR_USER_ID)
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("IDEMPOTENCY_CONFLICT") }
            }

        assertThat(rowCount("admin_public_takedown_receipts")).isEqualTo(1)
        assertThat(rowCount("public_convergence_work")).isEqualTo(1)
    }

    @Test
    fun `preview bound v1 key reconciles after v2 rotation and retired key fails closed`() {
        val previewId = UUID.fromString(JsonPath.read<String>(preview(OWNER_USER_ID), "$.previewId"))
        assertThat(
            jdbcTemplate.queryForObject(
                "select binding_digest_key_version from admin_public_takedown_previews where id = ?",
                Int::class.java,
                previewId.toString(),
            ),
        ).isEqualTo(mutationProperties.currentKeyVersion)
        val actor =
            PublicTakedownActor(
                authority =
                    PlatformActor(
                        UUID.fromString(OWNER_USER_ID),
                        setOf(PlatformCapability.EMERGENCY_PUBLIC_TAKEDOWN),
                    ),
                roleSnapshot = "OWNER",
            )
        val request =
            ConfirmPublicTakedownCommand(
                previewId = previewId,
                reasonCategory = "PRIVACY",
                reason = "회전 중 같은 회수 요청",
                idempotencyKey = "rotated-response-loss-key",
            )
        val first = takedownService(mutationProperties).confirm(actor, request)
        val rotated = takedownService(rotatedProperties())
        val replay = rotated.confirm(actor, request)
        assertThat(replay.receiptId).isEqualTo(first.receiptId)
        assertThat(replay.convergenceId).isEqualTo(first.convergenceId)
        assertThat(rowCount("admin_public_takedown_receipts")).isEqualTo(1)
        assertThat(rowCount("public_convergence_work")).isEqualTo(1)
        assertThat(
            jdbcTemplate.queryForObject(
                "select digest_key_version from admin_public_takedown_receipts where id = ?",
                Int::class.java,
                first.receiptId.toString(),
            ),
        ).isEqualTo(mutationProperties.currentKeyVersion)

        assertThatThrownBy {
            rotated.confirm(actor, request.copy(reason = "다른 회수 요청"))
        }.isInstanceOfSatisfying(PublicTakedownException::class.java) { error ->
            assertThat(error.error).isEqualTo(PublicTakedownError.IDEMPOTENCY_CONFLICT)
        }

        val retired =
            takedownService(
                MutationIdempotencyProperties(
                    currentKey = "test-mutation-identity-v2-key",
                    currentKeyVersion = 2,
                    previousKey = "",
                    previousKeyVersion = 0,
                    allowEmptySecret = false,
                ),
            )
        assertThatThrownBy { retired.confirm(actor, request) }
            .isInstanceOfSatisfying(PublicTakedownException::class.java) { error ->
                assertThat(error.error).isEqualTo(PublicTakedownError.DIGEST_KEY_UNAVAILABLE)
            }
        assertThat(rowCount("admin_public_takedown_receipts")).isEqualTo(1)
        assertThat(rowCount("public_convergence_work")).isEqualTo(1)
    }

    @Test
    fun `audit persists only redacted reason facts and no private or provider detail`() {
        val previewId = JsonPath.read<String>(preview(OWNER_USER_ID), "$.previewId")
        val rawReason = "private-body-sentinel provider-error-sentinel"
        confirm(
            OWNER_USER_ID,
            """{"previewId":"$previewId","reasonCategory":"LEGAL","reason":"$rawReason","idempotencyKey":"redaction-key"}""",
        )

        val stored =
            jdbcTemplate.queryForMap(
                "select reason_category, reason_summary, request_hmac from admin_public_takedown_receipts limit 1",
            )
        assertThat(stored["reason_category"]).isEqualTo("LEGAL")
        assertThat(stored["reason_summary"]).isEqualTo("REDACTED_NON_EMPTY")
        assertThat(stored.toString()).doesNotContain(rawReason, "private-body-sentinel", "provider-error-sentinel")
    }

    private fun preview(actorId: String): String =
        mockMvc
            .post("/api/admin/public-takedowns/preview") {
                contentType = MediaType.APPLICATION_JSON
                content = previewBody()
                trustedAdmin(actorId)
            }.andExpect {
                status { isOk() }
                jsonPath("$.schema") { value("admin.public_takedown.preview.v1") }
                jsonPath("$.clubId") { value(CLUB_ID) }
                jsonPath("$.sessionId") { value(SESSION_ID) }
                jsonPath("$.publicationId") { value(PUBLICATION_ID) }
                jsonPath("$.currentSurfaces") { isArray() }
                jsonPath("$.limitationCode") { value("STORED_OR_OFFLINE_COPY_MAY_REMAIN") }
                jsonPath("$.reason") { doesNotExist() }
            }.andReturn()
            .response
            .contentAsString

    private fun confirm(
        actorId: String,
        request: String,
    ): String =
        mockMvc
            .post("/api/admin/public-takedowns/confirm") {
                contentType = MediaType.APPLICATION_JSON
                content = request
                trustedAdmin(actorId)
            }.andExpect {
                status { isOk() }
            }.andReturn()
            .response
            .contentAsString

    private fun confirmExpectingConflictOrBadRequest(
        previewId: String,
        reason: String = "회수 사유",
        expectedStatus: Int,
    ) {
        mockMvc
            .post("/api/admin/public-takedowns/confirm") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """{"previewId":"$previewId","reasonCategory":"PRIVACY","reason":"$reason","idempotencyKey":"failure-$previewId"}"""
                trustedAdmin(OWNER_USER_ID)
            }.andExpect {
                status { isEqualTo(expectedStatus) }
            }
    }

    private fun org.springframework.test.web.servlet.MockHttpServletRequestDsl.trustedAdmin(actorId: String) {
        header(BFF_SECRET_HEADER, BFF_SECRET)
        header("Origin", ALLOWED_ORIGIN)
        cookie(sessionCookieForUser(actorId))
    }

    @Suppress("ktlint:standard:function-expression-body")
    private fun previewBody(): String {
        return """{"clubId":"$CLUB_ID","sessionId":"$SESSION_ID","publicationId":"$PUBLICATION_ID"}"""
    }

    private fun sessionCookieForUser(userId: String): Cookie {
        val issued =
            authSessionService.issueSession(
                userId = userId,
                userAgent = "PlatformAdminPublicTakedownIntegrationTest",
                ipAddress = "127.0.0.1",
            )
        tokenHashes += issued.storedTokenHash
        return Cookie(AuthSessionService.COOKIE_NAME, issued.rawToken)
    }

    @Suppress("ktlint:standard:function-expression-body")
    private fun rowCount(table: String): Int {
        return jdbcTemplate.queryForObject(
            "select count(*) from $table",
            Int::class.java,
        ) ?: -1
    }

    private fun originReadable(): Boolean =
        jdbcTemplate.queryForObject(
            "select origin_readable from public_projection_current where session_id = ?",
            Boolean::class.java,
            SESSION_ID,
        ) ?: false

    private fun cleanTakedownRows() {
        runCatching { jdbcTemplate.update("delete from public_convergence_events") }
        runCatching { jdbcTemplate.update("delete from public_convergence_work") }
        runCatching { jdbcTemplate.update("delete from public_mutation_convergence_links") }
        runCatching { jdbcTemplate.update("delete from admin_public_takedown_receipts") }
        runCatching { jdbcTemplate.update("delete from admin_public_takedown_previews") }
    }

    private fun seedInactiveAdmin() {
        jdbcTemplate.update(
            """
            insert into users (id, email, name, short_name, auth_provider)
            values (?, 'inactive-takedown-admin@example.test', 'Inactive Takedown', 'Inactive', 'GOOGLE')
            """.trimIndent(),
            INACTIVE_ADMIN_ID,
        )
        jdbcTemplate.update(
            "insert into platform_admins (user_id, role, status) values (?, 'OPERATOR', 'DISABLED')",
            INACTIVE_ADMIN_ID,
        )
    }

    private fun takedownService(properties: MutationIdempotencyProperties) =
        PublicTakedownService(
            port = takedownPort,
            mutationProperties = properties,
            clock = clock,
            enabled = true,
            cacheSafetyEvidenceVerified = true,
            elapsedBrowserCacheWindowSeconds = 720,
        )

    private fun rotatedProperties() =
        MutationIdempotencyProperties(
            currentKey = "test-mutation-identity-v2-key",
            currentKeyVersion = 2,
            previousKey = mutationProperties.currentKey,
            previousKeyVersion = mutationProperties.currentKeyVersion,
            allowEmptySecret = false,
        )

    private fun restoreProjection() {
        jdbcTemplate.update(
            """
            insert into public_projection_current (
              session_id, club_id, publication_id_snapshot, generation, club_generation,
              live_record_revision, origin_readable, convergence_id, updated_at
            ) values (?, ?, ?, 1, 1, 0, true, null, utc_timestamp(6))
            on duplicate key update
              club_id = values(club_id), publication_id_snapshot = values(publication_id_snapshot),
              generation = 1, club_generation = 1, live_record_revision = 0,
              origin_readable = true, convergence_id = null, updated_at = utc_timestamp(6)
            """.trimIndent(),
            SESSION_ID,
            CLUB_ID,
            PUBLICATION_ID,
        )
        jdbcTemplate.update(
            """
            insert into public_club_projection_generations (club_id, generation, origin_readable, updated_at)
            values (?, 1, true, utc_timestamp(6))
            on duplicate key update generation = 1, origin_readable = true, updated_at = utc_timestamp(6)
            """.trimIndent(),
            CLUB_ID,
        )
    }

    private companion object {
        const val BFF_SECRET_HEADER = "X-Readmates-Bff-Secret"
        const val BFF_SECRET = "test-bff-secret"
        const val ALLOWED_ORIGIN = "http://localhost:3000"
        const val CLUB_ID = "00000000-0000-0000-0000-000000000001"
        const val SESSION_ID = "00000000-0000-0000-0000-000000000301"
        const val PUBLICATION_ID = "00000000-0000-0000-0000-000000000501"
        const val OTHER_PUBLICATION_ID = "00000000-0000-0000-0000-000000000502"
        const val OWNER_USER_ID = "00000000-0000-0000-0000-000000000901"
        const val OPERATOR_USER_ID = "00000000-0000-0000-0000-000000000902"
        const val SUPPORT_USER_ID = "00000000-0000-0000-0000-000000000903"
        const val HOST_USER_ID = "00000000-0000-0000-0000-000000000101"
        const val INACTIVE_ADMIN_ID = "00000000-0000-0000-0000-00000000a798"
    }
}
