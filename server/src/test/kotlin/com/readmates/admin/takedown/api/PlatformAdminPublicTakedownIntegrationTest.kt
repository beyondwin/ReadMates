package com.readmates.admin.takedown.api

import com.jayway.jsonpath.JsonPath
import com.readmates.admin.takedown.application.model.ConfirmPublicTakedownCommand
import com.readmates.admin.takedown.application.model.PreviewPublicTakedownCommand
import com.readmates.admin.takedown.application.model.PublicTakedownError
import com.readmates.admin.takedown.application.model.PublicTakedownException
import com.readmates.admin.takedown.application.model.PublicTakedownReasonCategory
import com.readmates.admin.takedown.application.port.`in`.PreviewPublicTakedownUseCase
import com.readmates.admin.takedown.application.port.out.PublicTakedownActivationEvidencePort
import com.readmates.admin.takedown.application.port.out.PublicTakedownPort
import com.readmates.admin.takedown.application.service.PublicTakedownService
import com.readmates.auth.application.service.AuthSessionService
import com.readmates.publication.application.model.PublicConvergenceProcessResult
import com.readmates.publication.application.model.providerIdempotencyToken
import com.readmates.publication.application.port.`in`.ProcessPublicConvergenceUseCase
import com.readmates.publication.application.port.out.ProviderAttemptResult
import com.readmates.publication.application.port.out.ProviderFailureCategory
import com.readmates.publication.application.port.out.ProviderSuccessCategory
import com.readmates.publication.application.port.out.PublicCachePurgeCommand
import com.readmates.publication.application.port.out.PublicCachePurgePort
import com.readmates.session.adapter.`in`.scheduling.HostSessionTrashScheduler
import com.readmates.shared.mutation.application.port.`in`.PurgeExpiredMutationIdempotencyUseCase
import com.readmates.shared.mutation.config.MutationIdempotencyProperties
import com.readmates.shared.security.PlatformActor
import com.readmates.shared.security.PlatformCapability
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
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import java.nio.file.Files
import java.nio.file.Path
import java.sql.Timestamp
import java.time.Clock
import java.time.Duration
import java.util.UUID
import org.mockito.Mockito.`when` as whenever

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.auth.session-cookie-secure=false",
        "readmates.bff-secret=test-bff-secret",
        "readmates.allowed-origins=http://localhost:3000",
        "readmates.ai-generation.enabled=false",
        "readmates.public-convergence.enabled=true",
    ],
)
@AutoConfigureMockMvc
@Tag("integration")
class PlatformAdminPublicTakedownIntegrationTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val authSessionService: AuthSessionService,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val previewUseCase: PreviewPublicTakedownUseCase,
    @param:Autowired private val processConvergence: ProcessPublicConvergenceUseCase,
    @param:Autowired private val publicTakedownPort: PublicTakedownPort,
    @param:Autowired private val clock: Clock,
    @param:Autowired private val purgeExpiredMutationIdempotency: PurgeExpiredMutationIdempotencyUseCase,
    @param:Autowired private val hostSessionTrashScheduler: HostSessionTrashScheduler,
) : ReadmatesMySqlIntegrationTestSupport() {
    @MockitoBean
    private lateinit var activationEvidence: PublicTakedownActivationEvidencePort

    @MockitoBean
    private lateinit var purgePort: PublicCachePurgePort

    private val createdSessionTokenHashes = linkedSetOf<String>()

    @BeforeEach
    fun prepare() {
        cleanupFixture()
        insertPublishedTarget()
        whenever(activationEvidence.confirmEnabled()).thenReturn(false)
    }

    @AfterEach
    fun cleanup() {
        if (createdSessionTokenHashes.isNotEmpty()) {
            val placeholders = createdSessionTokenHashes.joinToString(",") { "?" }
            jdbcTemplate.update(
                "delete from auth_sessions where session_token_hash in ($placeholders)",
                *createdSessionTokenHashes.toTypedArray(),
            )
        }
        createdSessionTokenHashes.clear()
        cleanupFixture()
    }

    @Test
    fun `preview binds exact public target generation surfaces ttl and remote copy limitation`() {
        val body = mockMvc
            .post("/api/admin/public-takedowns/preview") {
                contentType = MediaType.APPLICATION_JSON
                content = previewRequest()
                trustedAdminRequest(OWNER_USER_ID)
            }.andExpect {
                status { isOk() }
                jsonPath("$.schema") { value("admin.public_takedown.preview.v1") }
                jsonPath("$.clubId") { value(CLUB_ID) }
                jsonPath("$.sessionId") { value(SESSION_ID) }
                jsonPath("$.publicationId") { value(PUBLICATION_ID) }
                jsonPath("$.targetGeneration") { value(7) }
                jsonPath("$.currentSurfaces.length()") { value(4) }
                jsonPath("$.expiresAt") { isNotEmpty() }
                jsonPath("$.confirmEnabled") { value(false) }
                jsonPath("$.activationBoundary") { value("PROTECTED_CACHE_SAFETY_EVIDENCE_REQUIRED") }
                jsonPath("$.remoteCopyLimitation") { value(REMOTE_COPY_LIMITATION) }
            }.andReturn().response.contentAsString
        val fixture = sharedFixture("platform-admin-takedown-preview.server.json")
        assertThat(JsonPath.read<String>(body, "$.schema")).isEqualTo(JsonPath.read<String>(fixture, "$.schema"))
        assertThat(JsonPath.read<String>(body, "$.activationBoundary"))
            .isEqualTo(JsonPath.read<String>(fixture, "$.activationBoundary"))
        assertThat(JsonPath.read<Boolean>(body, "$.confirmEnabled"))
            .isEqualTo(JsonPath.read<Boolean>(fixture, "$.confirmEnabled"))
        assertThat(JsonPath.read<String>(body, "$.remoteCopyLimitation"))
            .isEqualTo(JsonPath.read<String>(fixture, "$.remoteCopyLimitation"))
        assertThat(JsonPath.read<List<String>>(body, "$.currentSurfaces").sorted())
            .isEqualTo(JsonPath.read<List<String>>(fixture, "$.currentSurfaces").sorted())
    }

    @Test
    fun `confirm fails closed by default while preview remains available`() {
        val previewId = createPreview(OWNER_USER_ID)

        mockMvc
            .post("/api/admin/public-takedowns/confirm") {
                contentType = MediaType.APPLICATION_JSON
                content = confirmRequest(previewId, "key-default-disabled-0001")
                trustedAdminRequest(OWNER_USER_ID)
            }.andExpect {
                status { isServiceUnavailable() }
                jsonPath("$.code") { value("TAKEDOWN_CONFIRM_DISABLED") }
                jsonPath("$.message") {
                    value("보호된 캐시 안전 증거가 없어 긴급 회수를 확정할 수 없습니다.")
                }
            }

        assertThat(originReadable()).isTrue()
        assertThat(generation()).isEqualTo(7)
    }

    @Test
    fun `support inactive admin host and anonymous fail closed`() {
        seedDisabledAdmin()
        val requests =
            listOf(
                null to 401,
                HOST_USER_ID to 403,
                SUPPORT_USER_ID to 403,
                DISABLED_ADMIN_ID to 403,
            )
        requests.forEach { (userId, status) ->
            mockMvc
                .post("/api/admin/public-takedowns/preview") {
                    contentType = MediaType.APPLICATION_JSON
                    content = previewRequest()
                    header(BFF_SECRET_HEADER, BFF_SECRET)
                    header("Origin", ALLOWED_ORIGIN)
                    if (userId != null) cookie(sessionCookieForUser(userId))
                }.andExpect {
                    status { isEqualTo(status) }
                }
        }
    }

    @Test
    fun `active owner and operator capabilities confirm through the explicit test evidence seam`() {
        whenever(activationEvidence.confirmEnabled()).thenReturn(true)
        listOf(OWNER_USER_ID, OPERATOR_USER_ID).forEachIndexed { index, userId ->
            if (index > 0) {
                cleanupFixture()
                insertPublishedTarget()
            }
            val previewId = createPreview(userId)
            val body = confirm(userId, previewId, "key-capability-success-000$index")

            assertThat(JsonPath.read<String>(body, "$.originResult")).isEqualTo("DENIED")
            assertThat(JsonPath.read<Int>(body, "$.committedGeneration")).isEqualTo(8)
            assertThat(JsonPath.read<String>(body, "$.reasonCategory")).isEqualTo("PRIVATE_DATA")
            assertThat(JsonPath.read<String>(body, "$.cdnPurgeOutcome")).isEqualTo("QUEUED")
            assertThat(JsonPath.read<String>(body, "$.bffEvictionOutcome")).isEqualTo("NOT_STARTED")
            val fixture = sharedFixture("platform-admin-takedown-receipt.server.json")
            listOf(
                "schema",
                "originResult",
                "committedGeneration",
                "reasonCategory",
                "reasonRedacted",
                "bffEvictionOutcome",
                "cdnPurgeOutcome",
                "browserRevalidationOutcome",
                "remoteCopyLimitation",
            ).forEach { field ->
                assertThat(JsonPath.read<Any>(body, "$.${field}"))
                    .isEqualTo(JsonPath.read<Any>(fixture, "$.${field}"))
            }
            assertThat(body).doesNotContain("committedClubGeneration", "limitationCode")
            assertThat(
                jdbcTemplate.queryForObject(
                    "select reason_category from admin_public_takedown_receipts",
                    String::class.java,
                ),
            ).isEqualTo("PRIVATE_DATA")
            assertThat(
                jdbcTemplate.queryForObject(
                    """
                    select json_unquote(json_extract(metadata_json, '$.reasonCategory'))
                    from platform_audit_events
                    where event_type = 'EMERGENCY_PUBLIC_TAKEDOWN_CONFIRMED'
                    """.trimIndent(),
                    String::class.java,
                ),
            ).isEqualTo("PRIVATE_DATA")
            assertThat(originReadable()).isFalse()
            assertThat(generation()).isEqualTo(8)
        }
    }

    private fun sharedFixture(name: String): String {
        val repositoryRelative = Path.of("front/tests/unit/__fixtures__/$name")
        val serverRelative = Path.of("../front/tests/unit/__fixtures__/$name")
        return Files.readString(if (Files.exists(repositoryRelative)) repositoryRelative else serverRelative)
    }

    @Test
    fun `capability removed operator shaped actor is denied without a raw role comparison`() {
        val actor =
            PlatformActor(
                UUID.fromString(OPERATOR_USER_ID),
                com.readmates.club.domain.PlatformAdminRole.OPERATOR,
                emptySet(),
            )

        var error: PublicTakedownException? = null
        try {
            previewUseCase.preview(
                actor,
                "OPERATOR",
                PreviewPublicTakedownCommand(
                    UUID.fromString(CLUB_ID),
                    UUID.fromString(SESSION_ID),
                    UUID.fromString(PUBLICATION_ID),
                ),
            )
        } catch (caught: PublicTakedownException) {
            error = caught
        }
        assertThat(error?.error).isEqualTo(PublicTakedownError.PERMISSION_DENIED)
        assertThat(count("admin_public_takedown_previews")).isZero()
    }

    @Test
    fun `same key same request reconciles response loss and different request conflicts`() {
        whenever(activationEvidence.confirmEnabled()).thenReturn(true)
        val previewId = createPreview(OWNER_USER_ID)
        val key = "key-response-loss-0001"
        val first = confirm(OWNER_USER_ID, previewId, key)
        val replay = confirm(OWNER_USER_ID, previewId, key)

        assertThat(JsonPath.read<String>(replay, "$.receiptId")).isEqualTo(JsonPath.read<String>(first, "$.receiptId"))
        assertThat(JsonPath.read<String>(replay, "$.convergenceId"))
            .isEqualTo(JsonPath.read<String>(first, "$.convergenceId"))
        assertThat(generation()).isEqualTo(8)
        assertThat(count("admin_public_takedown_receipts")).isOne()
        assertThat(count("admin_public_takedown_idempotency")).isOne()
        assertThat(count("public_mutation_convergence_receipts", "publication_id_snapshot", PUBLICATION_ID)).isOne()
        assertThat(count("public_convergence_work")).isOne()
        assertThat(
            jdbcTemplate.queryForObject(
                "select count(*) from platform_audit_events where event_type = 'EMERGENCY_PUBLIC_TAKEDOWN_CONFIRMED'",
                Int::class.java,
            ),
        ).isEqualTo(1)

        mockMvc
            .post("/api/admin/public-takedowns/confirm") {
                contentType = MediaType.APPLICATION_JSON
                content = confirmRequest(previewId, key, reason = "Different synthetic reason")
                trustedAdminRequest(OWNER_USER_ID)
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("IDEMPOTENCY_KEY_REUSED") }
            }
        assertThat(generation()).isEqualTo(8)
        assertThat(count("admin_public_takedown_receipts")).isOne()
    }

    @Test
    fun `same request replays across digest key rotation while changed request conflicts`() {
        val previousKeyService =
            PublicTakedownService(
                port = publicTakedownPort,
                activationEvidence = PublicTakedownActivationEvidencePort { true },
                idempotencyProperties =
                    MutationIdempotencyProperties(
                        currentKey = TEST_PREVIOUS_DIGEST_KEY,
                        currentKeyVersion = 0,
                        previousKeyVersion = 2,
                        retention = Duration.ofHours(24),
                    ),
                clock = clock,
            )
        val actor =
            PlatformActor(
                UUID.fromString(OWNER_USER_ID),
                com.readmates.club.domain.PlatformAdminRole.OWNER,
                setOf(PlatformCapability.EMERGENCY_PUBLIC_TAKEDOWN),
            )
        val preview =
            previousKeyService.preview(
                actor,
                "OWNER",
                PreviewPublicTakedownCommand(
                    UUID.fromString(CLUB_ID),
                    UUID.fromString(SESSION_ID),
                    UUID.fromString(PUBLICATION_ID),
                ),
            )
        val key = "key-rotated-replay-0001"
        val first =
            previousKeyService.confirm(
                actor,
                "OWNER",
                ConfirmPublicTakedownCommand(
                    preview.previewId,
                    PublicTakedownReasonCategory.PRIVATE_DATA,
                    "Synthetic incident reason",
                    key,
                ),
            )

        val replay = confirm(OWNER_USER_ID, preview.previewId.toString(), key)
        assertThat(JsonPath.read<String>(replay, "$.receiptId")).isEqualTo(first.receiptId.toString())
        mockMvc
            .post("/api/admin/public-takedowns/confirm") {
                contentType = MediaType.APPLICATION_JSON
                content = confirmRequest(preview.previewId.toString(), key, reason = "Changed synthetic reason")
                trustedAdminRequest(OWNER_USER_ID)
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("IDEMPOTENCY_KEY_REUSED") }
            }
        assertThat(count("admin_public_takedown_receipts")).isOne()
        assertThat(generation()).isEqualTo(8)
    }

    @Test
    fun `failed provider retry appends a higher attempt under the same takedown convergence`() {
        whenever(activationEvidence.confirmEnabled()).thenReturn(true)
        val previewId = createPreview(OWNER_USER_ID)
        val body = confirm(OWNER_USER_ID, previewId, "key-provider-retry-0001")
        val convergenceId = JsonPath.read<String>(body, "$.convergenceId")
        val convergenceUuid = UUID.fromString(convergenceId)
        val baseCommand =
            PublicCachePurgeCommand(
                convergenceId = convergenceUuid,
                publicationId = UUID.fromString(PUBLICATION_ID),
                sessionId = UUID.fromString(SESSION_ID),
                committedGeneration = 8,
                originReadable = false,
                idempotencyToken = providerIdempotencyToken(convergenceUuid, 1),
            )
        whenever(purgePort.requestPurge(baseCommand))
            .thenReturn(ProviderAttemptResult.Failed(ProviderFailureCategory.UNAVAILABLE, retryable = true))
        whenever(
            purgePort.requestPurge(
                baseCommand.copy(idempotencyToken = providerIdempotencyToken(convergenceUuid, 2)),
            ),
        ).thenReturn(ProviderAttemptResult.Succeeded(ProviderSuccessCategory.PURGED))
        val receiptBytesBefore = receiptBytes()

        assertThat(processConvergence.processOne("takedown-test-worker"))
            .isEqualTo(PublicConvergenceProcessResult.PROCESSED)
        jdbcTemplate.update(
            """
            update public_convergence_work
            set available_at = ?
            where convergence_id = ?
            """.trimIndent(),
            Timestamp.from(clock.instant().minusSeconds(1)),
            convergenceId,
        )
        assertThat(processConvergence.processOne("takedown-test-worker"))
            .isEqualTo(PublicConvergenceProcessResult.PROCESSED)

        val events =
            jdbcTemplate.queryForList(
                """
                select attempt_no, event_seq, status
                from public_convergence_events where convergence_id = ?
                order by attempt_no, event_seq
                """.trimIndent(),
                convergenceId,
            )
        assertThat(events.map { "${it["attempt_no"]}:${it["event_seq"]}:${it["status"]}" })
            .containsExactly("1:0:PENDING", "1:1:FAILED", "2:0:PENDING", "2:1:SUCCEEDED")
        assertThat(receiptBytes()).isEqualTo(receiptBytesBefore)
        assertThat(count("admin_public_takedown_receipts")).isOne()
        assertThat(generation()).isEqualTo(8)
    }

    @Test
    fun `raw reason and private body are absent from dto database and audit while hard delete preserves evidence`() {
        whenever(activationEvidence.confirmEnabled()).thenReturn(true)
        val rawReason = "SENSITIVE_REASON_SENTINEL"
        val privateBody = "Synthetic public summary"
        val previewId = createPreview(OWNER_USER_ID)
        val body =
            mockMvc
                .post("/api/admin/public-takedowns/confirm") {
                    contentType = MediaType.APPLICATION_JSON
                    content = confirmRequest(previewId, "key-privacy-hard-delete-01", reason = rawReason)
                    trustedAdminRequest(OWNER_USER_ID)
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.reason") { doesNotExist() }
                    jsonPath("$.reasonRedacted") { value(true) }
                }.andReturn()
                .response
                .contentAsString
        assertThat(body).doesNotContain(rawReason).doesNotContain(privateBody)
        val persisted =
            jdbcTemplate
                .queryForList(
                    """
                    select cast(current_surfaces_json as char) value from admin_public_takedown_previews
                    union all select cast(current_surfaces_json as char) from admin_public_takedown_receipts
                    union all select cast(metadata_json as char) from platform_audit_events
                      where event_type = 'EMERGENCY_PUBLIC_TAKEDOWN_CONFIRMED'
                    """.trimIndent(),
                    String::class.java,
                ).joinToString("\n")
        assertThat(persisted).doesNotContain(rawReason).doesNotContain(privateBody)

        val convergenceId = JsonPath.read<String>(body, "$.convergenceId")
        jdbcTemplate.update(
            """
            update sessions
            set deleted_at = date_sub(utc_timestamp(6), interval 8 day),
                deleted_by_membership_id = '00000000-0000-0000-0000-000000000201',
                purge_after = date_sub(utc_timestamp(6), interval 1 day)
            where id = ?
            """.trimIndent(),
            SESSION_ID,
        )
        hostSessionTrashScheduler.purgeExpired()
        expireOperationalTakedownRows()
        assertThat(purgeExpiredMutationIdempotency.purgeExpired(50)).isGreaterThanOrEqualTo(2)

        assertThat(count("public_projection_generations", "publication_id", PUBLICATION_ID)).isZero()
        assertThat(count("sessions", "id", SESSION_ID)).isZero()
        assertThat(count("admin_public_takedown_previews")).isZero()
        assertThat(count("admin_public_takedown_idempotency")).isZero()
        assertThat(count("admin_public_takedown_receipts")).isOne()
        assertThat(count("public_mutation_convergence_receipts", "convergence_id", convergenceId)).isOne()
        assertThat(count("public_convergence_work", "convergence_id", convergenceId)).isOne()
    }

    private fun expireOperationalTakedownRows() {
        val expiredAt = Timestamp.from(clock.instant().minusSeconds(1))
        jdbcTemplate.update("update admin_public_takedown_previews set expires_at = ?", expiredAt)
        jdbcTemplate.update("update admin_public_takedown_idempotency set expires_at = ?", expiredAt)
    }

    private fun createPreview(userId: String): String =
        mockMvc
            .post("/api/admin/public-takedowns/preview") {
                contentType = MediaType.APPLICATION_JSON
                content = previewRequest()
                trustedAdminRequest(userId)
            }.andExpect {
                status { isOk() }
            }.andReturn()
            .response
            .contentAsString
            .let { body -> Regex("\"previewId\":\"([^\"]+)\"").find(body)!!.groupValues[1] }

    private fun confirm(
        userId: String,
        previewId: String,
        key: String,
    ): String =
        mockMvc
            .post("/api/admin/public-takedowns/confirm") {
                contentType = MediaType.APPLICATION_JSON
                content = confirmRequest(previewId, key)
                trustedAdminRequest(userId)
            }.andExpect {
                status { isOk() }
            }.andReturn()
            .response
            .contentAsString

    private fun org.springframework.test.web.servlet.MockHttpServletRequestDsl.trustedAdminRequest(userId: String) {
        header(BFF_SECRET_HEADER, BFF_SECRET)
        header("Origin", ALLOWED_ORIGIN)
        cookie(sessionCookieForUser(userId))
    }

    private fun sessionCookieForUser(userId: String): Cookie {
        val issued =
            authSessionService.issueSession(
                userId = userId,
                userAgent = "PlatformAdminPublicTakedownIntegrationTest",
                ipAddress = "127.0.0.1",
            )
        createdSessionTokenHashes += issued.storedTokenHash
        return Cookie(AuthSessionService.COOKIE_NAME, issued.rawToken)
    }

    private fun insertPublishedTarget() {
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, session_date,
              start_time, end_time, location_label, question_deadline_at, state, visibility, access_scope
            ) values (?, ?, 9981, 'Synthetic takedown meeting', 'Synthetic book', 'Example Author',
                      '2026-08-01', '20:00:00', '22:00:00', 'online', '2026-07-31 12:00:00.000000',
                      'PUBLISHED', 'PUBLIC', 'GUEST_READABLE')
            """.trimIndent(),
            SESSION_ID,
            CLUB_ID,
        )
        jdbcTemplate.update(
            "insert into session_publication_versions (session_id, publication_revision) values (?, 1)",
            SESSION_ID,
        )
        jdbcTemplate.update(
            """
            insert into public_session_publications (
              id, club_id, session_id, public_summary, is_public, published_at,
              visibility, site_visibility
            ) values (?, ?, ?, 'Synthetic public summary', true, utc_timestamp(6), 'PUBLIC', 'PUBLIC_RECORD')
            """.trimIndent(),
            PUBLICATION_ID,
            CLUB_ID,
            SESSION_ID,
        )
        jdbcTemplate.update(
            """
            insert into public_projection_generations (
              publication_id, club_id, session_id, generation, live_record_revision, origin_readable
            ) values (?, ?, ?, 7, 1, true)
            """.trimIndent(),
            PUBLICATION_ID,
            CLUB_ID,
            SESSION_ID,
        )
        jdbcTemplate.update(
            """
            insert into public_projection_current (
              session_id, club_id, publication_id_snapshot, generation, club_generation,
              live_record_revision, origin_readable, convergence_id
            ) values (?, ?, ?, 7, 1, 1, true, null)
            """.trimIndent(),
            SESSION_ID,
            CLUB_ID,
            PUBLICATION_ID,
        )
    }

    private fun cleanupFixture() {
        jdbcTemplate.update(
            """
            delete from public_convergence_work
            where convergence_id in (select convergence_id from admin_public_takedown_receipts)
            """.trimIndent(),
        )
        jdbcTemplate.update(
            """
            delete from public_mutation_convergence_receipts
            where mutation_receipt_id in (select id from admin_public_takedown_receipts)
            """.trimIndent(),
        )
        jdbcTemplate.update("delete from admin_public_takedown_idempotency")
        jdbcTemplate.update("delete from admin_public_takedown_previews")
        jdbcTemplate.update("delete from admin_public_takedown_receipts")
        jdbcTemplate.update(
            "delete from platform_audit_events " +
                "where event_type = 'EMERGENCY_PUBLIC_TAKEDOWN_CONFIRMED'",
        )
        listOf(
            "delete from public_projection_current where publication_id_snapshot = ?",
            "delete from public_projection_generations where publication_id = ?",
            "delete from public_session_publications where id = ?",
        ).forEach { sql -> jdbcTemplate.update(sql, PUBLICATION_ID) }
        jdbcTemplate.update("delete from session_publication_versions where session_id = ?", SESSION_ID)
        jdbcTemplate.update("delete from sessions where id = ?", SESSION_ID)
        jdbcTemplate.update("delete from platform_admins where user_id = ?", DISABLED_ADMIN_ID)
        jdbcTemplate.update("delete from auth_sessions where user_id = ?", DISABLED_ADMIN_ID)
        jdbcTemplate.update("delete from users where id = ?", DISABLED_ADMIN_ID)
    }

    private fun seedDisabledAdmin() {
        jdbcTemplate.update(
            """
            insert into users (id, email, name, short_name, auth_provider)
            values (?, 'disabled-takedown-admin@example.test', 'Disabled Admin', 'Disabled', 'GOOGLE')
            """.trimIndent(),
            DISABLED_ADMIN_ID,
        )
        jdbcTemplate.update(
            "insert into platform_admins (user_id, role, status) values (?, 'OPERATOR', 'DISABLED')",
            DISABLED_ADMIN_ID,
        )
    }

    private fun count(table: String): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from $table",
            Int::class.java,
        ) ?: 0

    private fun count(
        table: String,
        column: String,
        value: String,
    ): Int = jdbcTemplate.queryForObject("select count(*) from $table where $column = ?", Int::class.java, value) ?: 0

    private fun originReadable(): Boolean =
        jdbcTemplate.queryForObject(
            "select origin_readable from public_projection_generations where publication_id = ?",
            Boolean::class.java,
            PUBLICATION_ID,
        ) ?: false

    private fun generation(): Long =
        jdbcTemplate.queryForObject(
            "select generation from public_projection_generations where publication_id = ?",
            Long::class.java,
            PUBLICATION_ID,
        ) ?: -1

    private fun receiptBytes(): String =
        jdbcTemplate
            .queryForObject(
                """
                select concat_ws('|', id, convergence_id, actor_user_id_snapshot, actor_platform_role_snapshot,
                       reason_category, reason_redacted, club_id_snapshot, session_id_snapshot,
                       publication_id_snapshot, committed_generation, origin_result,
                       cast(current_surfaces_json as char), remote_copy_limitation_code, created_at)
                from admin_public_takedown_receipts
                """.trimIndent(),
                String::class.java,
            ).orEmpty()
}

private fun previewRequest(
    clubId: String = CLUB_ID,
    sessionId: String = SESSION_ID,
    publicationId: String = PUBLICATION_ID,
): String =
    """
    {
      "clubId":"$clubId",
      "sessionId":"$sessionId",
      "publicationId":"$publicationId"
    }
    """.trimIndent()

private fun confirmRequest(
    previewId: String,
    key: String,
    category: String = "PRIVATE_DATA",
    reason: String = "Synthetic incident reason",
): String =
    """
    {
      "previewId":"$previewId",
      "reasonCategory":"$category",
      "reason":"$reason",
      "idempotencyKey":"$key"
    }
    """.trimIndent()

private const val BFF_SECRET_HEADER = "X-Readmates-Bff-Secret"
private const val BFF_SECRET = "test-bff-secret"
private const val ALLOWED_ORIGIN = "http://localhost:3000"
private const val OWNER_USER_ID = "00000000-0000-0000-0000-000000000901"
private const val SUPPORT_USER_ID = "00000000-0000-0000-0000-000000000903"
private const val OPERATOR_USER_ID = "00000000-0000-0000-0000-000000000902"
private const val HOST_USER_ID = "00000000-0000-0000-0000-000000000101"
private const val DISABLED_ADMIN_ID = "00000000-0000-0000-0000-00000000d559"
private const val CLUB_ID = "00000000-0000-0000-0000-000000000001"
private const val SESSION_ID = "00000000-0000-0000-0000-00000000d551"
private const val PUBLICATION_ID = "00000000-0000-0000-0000-00000000d552"
private const val REMOTE_COPY_LIMITATION =
    "이미 표시되었거나 저장된 사본과 연결이 끊긴 " +
        "오프라인 사본은 원격으로 삭제할 수 없습니다."
private const val TEST_PREVIOUS_DIGEST_KEY = "test-mutation-identity-previous-key"
