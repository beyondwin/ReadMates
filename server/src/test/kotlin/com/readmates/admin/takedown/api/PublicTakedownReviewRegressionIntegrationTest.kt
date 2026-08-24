package com.readmates.admin.takedown.api

import com.jayway.jsonpath.JsonPath
import com.readmates.admin.takedown.application.port.out.PublicTakedownActivationEvidencePort
import com.readmates.auth.application.service.AuthSessionService
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import jakarta.servlet.http.Cookie
import org.assertj.core.api.Assertions.assertThat
import org.hamcrest.Matchers.hasItem
import org.hamcrest.Matchers.not
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
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
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
class PublicTakedownReviewRegressionIntegrationTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val authSessionService: AuthSessionService,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    @MockitoBean
    private lateinit var activationEvidence: PublicTakedownActivationEvidencePort

    private lateinit var fixture: PublicTakedownReviewFixture

    @BeforeEach
    fun prepare() {
        fixture = PublicTakedownReviewFixture(mockMvc, authSessionService, jdbcTemplate, activationEvidence)
        fixture.prepare()
    }

    @AfterEach
    fun cleanup() = fixture.cleanup()

    @Test
    fun `confirmed takedown removes target from every public projection reader`() {
        val countsBefore = fixture.assertTargetVisible()
        fixture.confirmSuccessfully("key-review-reader-deny-0001")
        fixture.assertTargetHidden(countsBefore)
    }

    @Test
    fun `closed guest archive cannot bypass an emergency deny marker`() {
        val countsBefore = fixture.assertTargetVisible()
        fixture.confirmSuccessfully("key-review-closed-archive-deny")
        jdbcTemplate.update("update sessions set state = 'CLOSED' where id = ?", REVIEW_SESSION_ID)

        fixture.assertTargetHidden(countsBefore)
    }

    @Test
    fun `public club list uses the same sixty second freshness boundary as takedown detail`() {
        mockMvc
            .get("/api/public/clubs/reading-sai") {
                header(REVIEW_BFF_HEADER, REVIEW_BFF_SECRET)
            }.andExpect {
                status { isOk() }
                header { string("Cache-Control", "public, max-age=60, must-revalidate") }
            }
    }

    @Test
    fun `expiry generation target mismatch and invalid bounded inputs fail closed`() {
        fixture.assertValidationBoundaries()
    }

    @Test
    fun `concurrent same key same request converges on the winning receipt`() {
        val previewId = fixture.createPreview()
        val request = reviewConfirmRequest(previewId, "key-review-concurrent-same-01")

        val results = fixture.raceConfirms(request, request)

        assertThat(results.map(ReviewHttpResult::status)).containsExactlyInAnyOrder(200, 200)
        assertThat(results.map { JsonPath.read<String>(it.body, "$.receiptId") }).containsOnly(
            JsonPath.read(results.first().body, "$.receiptId"),
        )
        fixture.assertExactOnceTakedown()
    }

    @Test
    fun `concurrent same key different request returns one receipt and one conflict`() {
        val previewId = fixture.createPreview()
        val key = "key-review-concurrent-conflict"
        val results =
            fixture.raceConfirms(
                reviewConfirmRequest(previewId, key, "First synthetic reason"),
                reviewConfirmRequest(previewId, key, "Different synthetic reason"),
            )

        assertThat(results.map(ReviewHttpResult::status)).containsExactlyInAnyOrder(200, 409)
        assertThat(results.single { it.status == 409 }.body).contains("IDEMPOTENCY_KEY_REUSED")
        fixture.assertExactOnceTakedown()
    }

    @Test
    fun `concurrent different keys across previews rotate the target only once`() {
        val firstPreviewId = fixture.createPreview()
        val secondPreviewId = fixture.createPreview()
        val results =
            fixture.raceConfirms(
                reviewConfirmRequest(firstPreviewId, "key-review-concurrent-first"),
                reviewConfirmRequest(secondPreviewId, "key-review-concurrent-second"),
            )

        assertThat(results.count { it.status == 200 }).isOne()
        assertThat(results.count { it.status == 409 }).isOne()
        assertThat(results.single { it.status == 409 }.body)
            .containsAnyOf("GENERATION_MISMATCH", "TARGET_NOT_PUBLIC")
        fixture.assertExactOnceTakedown()
    }
}

private class PublicTakedownReviewFixture(
    private val mockMvc: MockMvc,
    private val authSessionService: AuthSessionService,
    private val jdbcTemplate: JdbcTemplate,
    private val activationEvidence: PublicTakedownActivationEvidencePort,
) {
    private val createdSessionTokenHashes = linkedSetOf<String>()

    fun prepare() {
        cleanupReviewTarget(jdbcTemplate)
        insertReviewTarget(jdbcTemplate)
        whenever(activationEvidence.confirmEnabled()).thenReturn(false)
    }

    fun cleanup() {
        if (createdSessionTokenHashes.isNotEmpty()) {
            val placeholders = createdSessionTokenHashes.joinToString(",") { "?" }
            jdbcTemplate.update(
                "delete from auth_sessions where session_token_hash in ($placeholders)",
                *createdSessionTokenHashes.toTypedArray(),
            )
        }
        cleanupReviewTarget(jdbcTemplate)
    }

    fun assertTargetVisible(): PublicCounts {
        val clubBody =
            mockMvc
                .get("/api/public/clubs/reading-sai") { header(REVIEW_BFF_HEADER, REVIEW_BFF_SECRET) }
                .andExpect {
                    status { isOk() }
                    jsonPath("$.recentSessions[*].sessionId") { value(hasItem(REVIEW_SESSION_ID)) }
                    jsonPath("$.recentSessions[*].bookTitle") { value(hasItem(REVIEW_BOOK_TITLE)) }
                    jsonPath("$.recentSessions[*].summary") { value(hasItem(REVIEW_PUBLIC_SUMMARY)) }
                }.andReturn()
                .response
                .contentAsString
        mockMvc
            .get("/api/public/clubs/reading-sai/sessions/$REVIEW_SESSION_ID") {
                header(REVIEW_BFF_HEADER, REVIEW_BFF_SECRET)
            }.andExpect { status { isOk() } }
        listOf("browse/notes/sessions", "browse/archive").forEach { path ->
            mockMvc
                .get("/api/public/clubs/reading-sai/$path") {
                    header(REVIEW_BFF_HEADER, REVIEW_BFF_SECRET)
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.items[*].sessionId") { value(hasItem(REVIEW_SESSION_ID)) }
                }
        }
        return PublicCounts(
            sessions = JsonPath.read(clubBody, "$.stats.sessions"),
            books = JsonPath.read(clubBody, "$.stats.books"),
        )
    }

    fun assertTargetHidden(before: PublicCounts) {
        val clubBody =
            mockMvc
                .get("/api/public/clubs/reading-sai") { header(REVIEW_BFF_HEADER, REVIEW_BFF_SECRET) }
                .andExpect {
                    status { isOk() }
                    jsonPath("$.recentSessions[*].sessionId") { value(not(hasItem(REVIEW_SESSION_ID))) }
                    jsonPath("$.recentSessions[*].bookTitle") { value(not(hasItem(REVIEW_BOOK_TITLE))) }
                    jsonPath("$.recentSessions[*].summary") { value(not(hasItem(REVIEW_PUBLIC_SUMMARY))) }
                }.andReturn()
                .response
                .contentAsString
        assertThat(JsonPath.read<Int>(clubBody, "$.stats.sessions")).isEqualTo(before.sessions - 1)
        assertThat(JsonPath.read<Int>(clubBody, "$.stats.books")).isEqualTo(before.books - 1)
        listOf("sessions/$REVIEW_SESSION_ID", "browse/archive/$REVIEW_SESSION_ID").forEach { path ->
            mockMvc
                .get("/api/public/clubs/reading-sai/$path") {
                    header(REVIEW_BFF_HEADER, REVIEW_BFF_SECRET)
                }.andExpect { status { isNotFound() } }
        }
        listOf("browse/notes/sessions", "browse/archive").forEach { path ->
            mockMvc
                .get("/api/public/clubs/reading-sai/$path") {
                    header(REVIEW_BFF_HEADER, REVIEW_BFF_SECRET)
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.items[*].sessionId") { value(not(hasItem(REVIEW_SESSION_ID))) }
                }
        }
    }

    fun assertValidationBoundaries() {
        whenever(activationEvidence.confirmEnabled()).thenReturn(true)
        val expired = createPreview()
        jdbcTemplate.update(
            "update admin_public_takedown_previews " +
                "set expires_at = date_sub(utc_timestamp(6), interval 1 minute) where id = ?",
            expired,
        )
        mockMvc.assertReviewConfirmError(
            sessionCookie(),
            reviewConfirmRequest(expired, "key-review-expired-preview"),
            410,
            "PREVIEW_EXPIRED",
        )
        val stale = createPreview()
        jdbcTemplate.update(
            "update public_projection_current set generation = generation + 1 where publication_id_snapshot = ?",
            REVIEW_PUBLICATION_ID,
        )
        mockMvc.assertReviewConfirmError(
            sessionCookie(),
            reviewConfirmRequest(stale, "key-review-generation-mismatch"),
            409,
            "GENERATION_MISMATCH",
        )
        jdbcTemplate.update(
            "update public_projection_current set generation = 7 where publication_id_snapshot = ?",
            REVIEW_PUBLICATION_ID,
        )
        reviewMismatchedPreviewRequests().forEach { mockMvc.assertReviewTargetNotFound(sessionCookie(), it) }
        val valid = createPreview()
        reviewInvalidConfirmRequests(valid).forEach { (body, code) ->
            mockMvc.assertReviewConfirmError(sessionCookie(), body, 400, code)
        }
        assertThat(reviewGeneration(jdbcTemplate)).isEqualTo(7)
        assertThat(reviewCount(jdbcTemplate, "admin_public_takedown_receipts")).isZero()
    }

    fun confirmSuccessfully(key: String) {
        whenever(activationEvidence.confirmEnabled()).thenReturn(true)
        val previewId = createPreview()
        mockMvc
            .post("/api/admin/public-takedowns/confirm") {
                contentType = MediaType.APPLICATION_JSON
                content = reviewConfirmRequest(previewId, key)
                header(REVIEW_BFF_HEADER, REVIEW_BFF_SECRET)
                header("Origin", REVIEW_ALLOWED_ORIGIN)
                cookie(sessionCookie())
            }.andExpect { status { isOk() } }
    }

    fun createPreview(): String =
        mockMvc
            .post("/api/admin/public-takedowns/preview") {
                contentType = MediaType.APPLICATION_JSON
                content = reviewPreviewRequest()
                header(REVIEW_BFF_HEADER, REVIEW_BFF_SECRET)
                header("Origin", REVIEW_ALLOWED_ORIGIN)
                cookie(sessionCookie())
            }.andExpect { status { isOk() } }
            .andReturn()
            .response
            .contentAsString
            .let { JsonPath.read(it, "$.previewId") }

    fun raceConfirms(
        firstRequest: String,
        secondRequest: String,
    ): List<ReviewHttpResult> {
        val firstCookie = sessionCookie()
        val secondCookie = sessionCookie()
        val ready = CountDownLatch(2)
        val release = CountDownLatch(1)
        whenever(activationEvidence.confirmEnabled()).thenAnswer {
            ready.countDown()
            check(release.await(10, TimeUnit.SECONDS)) { "concurrent confirms did not reach activation gate" }
            true
        }
        val executor = Executors.newFixedThreadPool(2)
        return try {
            val first = executor.submit<ReviewHttpResult> { confirmRaw(firstCookie, firstRequest) }
            val second = executor.submit<ReviewHttpResult> { confirmRaw(secondCookie, secondRequest) }
            check(ready.await(10, TimeUnit.SECONDS)) { "concurrent confirms did not establish replay snapshots" }
            release.countDown()
            listOf(first.get(15, TimeUnit.SECONDS), second.get(15, TimeUnit.SECONDS))
        } finally {
            release.countDown()
            executor.shutdownNow()
        }
    }

    fun assertExactOnceTakedown() {
        assertThat(reviewGeneration(jdbcTemplate)).isEqualTo(8)
        assertThat(reviewCount(jdbcTemplate, "admin_public_takedown_receipts")).isOne()
        assertThat(reviewCount(jdbcTemplate, "public_mutation_convergence_receipts")).isOne()
        assertThat(reviewCount(jdbcTemplate, "public_convergence_work")).isOne()
        assertThat(reviewCount(jdbcTemplate, "platform_audit_events")).isOne()
    }

    private fun confirmRaw(
        cookie: Cookie,
        request: String,
    ): ReviewHttpResult =
        mockMvc
            .post("/api/admin/public-takedowns/confirm") {
                contentType = MediaType.APPLICATION_JSON
                content = request
                header(REVIEW_BFF_HEADER, REVIEW_BFF_SECRET)
                header("Origin", REVIEW_ALLOWED_ORIGIN)
                cookie(cookie)
            }.andReturn()
            .response
            .let { ReviewHttpResult(it.status, it.contentAsString) }

    private fun sessionCookie(): Cookie {
        val issued =
            authSessionService.issueSession(
                userId = REVIEW_OWNER_USER_ID,
                userAgent = "PublicTakedownReviewRegressionIntegrationTest",
                ipAddress = "127.0.0.1",
            )
        createdSessionTokenHashes += issued.storedTokenHash
        return Cookie(AuthSessionService.COOKIE_NAME, issued.rawToken)
    }
}

private fun insertReviewTarget(jdbcTemplate: JdbcTemplate) {
    jdbcTemplate.update(
        """
        insert into sessions (
          id, club_id, number, title, book_title, book_author, session_date,
          start_time, end_time, location_label, question_deadline_at, state, visibility, access_scope
        ) values (?, ?, 9982, 'Synthetic review takedown meeting', ?, 'Example Author',
                  '2026-08-02', '20:00:00', '22:00:00', 'online', '2026-08-01 12:00:00.000000',
                  'PUBLISHED', 'PUBLIC', 'GUEST_READABLE')
        """.trimIndent(),
        REVIEW_SESSION_ID,
        REVIEW_CLUB_ID,
        REVIEW_BOOK_TITLE,
    )
    jdbcTemplate.update(
        "insert into session_publication_versions (session_id, publication_revision) values (?, 1)",
        REVIEW_SESSION_ID,
    )
    jdbcTemplate.update(
        """
        insert into public_session_publications (
          id, club_id, session_id, public_summary, is_public, published_at, visibility, site_visibility
        ) values (?, ?, ?, ?, true, utc_timestamp(6), 'PUBLIC', 'PUBLIC_RECORD')
        """.trimIndent(),
        REVIEW_PUBLICATION_ID,
        REVIEW_CLUB_ID,
        REVIEW_SESSION_ID,
        REVIEW_PUBLIC_SUMMARY,
    )
    jdbcTemplate.update(
        """
        insert into public_projection_generations (
          publication_id, club_id, session_id, generation, live_record_revision, origin_readable
        ) values (?, ?, ?, 7, 1, true)
        """.trimIndent(),
        REVIEW_PUBLICATION_ID,
        REVIEW_CLUB_ID,
        REVIEW_SESSION_ID,
    )
    jdbcTemplate.update(
        """
        insert into public_projection_current (
          session_id, club_id, publication_id_snapshot, generation, club_generation,
          live_record_revision, origin_readable, convergence_id
        ) values (?, ?, ?, 7, 1, 1, true, null)
        """.trimIndent(),
        REVIEW_SESSION_ID,
        REVIEW_CLUB_ID,
        REVIEW_PUBLICATION_ID,
    )
}

private fun cleanupReviewTarget(jdbcTemplate: JdbcTemplate) {
    val convergenceReceiptScope =
        "select convergence_id from admin_public_takedown_receipts where publication_id_snapshot = ?"
    jdbcTemplate.update(
        "delete from public_convergence_work where convergence_id in ($convergenceReceiptScope)",
        REVIEW_PUBLICATION_ID,
    )
    jdbcTemplate.update(
        "delete from public_mutation_convergence_receipts where publication_id_snapshot = ?",
        REVIEW_PUBLICATION_ID,
    )
    jdbcTemplate.update(
        "delete from admin_public_takedown_idempotency where publication_id = ?",
        REVIEW_PUBLICATION_ID,
    )
    jdbcTemplate.update(
        "delete from admin_public_takedown_previews where publication_id_snapshot = ?",
        REVIEW_PUBLICATION_ID,
    )
    jdbcTemplate.update(
        "delete from admin_public_takedown_receipts where publication_id_snapshot = ?",
        REVIEW_PUBLICATION_ID,
    )
    jdbcTemplate.update(
        """
        delete from platform_audit_events
        where event_type = 'EMERGENCY_PUBLIC_TAKEDOWN_CONFIRMED'
          and json_unquote(json_extract(metadata_json, '$.publicationId')) = ?
        """.trimIndent(),
        REVIEW_PUBLICATION_ID,
    )
    jdbcTemplate.update("delete from public_projection_current where publication_id_snapshot = ?", REVIEW_PUBLICATION_ID)
    jdbcTemplate.update("delete from public_projection_generations where publication_id = ?", REVIEW_PUBLICATION_ID)
    jdbcTemplate.update("delete from public_session_publications where id = ?", REVIEW_PUBLICATION_ID)
    jdbcTemplate.update("delete from session_publication_versions where session_id = ?", REVIEW_SESSION_ID)
    jdbcTemplate.update("delete from sessions where id = ?", REVIEW_SESSION_ID)
}

private fun reviewCount(
    jdbcTemplate: JdbcTemplate,
    table: String,
): Int {
    val predicate =
        when (table) {
            "admin_public_takedown_receipts" -> "publication_id_snapshot = '$REVIEW_PUBLICATION_ID'"
            "public_mutation_convergence_receipts" -> "publication_id_snapshot = '$REVIEW_PUBLICATION_ID'"
            "public_convergence_work" ->
                "convergence_id in (select convergence_id from admin_public_takedown_receipts " +
                    "where publication_id_snapshot = '$REVIEW_PUBLICATION_ID')"
            "platform_audit_events" ->
                "event_type = 'EMERGENCY_PUBLIC_TAKEDOWN_CONFIRMED' and " +
                    "json_unquote(json_extract(metadata_json, '$.publicationId')) = '$REVIEW_PUBLICATION_ID'"
            else -> error("unsupported review count table")
        }
    return jdbcTemplate.queryForObject("select count(*) from $table where $predicate", Int::class.java) ?: 0
}

private fun reviewGeneration(jdbcTemplate: JdbcTemplate): Long =
    jdbcTemplate.queryForObject(
        "select generation from public_projection_current where publication_id_snapshot = ?",
        Long::class.java,
        REVIEW_PUBLICATION_ID,
    ) ?: -1

private fun reviewPreviewRequest(
    clubId: String = REVIEW_CLUB_ID,
    sessionId: String = REVIEW_SESSION_ID,
    publicationId: String = REVIEW_PUBLICATION_ID,
): String =
    """
    {"clubId":"$clubId","sessionId":"$sessionId","publicationId":"$publicationId"}
    """.trimIndent()

private fun reviewConfirmRequest(
    previewId: String,
    key: String,
    reason: String = "Synthetic incident reason",
    category: String = "PRIVATE_DATA",
): String =
    """
    {"previewId":"$previewId","reasonCategory":"$category","reason":"$reason","idempotencyKey":"$key"}
    """.trimIndent()

private fun reviewMismatchedPreviewRequests(): List<String> =
    listOf(
        reviewPreviewRequest(publicationId = REVIEW_MISMATCHED_ID),
        reviewPreviewRequest(clubId = REVIEW_MISMATCHED_ID),
        reviewPreviewRequest(sessionId = REVIEW_MISMATCHED_ID),
    )

private fun reviewInvalidConfirmRequests(previewId: String): List<Pair<String, String>> =
    listOf(
        reviewConfirmRequest(previewId, "key-review-invalid-category", category = "") to
            "INVALID_REASON_CATEGORY",
        reviewConfirmRequest(previewId, "key-review-long-category", category = "X".repeat(65)) to
            "INVALID_REASON_CATEGORY",
        reviewConfirmRequest(previewId, "key-review-arbitrary-category", category = "MEMBER_EMAIL_EXPOSURE") to
            "INVALID_REASON_CATEGORY",
        reviewConfirmRequest(previewId, "key-review-blank-reason", reason = "   ") to "INVALID_REASON",
        reviewConfirmRequest(previewId, "key-review-long-reason", reason = "x".repeat(501)) to "INVALID_REASON",
        reviewConfirmRequest(previewId, "unsafe key") to "INVALID_IDEMPOTENCY_KEY",
        reviewConfirmRequest(previewId, "") to "INVALID_IDEMPOTENCY_KEY",
        reviewConfirmRequest(previewId, "k".repeat(129)) to "INVALID_IDEMPOTENCY_KEY",
    )

private fun MockMvc.assertReviewConfirmError(
    cookie: Cookie,
    request: String,
    statusCode: Int,
    code: String,
) {
    post("/api/admin/public-takedowns/confirm") {
        contentType = MediaType.APPLICATION_JSON
        content = request
        header(REVIEW_BFF_HEADER, REVIEW_BFF_SECRET)
        header("Origin", REVIEW_ALLOWED_ORIGIN)
        cookie(cookie)
    }.andExpect {
        status { isEqualTo(statusCode) }
        jsonPath("$.code") { value(code) }
    }
}

private fun MockMvc.assertReviewTargetNotFound(
    cookie: Cookie,
    request: String,
) {
    post("/api/admin/public-takedowns/preview") {
        contentType = MediaType.APPLICATION_JSON
        content = request
        header(REVIEW_BFF_HEADER, REVIEW_BFF_SECRET)
        header("Origin", REVIEW_ALLOWED_ORIGIN)
        cookie(cookie)
    }.andExpect {
        status { isNotFound() }
        jsonPath("$.code") { value("TARGET_NOT_FOUND") }
    }
}

private data class PublicCounts(
    val sessions: Int,
    val books: Int,
)

private data class ReviewHttpResult(
    val status: Int,
    val body: String,
)

private const val REVIEW_BFF_HEADER = "X-Readmates-Bff-Secret"
private const val REVIEW_BFF_SECRET = "test-bff-secret"
private const val REVIEW_ALLOWED_ORIGIN = "http://localhost:3000"
private const val REVIEW_OWNER_USER_ID = "00000000-0000-0000-0000-000000000901"
private const val REVIEW_CLUB_ID = "00000000-0000-0000-0000-000000000001"
private const val REVIEW_SESSION_ID = "00000000-0000-0000-0000-00000000d561"
private const val REVIEW_PUBLICATION_ID = "00000000-0000-0000-0000-00000000d562"
private const val REVIEW_MISMATCHED_ID = "00000000-0000-0000-0000-00000000ffff"
private const val REVIEW_BOOK_TITLE = "Synthetic reviewer book"
private const val REVIEW_PUBLIC_SUMMARY = "Synthetic reviewer public summary"
