package com.readmates.club.api

import com.jayway.jsonpath.JsonPath
import com.readmates.auth.application.AuthApplicationException
import com.readmates.auth.application.MemberLifecycleRequest
import com.readmates.auth.application.port.`in`.LeaveMembershipUseCase
import com.readmates.auth.application.service.AuthSessionService
import com.readmates.club.adapter.out.persistence.JdbcPlatformAdminClubVisibilityLockAdapter
import com.readmates.club.application.model.ClubDomainActualCheckResult
import com.readmates.club.application.port.`in`.ClubLifecycleUseCase
import com.readmates.club.application.port.out.LockedPlatformAdminClubVisibilityState
import com.readmates.club.application.port.out.PlatformAdminClubVisibilityLockPort
import com.readmates.club.domain.ClubDomainStatus
import com.readmates.club.domain.ClubPublicVisibility
import com.readmates.club.domain.ClubStatus
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.adminmutation.application.model.CanonicalAdminCommandRequest
import com.readmates.shared.adminmutation.application.model.PlatformAdminCommandIdentity
import com.readmates.shared.adminmutation.application.service.AdminCommandIdentityService
import com.readmates.shared.adminmutation.config.AdminCommandIdentityProperties
import com.readmates.shared.security.ClubActor
import com.readmates.shared.security.ClubCapability
import com.readmates.shared.security.CurrentPlatformAdmin
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
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.auth.session-cookie-secure=false",
    ],
)
@AutoConfigureMockMvc
@Import(PlatformAdminDomainCheckTestConfiguration::class, PlatformAdminVisibilityLockTestConfiguration::class)
@Tag("integration")
class PlatformAdminClubCommandDbTest(
    @param:Autowired mockMvc: MockMvc,
    @param:Autowired authSessionService: AuthSessionService,
    @param:Autowired jdbcTemplate: JdbcTemplate,
    @param:Autowired domainChecker: FakeClubDomainActualStateChecker,
    @param:Autowired private val visibilityLock: BlockingPlatformAdminClubVisibilityLockPort,
    @param:Autowired private val clubLifecycle: ClubLifecycleUseCase,
    @param:Autowired private val leaveMembership: LeaveMembershipUseCase,
) : PlatformAdminClubCommandDbSupport(mockMvc, authSessionService, jdbcTemplate, domainChecker) {
    @Test
    fun `two admins from one revision produce one metadata winner and one audit event`() {
        val firstAdmin = createPlatformAdmin("OWNER")
        val secondAdmin = createPlatformAdmin("OPERATOR")
        val clubId = createClub()

        patchMetadata(firstAdmin, clubId, expectedRevision = 0, name = "First Winner")
            .andExpect {
                status { isOk() }
                jsonPath("$.adminRevision") { value(1) }
                jsonPath("$.name") { value("First Winner") }
            }
        patchMetadata(secondAdmin, clubId, expectedRevision = 0, name = "Stale Loser")
            .andExpect { status { isConflict() } }

        val stored =
            jdbcTemplate.queryForMap(
                "select name, admin_revision from clubs where id = ?",
                clubId,
            )
        assertThat(stored["name"]).isEqualTo("First Winner")
        assertThat((stored["admin_revision"] as Number).toLong()).isEqualTo(1)
        assertThat(
            jdbcTemplate.queryForObject(
                "select count(*) from platform_audit_events where event_type = 'ADMIN_CLUB_METADATA_UPDATED'",
                Int::class.java,
            ),
        ).isOne()
    }

    @Test
    fun `visibility confirm consumes preview atomically and response loss replays one receipt`() {
        val admin = createPlatformAdmin("OWNER")
        val clubId = createClub(ClubStatus.SETUP_REQUIRED)
        assignActiveHost(clubId)
        val preview = previewVisibility(admin, clubId, expectedRevision = 0, target = "PUBLIC")
        val previewId = JsonPath.read<String>(preview, "$.previewId")
        val idempotencyKey = "visibility-response-loss-${UUID.randomUUID()}"

        val first = confirmVisibility(admin, clubId, previewId, idempotencyKey, expectedRevision = 0)
        jdbcTemplate.update(
            """
            update platform_admin_club_command_previews
            set created_at = timestampadd(minute, -2, utc_timestamp(6)),
                expires_at = timestampadd(minute, -1, utc_timestamp(6))
            where id = ?
            """.trimIndent(),
            previewId,
        )
        val replay = confirmVisibility(admin, clubId, previewId, idempotencyKey, expectedRevision = 0)

        assertThat(JsonPath.read<String>(replay, "$.receiptId"))
            .isEqualTo(JsonPath.read<String>(first, "$.receiptId"))
        assertThat(JsonPath.read<String>(first, "$.commandType")).isEqualTo("club.visibility.change")
        assertThat(JsonPath.read<Int>(first, "$.afterAdminRevision")).isEqualTo(1)
        assertVisibilityReceiptEffect(jdbcTemplate)
        assertThat(count("platform_admin_club_command_receipts")).isOne()
        assertThat(count("platform_admin_command_idempotency")).isOne()
        assertThat(
            jdbcTemplate.queryForObject(
                "select count(*) from platform_audit_events where event_type = 'ADMIN_CLUB_VISIBILITY_CHANGED'",
                Int::class.java,
            ),
        ).isOne()
        assertThat(
            jdbcTemplate.queryForObject(
                "select public_visibility from clubs where id = ?",
                String::class.java,
                clubId,
            ),
        ).isEqualTo("PUBLIC")
        assertThat(
            jdbcTemplate.queryForObject(
                "select consumed_at is not null from platform_admin_club_command_previews where id = ?",
                Boolean::class.java,
                previewId,
            ),
        ).isTrue()

        val changedPreview = previewVisibility(admin, clubId, expectedRevision = 1, target = "PRIVATE")
        confirmVisibility(
            admin,
            clubId,
            JsonPath.read(changedPreview, "$.previewId"),
            idempotencyKey,
            expectedRevision = 1,
            expectedStatus = 409,
        )
        assertThat(count("platform_admin_club_command_receipts")).isOne()
    }

    @Test
    fun `visibility preview created by previous digest key confirms after rotation`() {
        val admin = createPlatformAdmin("OWNER")
        val clubId = createClub()
        assignActiveHost(clubId)
        val previewId = JsonPath.read<String>(previewVisibility(admin, clubId, 0, "PUBLIC"), "$.previewId")
        val oldIdentityService =
            AdminCommandIdentityService(
                AdminCommandIdentityProperties(
                    currentKey = "test-admin-command-digest-previous-key",
                    currentKeyVersion = 0,
                    previousKeyVersion = 99,
                ),
            )
        val request =
            object : CanonicalAdminCommandRequest {
                override val schemaVersion: String = "admin.club.visibility.v1"

                override fun canonicalFields(): List<Pair<String, String>> =
                    listOf(
                        "clubId" to clubId,
                        "confirmed" to "true",
                        "expectedAdminRevision" to "0",
                        "previewId" to previewId,
                        "targetVisibility" to "PUBLIC",
                    )
            }
        val oldDigest =
            oldIdentityService.digest(
                PlatformAdminCommandIdentity(
                    platformAdminUserId = UUID.fromString(admin),
                    commandType = "club.visibility.change",
                    targetType = "club",
                    targetId = clubId,
                    idempotencyKey = previewId,
                ),
                request,
            )
        jdbcTemplate.update(
            """
            update platform_admin_club_command_previews
            set digest_key_version = ?, request_hmac = ?
            where id = ?
            """.trimIndent(),
            oldDigest.digestKeyVersion,
            oldDigest.requestHmac,
            previewId,
        )

        confirmVisibility(admin, clubId, previewId, "rotated-${UUID.randomUUID()}", 0)

        assertThat(count("platform_admin_club_command_receipts")).isOne()
        assertThat(
            jdbcTemplate.queryForObject(
                "select digest_key_version from platform_admin_club_command_previews where id = ?",
                Int::class.java,
                previewId,
            ),
        ).isZero()
    }

    @Test
    fun `two admins confirming visibility from one revision produce one public winner`() {
        val owner = createPlatformAdmin("OWNER")
        val operator = createPlatformAdmin("OPERATOR")
        val clubId = createClub()
        assignActiveHost(clubId)
        val ownerPreview = JsonPath.read<String>(previewVisibility(owner, clubId, 0, "PUBLIC"), "$.previewId")
        val operatorPreview = JsonPath.read<String>(previewVisibility(operator, clubId, 0, "PUBLIC"), "$.previewId")

        confirmVisibility(owner, clubId, ownerPreview, "owner-${UUID.randomUUID()}", 0)
        confirmVisibility(operator, clubId, operatorPreview, "operator-${UUID.randomUUID()}", 0, 409)

        assertThat(count("platform_admin_club_command_receipts")).isOne()
        assertThat(count("platform_admin_command_idempotency")).isOne()
        assertThat(
            jdbcTemplate.queryForObject(
                "select count(*) from platform_audit_events where event_type = 'ADMIN_CLUB_VISIBILITY_CHANGED'",
                Int::class.java,
            ),
        ).isOne()
        val club = jdbcTemplate.queryForMap("select public_visibility, admin_revision from clubs where id = ?", clubId)
        assertThat(club["public_visibility"]).isEqualTo("PUBLIC")
        assertThat((club["admin_revision"] as Number).toLong()).isOne()
    }

    @Test
    fun `visibility preview expiry consumption and request drift fail closed`() {
        val admin = createPlatformAdmin("OWNER")
        val clubId = createClub()
        assignActiveHost(clubId)

        val expiredId =
            JsonPath.read<String>(previewVisibility(admin, clubId, 0, "PUBLIC"), "$.previewId")
        jdbcTemplate.update(
            """
            update platform_admin_club_command_previews
            set created_at = timestampadd(minute, -2, utc_timestamp(6)),
                expires_at = timestampadd(minute, -1, utc_timestamp(6))
            where id = ?
            """.trimIndent(),
            expiredId,
        )
        confirmVisibility(admin, clubId, expiredId, "expired-${UUID.randomUUID()}", 0, 409)

        val driftedId =
            JsonPath.read<String>(previewVisibility(admin, clubId, 0, "PUBLIC"), "$.previewId")
        confirmVisibility(admin, clubId, driftedId, "drift-${UUID.randomUUID()}", 1, 409)

        val targetDriftId =
            JsonPath.read<String>(previewVisibility(admin, clubId, 0, "PUBLIC"), "$.previewId")
        confirmVisibility(
            admin,
            clubId,
            targetDriftId,
            "target-drift-${UUID.randomUUID()}",
            0,
            expectedStatus = 409,
            targetVisibility = "PRIVATE",
        )

        val consumedId =
            JsonPath.read<String>(previewVisibility(admin, clubId, 0, "PUBLIC"), "$.previewId")
        confirmVisibility(admin, clubId, consumedId, "winner-${UUID.randomUUID()}", 0)
        confirmVisibility(admin, clubId, consumedId, "loser-${UUID.randomUUID()}", 0, 409)

        assertThat(count("platform_admin_club_command_receipts")).isOne()
        assertThat(count("platform_admin_command_idempotency")).isOne()
        assertThat(
            jdbcTemplate.queryForObject(
                "select admin_revision from clubs where id = ?",
                Long::class.java,
                clubId,
            ),
        ).isEqualTo(1L)
    }

    @Test
    fun `visibility confirm rejects a preview owned by another command with a safe mismatch`() {
        val admin = createPlatformAdmin("OWNER")
        val clubId = createClub()
        assignActiveHost(clubId)
        val hostname = "cross-command-${UUID.randomUUID()}.example.test"
        val domainPreviewId = JsonPath.read<String>(previewDomain(admin, clubId, 0, hostname), "$.previewId")

        val response =
            confirmVisibility(
                admin,
                clubId,
                domainPreviewId,
                "cross-command-${UUID.randomUUID()}",
                0,
                expectedStatus = 409,
            )

        assertThat(JsonPath.read<String>(response, "$.code")).isEqualTo("PREVIEW_MISMATCH")
        assertThat(count("platform_admin_club_command_receipts")).isZero()
        assertThat(count("platform_admin_command_idempotency")).isZero()
    }

    @Test
    fun `safe command routes reject malformed user idempotency keys with coded bad request`() {
        val admin = createPlatformAdmin("OWNER")
        val clubId = createClub()
        assignActiveHost(clubId)
        val visibilityPreview = JsonPath.read<String>(previewVisibility(admin, clubId, 0, "PUBLIC"), "$.previewId")
        val visibility = confirmVisibility(admin, clubId, visibilityPreview, "bad key", 0, expectedStatus = 400)
        assertThat(JsonPath.read<String>(visibility, "$.code")).isEqualTo("INVALID_IDEMPOTENCY_KEY")

        val hostname = "invalid-key-${UUID.randomUUID()}.example.test"
        val domainPreview = JsonPath.read<String>(previewDomain(admin, clubId, 0, hostname), "$.previewId")
        val domain = confirmDomain(admin, clubId, domainPreview, "short", 0, hostname, expectedStatus = 400)
        assertThat(JsonPath.read<String>(domain, "$.code")).isEqualTo("INVALID_IDEMPOTENCY_KEY")

        val domainId = insertDomain(clubId, "invalid-recheck-${UUID.randomUUID()}.example.test")
        mockMvc
            .post("/api/admin/domains/$domainId/check") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"idempotencyKey":"bad key","expectedStatus":"ACTION_REQUIRED"}"""
                cookie(sessionCookie(admin))
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("INVALID_IDEMPOTENCY_KEY") }
            }
        assertThat(count("platform_admin_command_idempotency")).isZero()
    }

    @Test
    fun `visibility unpublish ignores public prerequisites and host lookup`() {
        val admin = createPlatformAdmin("OWNER")
        val clubId = createClub()
        jdbcTemplate.update(
            """
            update clubs
            set public_visibility = 'PUBLIC', name = '', tagline = '', about = ''
            where id = ?
            """.trimIndent(),
            clubId,
        )

        val previewId =
            JsonPath.read<String>(previewVisibility(admin, clubId, 0, "PRIVATE"), "$.previewId")
        confirmVisibility(
            admin,
            clubId,
            previewId,
            "unpublish-${UUID.randomUUID()}",
            0,
            targetVisibility = "PRIVATE",
        )

        assertThat(
            jdbcTemplate.queryForObject(
                "select public_visibility from clubs where id = ?",
                String::class.java,
                clubId,
            ),
        ).isEqualTo("PRIVATE")
    }

    @Test
    fun `visibility public prerequisites and atomic receipt failure leave no origin effect`() {
        val admin = createPlatformAdmin("OWNER")
        val clubId = createClub()

        mockMvc
            .post("/api/admin/clubs/$clubId/visibility/preview") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"expectedAdminRevision":0,"targetVisibility":"PUBLIC"}"""
                cookie(sessionCookie(admin))
            }.andExpect { status { isConflict() } }
        assertThat(count("platform_admin_club_command_previews")).isZero()

        assignActiveHost(clubId)
        val previewId =
            JsonPath.read<String>(previewVisibility(admin, clubId, 0, "PUBLIC"), "$.previewId")
        jdbcTemplate.execute(
            """
            create trigger task3_fail_receipt_insert before insert on platform_admin_club_command_receipts
            for each row signal sqlstate '45000' set message_text = 'synthetic receipt failure'
            """.trimIndent(),
        )
        try {
            assertThatThrownBy {
                confirmVisibility(admin, clubId, previewId, "rollback-${UUID.randomUUID()}", 0)
            }.hasRootCauseMessage("synthetic receipt failure")
        } finally {
            jdbcTemplate.execute("drop trigger if exists task3_fail_receipt_insert")
        }

        assertThat(count("platform_admin_club_command_receipts")).isZero()
        assertThat(count("platform_admin_command_idempotency")).isZero()
        assertThat(
            jdbcTemplate.queryForObject(
                "select count(*) from platform_audit_events where event_type = 'ADMIN_CLUB_VISIBILITY_CHANGED'",
                Int::class.java,
            ),
        ).isZero()
        val club = jdbcTemplate.queryForMap("select public_visibility, admin_revision from clubs where id = ?", clubId)
        assertThat(club["public_visibility"]).isEqualTo("PRIVATE")
        assertThat((club["admin_revision"] as Number).toLong()).isZero()
        assertThat(
            jdbcTemplate.queryForObject(
                "select consumed_at is null from platform_admin_club_command_previews where id = ?",
                Boolean::class.java,
                previewId,
            ),
        ).isTrue()
    }

    @Test
    fun `visibility confirm never overwrites a lifecycle transition that did not advance admin revision`() {
        val admin = createPlatformAdmin("OWNER")
        val clubId = createClub()
        assignActiveHost(clubId)
        val previewId = JsonPath.read<String>(previewVisibility(admin, clubId, 0, "PUBLIC"), "$.previewId")

        clubLifecycle.archive(
            UUID.fromString(clubId),
            CurrentPlatformAdmin(UUID.fromString(admin), "admin@example.test", PlatformAdminRole.OWNER),
        )
        confirmVisibility(admin, clubId, previewId, "lifecycle-race-${UUID.randomUUID()}", 0, 409)

        val club =
            jdbcTemplate.queryForMap(
                "select status, public_visibility, admin_revision from clubs where id = ?",
                clubId,
            )
        assertThat(club["status"]).isEqualTo("ARCHIVED")
        assertThat(club["public_visibility"]).isEqualTo("PRIVATE")
        assertThat((club["admin_revision"] as Number).toLong()).isZero()
        assertThat(count("platform_admin_club_command_receipts")).isZero()
        assertThat(count("platform_admin_command_idempotency")).isZero()
    }

    @Test
    fun `visibility publish locks active hosts before last host leave rechecks its invariant`() {
        val admin = createPlatformAdmin("OWNER")
        val clubId = createClub()
        val host = assignActiveHost(clubId)
        val previewId = JsonPath.read<String>(previewVisibility(admin, clubId, 0, "PUBLIC"), "$.previewId")
        val cookie = sessionCookie(admin)
        val leaveStarted = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        visibilityLock.blockNextLock()
        try {
            val publish =
                executor.submit<String> {
                    confirmVisibility(cookie, clubId, previewId, "host-lock-${UUID.randomUUID()}", 0)
                }
            assertThat(visibilityLock.awaitLocked()).isTrue()
            val leave =
                executor.submit {
                    leaveStarted.countDown()
                    leaveMembership.leave(host.actor(clubId, clubSlug(clubId)), MemberLifecycleRequest())
                }
            assertThat(leaveStarted.await(10, TimeUnit.SECONDS)).isTrue()
            assertThatThrownBy { leave.get(250, TimeUnit.MILLISECONDS) }
                .isInstanceOf(TimeoutException::class.java)

            visibilityLock.release()
            assertThat(JsonPath.read<String>(publish.get(10, TimeUnit.SECONDS), "$.commandType"))
                .isEqualTo("club.visibility.change")
            assertThatThrownBy { leave.get(10, TimeUnit.SECONDS) }
                .isInstanceOf(ExecutionException::class.java)
                .hasRootCauseInstanceOf(AuthApplicationException::class.java)
        } finally {
            visibilityLock.release()
            visibilityLock.reset()
            executor.shutdownNow()
        }

        val club = jdbcTemplate.queryForMap("select status, public_visibility from clubs where id = ?", clubId)
        assertThat(club["status"]).isEqualTo("ACTIVE")
        assertThat(club["public_visibility"]).isEqualTo("PUBLIC")
        assertThat(
            jdbcTemplate.queryForObject(
                "select count(*) from memberships where id = ? and status = 'ACTIVE'",
                Int::class.java,
                host.membershipId,
            ),
        ).isOne()
    }

    @Test
    fun `visibility replay reauthorizes current actor and hard club deletion retains evidence`() {
        val admin = createPlatformAdmin("OWNER")
        val clubId = createClub()
        assignActiveHost(clubId)
        val previewId = JsonPath.read<String>(previewVisibility(admin, clubId, 0, "PUBLIC"), "$.previewId")
        val idempotencyKey = "reauthorize-${UUID.randomUUID()}"
        val receiptId =
            JsonPath.read<String>(
                confirmVisibility(admin, clubId, previewId, idempotencyKey, 0),
                "$.receiptId",
            )

        jdbcTemplate.update("update platform_admins set status = 'DISABLED' where user_id = ?", admin)
        confirmVisibility(admin, clubId, previewId, idempotencyKey, 0, 403)
        jdbcTemplate.update("update platform_admins set status = 'ACTIVE' where user_id = ?", admin)

        jdbcTemplate.update("delete from memberships where club_id = ?", clubId)
        jdbcTemplate.update("delete from clubs where id = ?", clubId)
        clubIds.remove(clubId)

        assertThat(
            jdbcTemplate.queryForObject(
                "select count(*) from platform_admin_club_command_receipts where id = ? and club_id_snapshot = ?",
                Int::class.java,
                receiptId,
                clubId,
            ),
        ).isOne()
        assertThat(
            jdbcTemplate.queryForObject(
                "select count(*) from platform_audit_events where event_type = 'ADMIN_CLUB_VISIBILITY_CHANGED'",
                Int::class.java,
            ),
        ).isOne()
    }
}

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.auth.session-cookie-secure=false",
    ],
)
@AutoConfigureMockMvc
@Import(PlatformAdminDomainCheckTestConfiguration::class)
@Tag("integration")
class PlatformAdminDomainCommandDbTest(
    @param:Autowired mockMvc: MockMvc,
    @param:Autowired authSessionService: AuthSessionService,
    @param:Autowired jdbcTemplate: JdbcTemplate,
    @param:Autowired domainChecker: FakeClubDomainActualStateChecker,
) : PlatformAdminClubCommandDbSupport(mockMvc, authSessionService, jdbcTemplate, domainChecker) {
    @Test
    fun `domain preview confirm is revision bound and response loss replays one origin`() {
        val admin = createPlatformAdmin("OWNER")
        val clubId = createClub()
        val hostname = "club-${UUID.randomUUID()}.example.test"
        domainChecker.nextResult = ClubDomainActualCheckResult(ClubDomainStatus.FAILED, "DNS_NOT_READY")
        val previewId = JsonPath.read<String>(previewDomain(admin, clubId, 0, hostname), "$.previewId")
        val key = "domain-create-${UUID.randomUUID()}"

        val first = confirmDomain(admin, clubId, previewId, key, 0, hostname)
        val replay = confirmDomain(admin, clubId, previewId, key, 0, hostname)

        assertThat(JsonPath.read<String>(replay, "$.receiptId"))
            .isEqualTo(JsonPath.read<String>(first, "$.receiptId"))
        assertThat(JsonPath.read<String>(first, "$.commandType")).isEqualTo("club.domain.create")
        assertThat(JsonPath.read<String>(first, "$.targetId")).isNotBlank()
        assertThat(JsonPath.read<String>(first, "$.convergenceId")).isNotBlank()
        assertThat(JsonPath.read<String>(replay, "$.convergenceState")).isEqualTo("PENDING")
        assertThat(domainChecker.calls).isEqualTo(1)
        assertThat(domainChecker.observedTransaction).isFalse()
        assertThat(count("club_domains")).isOne()
        assertThat(count("platform_admin_club_command_receipts")).isOne()
        assertThat(count("platform_admin_club_command_convergence")).isOne()
        assertThat(count("platform_admin_command_idempotency")).isOne()
        assertThat(
            jdbcTemplate.queryForObject(
                "select count(*) from platform_audit_events where event_type = 'ADMIN_CLUB_DOMAIN_CREATED'",
                Int::class.java,
            ),
        ).isOne()
        assertThat(
            jdbcTemplate.queryForObject("select admin_revision from clubs where id = ?", Long::class.java, clubId),
        ).isEqualTo(1L)
        val roleEvidence =
            jdbcTemplate.queryForMap(
                """
                select r.actor_platform_role_snapshot, cast(r.actor_capabilities_json as char) actor_capabilities,
                       a.actor_platform_role
                from platform_admin_club_command_receipts r
                join platform_audit_events a on a.id = r.platform_audit_event_id_snapshot
                """.trimIndent(),
            )
        assertThat(roleEvidence["actor_platform_role_snapshot"]).isEqualTo("OWNER")
        assertThat(roleEvidence["actor_platform_role"]).isEqualTo("OWNER")
        assertThat(roleEvidence["actor_capabilities"] as String).contains("MANAGE_CLUB_DOMAINS")

        val changedPreview = previewDomain(admin, clubId, 1, "changed-${UUID.randomUUID()}.example.test")
        confirmDomain(
            admin,
            clubId,
            JsonPath.read(changedPreview, "$.previewId"),
            key,
            1,
            "changed-${UUID.randomUUID()}.example.test",
            expectedStatus = 409,
        )
        assertThat(count("club_domains")).isOne()
    }

    @Test
    fun `domain preview expiry consumption and request drift fail closed`() {
        val admin = createPlatformAdmin("OWNER")

        val expiredClub = createClub()
        val expiredHost = "expired-${UUID.randomUUID()}.example.test"
        val expiredId = JsonPath.read<String>(previewDomain(admin, expiredClub, 0, expiredHost), "$.previewId")
        jdbcTemplate.update(
            """
            update platform_admin_club_command_previews
            set created_at = timestampadd(minute, -2, utc_timestamp(6)),
                expires_at = timestampadd(minute, -1, utc_timestamp(6))
            where id = ?
            """.trimIndent(),
            expiredId,
        )
        confirmDomain(admin, expiredClub, expiredId, "expired-${UUID.randomUUID()}", 0, expiredHost, 409)

        val driftClub = createClub()
        val driftHost = "drift-${UUID.randomUUID()}.example.test"
        val driftId = JsonPath.read<String>(previewDomain(admin, driftClub, 0, driftHost), "$.previewId")
        confirmDomain(admin, driftClub, driftId, "drift-${UUID.randomUUID()}", 1, driftHost, 409)

        val consumedClub = createClub()
        val consumedHost = "consumed-${UUID.randomUUID()}.example.test"
        val consumedId = JsonPath.read<String>(previewDomain(admin, consumedClub, 0, consumedHost), "$.previewId")
        confirmDomain(admin, consumedClub, consumedId, "winner-${UUID.randomUUID()}", 0, consumedHost)
        confirmDomain(admin, consumedClub, consumedId, "loser-${UUID.randomUUID()}", 0, consumedHost, 409)

        assertThat(count("platform_admin_club_command_receipts")).isOne()
        assertThat(count("platform_admin_command_idempotency")).isOne()
        assertThat(count("club_domains")).isOne()
    }

    @Test
    fun `domain duplicate race and receipt failure rollback all origin evidence`() {
        val admin = createPlatformAdmin("OWNER")
        val clubId = createClub()
        val duplicate = "duplicate-${UUID.randomUUID()}.example.test"
        val previewId = JsonPath.read<String>(previewDomain(admin, clubId, 0, duplicate), "$.previewId")
        insertDomain(clubId, duplicate)
        confirmDomain(admin, clubId, previewId, "duplicate-${UUID.randomUUID()}", 0, duplicate, 409)
        assertThat(count("platform_admin_club_command_receipts")).isZero()
        assertThat(count("platform_admin_command_idempotency")).isZero()

        val fresh = "rollback-${UUID.randomUUID()}.example.test"
        val rollbackPreview = JsonPath.read<String>(previewDomain(admin, clubId, 0, fresh), "$.previewId")
        jdbcTemplate.execute(
            """
            create trigger task3_fail_receipt_insert before insert on platform_admin_club_command_receipts
            for each row signal sqlstate '45000' set message_text = 'synthetic receipt failure'
            """.trimIndent(),
        )
        try {
            assertThatThrownBy {
                confirmDomain(admin, clubId, rollbackPreview, "rollback-${UUID.randomUUID()}", 0, fresh)
            }.hasRootCauseMessage("synthetic receipt failure")
        } finally {
            jdbcTemplate.execute("drop trigger if exists task3_fail_receipt_insert")
        }
        assertThat(
            jdbcTemplate.queryForObject("select count(*) from club_domains where hostname = ?", Int::class.java, fresh),
        ).isZero()
        assertThat(count("platform_admin_club_command_receipts")).isZero()
        assertThat(count("platform_admin_club_command_convergence")).isZero()
        assertThat(count("platform_admin_command_idempotency")).isZero()
        assertThat(
            jdbcTemplate.queryForObject("select admin_revision from clubs where id = ?", Long::class.java, clubId),
        ).isZero()
    }

    @Test
    fun `domain recheck lease serializes duplicate callers and response loss resumes same identity`() {
        val admin = createPlatformAdmin("OPERATOR")
        val clubId = createClub()
        val domainId = insertDomain(clubId, "recheck-${UUID.randomUUID()}.example.test")
        val key = "domain-recheck-${UUID.randomUUID()}"
        domainChecker.nextResult = ClubDomainActualCheckResult(ClubDomainStatus.FAILED, "DNS_NOT_READY")
        domainChecker.blockNextCheck()
        val cookie = sessionCookie(admin)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val first = executor.submit<String> { recheckDomain(cookie, domainId, key, "ACTION_REQUIRED") }
            assertThat(domainChecker.awaitCheckStarted()).isTrue()
            val second = executor.submit<String> { recheckDomain(cookie, domainId, key, "ACTION_REQUIRED") }
            val replay = second.get(10, TimeUnit.SECONDS)
            assertThat(JsonPath.read<String>(replay, "$.convergenceState")).isEqualTo("PENDING")
            assertThat(domainChecker.calls).isOne()
            domainChecker.releaseCheck()
            val failed = first.get(10, TimeUnit.SECONDS)
            val receiptId = JsonPath.read<String>(failed, "$.receiptId")
            assertThat(JsonPath.read<String>(replay, "$.receiptId")).isEqualTo(receiptId)
        } finally {
            domainChecker.releaseCheck()
            executor.shutdownNow()
        }

        val retryState =
            jdbcTemplate.queryForMap(
                """
                select state, attempt_count, next_attempt_no, lease_owner
                from platform_admin_club_command_convergence
                """.trimIndent(),
            )
        assertThat(retryState["state"]).isEqualTo("PENDING")
        assertThat((retryState["attempt_count"] as Number).toInt()).isOne()
        assertThat((retryState["next_attempt_no"] as Number).toInt()).isEqualTo(2)
        assertThat(retryState["lease_owner"]).isNull()

        jdbcTemplate.update(
            "update platform_admin_club_command_convergence set available_at = '2000-01-01 00:00:00'",
        )
        domainChecker.nextResult = ClubDomainActualCheckResult(ClubDomainStatus.ACTIVE, null)
        val resumed = recheckDomain(sessionCookie(admin), domainId, key, "ACTION_REQUIRED")
        assertThat(domainChecker.calls).isEqualTo(2)
        assertThat(JsonPath.read<String>(resumed, "$.convergenceState")).isEqualTo("SUCCEEDED")
        assertThat(domainChecker.observedTransaction).isFalse()
        assertThat(
            jdbcTemplate.queryForObject("select status from club_domains where id = ?", String::class.java, domainId),
        ).isEqualTo("ACTIVE")
        assertThat(count("platform_admin_club_command_receipts")).isOne()
        assertThat(count("platform_admin_club_command_convergence_events")).isEqualTo(4)
    }

    @Test
    fun `expired convergence lease resumes the existing attempt without duplicating start evidence`() {
        val admin = createPlatformAdmin("OPERATOR")
        val clubId = createClub()
        val domainId = insertDomain(clubId, "expired-lease-${UUID.randomUUID()}.example.test")
        val key = "expired-lease-${UUID.randomUUID()}"
        domainChecker.nextResult = ClubDomainActualCheckResult(ClubDomainStatus.FAILED, "DNS_NOT_READY")
        val first = recheckDomain(sessionCookie(admin), domainId, key, "ACTION_REQUIRED")
        val convergenceId = JsonPath.read<String>(first, "$.convergenceId")
        jdbcTemplate.update(
            "update platform_admin_club_command_convergence set available_at = '2000-01-01 00:00:00' where id = ?",
            convergenceId,
        )
        domainChecker.crashNextCheck()
        assertThatThrownBy {
            recheckDomain(sessionCookie(admin), domainId, key, "ACTION_REQUIRED")
        }.hasRootCauseInstanceOf(SimulatedDomainCheckCrash::class.java)
        jdbcTemplate.update(
            "update platform_admin_club_command_convergence set lease_expires_at = '2000-01-01 00:00:00' where id = ?",
            convergenceId,
        )
        domainChecker.nextResult = ClubDomainActualCheckResult(ClubDomainStatus.ACTIVE, null)

        val resumed = recheckDomain(sessionCookie(admin), domainId, key, "ACTION_REQUIRED")

        assertThat(JsonPath.read<String>(resumed, "$.convergenceState")).isEqualTo("SUCCEEDED")
        assertThat(domainChecker.calls).isEqualTo(3)
        assertThat(count("platform_admin_club_command_convergence_events")).isEqualTo(4)
    }

    @Test
    fun `domain target changed during provider call is never overwritten`() {
        val admin = createPlatformAdmin("OPERATOR")
        val clubId = createClub()
        val domainId = insertDomain(clubId, "provider-race-${UUID.randomUUID()}.example.test")
        val key = "provider-race-${UUID.randomUUID()}"
        domainChecker.nextResult = ClubDomainActualCheckResult(ClubDomainStatus.ACTIVE, null)
        domainChecker.blockNextCheck()
        val executor = Executors.newSingleThreadExecutor()
        try {
            val response =
                executor.submit<String> {
                    recheckDomain(sessionCookie(admin), domainId, key, "ACTION_REQUIRED")
                }
            assertThat(domainChecker.awaitCheckStarted()).isTrue()
            jdbcTemplate.update(
                "update club_domains set status = 'DISABLED', updated_at = utc_timestamp(6) where id = ?",
                domainId,
            )
            domainChecker.releaseCheck()

            assertThat(JsonPath.read<String>(response.get(10, TimeUnit.SECONDS), "$.convergenceState"))
                .isEqualTo("FAILED")
        } finally {
            domainChecker.releaseCheck()
            executor.shutdownNow()
        }
        assertThat(
            jdbcTemplate.queryForObject("select status from club_domains where id = ?", String::class.java, domainId),
        ).isEqualTo("DISABLED")
        assertThat(
            jdbcTemplate.queryForObject(
                "select last_safe_error_code from platform_admin_club_command_convergence",
                String::class.java,
            ),
        ).isEqualTo("DOMAIN_TARGET_STALE")
    }

    @Test
    fun `completed domain recheck replay precedes target drift deletion and still reauthorizes actor`() {
        val admin = createPlatformAdmin("OPERATOR")
        val clubId = createClub()
        val domainId = insertDomain(clubId, "replay-${UUID.randomUUID()}.example.test")
        val key = "domain-hard-delete-${UUID.randomUUID()}"
        domainChecker.nextResult = ClubDomainActualCheckResult(ClubDomainStatus.FAILED, "DNS_NOT_READY")

        val first = recheckDomain(sessionCookie(admin), domainId, key, "ACTION_REQUIRED")
        val receiptId = JsonPath.read<String>(first, "$.receiptId")
        jdbcTemplate.update(
            "update club_domains set status = 'DISABLED', updated_at = utc_timestamp(6) where id = ?",
            domainId,
        )
        jdbcTemplate.update(
            "update platform_admin_club_command_convergence set available_at = '2000-01-01 00:00:00'",
        )
        domainChecker.nextResult = ClubDomainActualCheckResult(ClubDomainStatus.ACTIVE, null)
        val driftReplay = recheckDomain(sessionCookie(admin), domainId, key, "ACTION_REQUIRED")
        assertThat(JsonPath.read<String>(driftReplay, "$.receiptId")).isEqualTo(receiptId)
        assertThat(JsonPath.read<String>(driftReplay, "$.convergenceState")).isEqualTo("FAILED")
        assertThat(domainChecker.calls).isOne()

        jdbcTemplate.update("delete from club_domains where id = ?", domainId)
        val deleteReplay = recheckDomain(sessionCookie(admin), domainId, key, "ACTION_REQUIRED")
        assertThat(JsonPath.read<String>(deleteReplay, "$.receiptId")).isEqualTo(receiptId)
        assertThat(JsonPath.read<String>(deleteReplay, "$.convergenceState")).isEqualTo("FAILED")
        assertThat(domainChecker.calls).isOne()
        assertThat(
            jdbcTemplate.queryForObject(
                "select lease_owner from platform_admin_club_command_convergence",
                String::class.java,
            ),
        ).isNull()

        jdbcTemplate.update("update platform_admins set status = 'DISABLED' where user_id = ?", admin)
        mockMvc
            .post("/api/admin/domains/$domainId/check") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"idempotencyKey":"$key","expectedStatus":"ACTION_REQUIRED"}"""
                cookie(sessionCookie(admin))
            }.andExpect { status { isForbidden() } }
        assertThat(count("platform_admin_club_command_receipts")).isOne()
    }

    @Test
    fun `due convergence target deletion terminalizes without another provider call`() {
        val admin = createPlatformAdmin("OPERATOR")
        val clubId = createClub()
        val domainId = insertDomain(clubId, "deleted-target-${UUID.randomUUID()}.example.test")
        val key = "deleted-target-${UUID.randomUUID()}"
        domainChecker.nextResult = ClubDomainActualCheckResult(ClubDomainStatus.FAILED, "DNS_NOT_READY")
        val first = recheckDomain(sessionCookie(admin), domainId, key, "ACTION_REQUIRED")
        val receiptId = JsonPath.read<String>(first, "$.receiptId")
        jdbcTemplate.update("delete from club_domains where id = ?", domainId)
        jdbcTemplate.update(
            "update platform_admin_club_command_convergence set available_at = '2000-01-01 00:00:00'",
        )

        val replay = recheckDomain(sessionCookie(admin), domainId, key, "ACTION_REQUIRED")

        assertThat(JsonPath.read<String>(replay, "$.receiptId")).isEqualTo(receiptId)
        assertThat(JsonPath.read<String>(replay, "$.convergenceState")).isEqualTo("FAILED")
        assertThat(domainChecker.calls).isOne()
        assertThat(
            jdbcTemplate.queryForObject(
                "select last_safe_error_code from platform_admin_club_command_convergence",
                String::class.java,
            ),
        ).isEqualTo("DOMAIN_TARGET_NOT_FOUND")
    }

    @Test
    fun `domain convergence retry budget ends in terminal safe failure`() {
        val admin = createPlatformAdmin("OPERATOR")
        val clubId = createClub()
        val domainId = insertDomain(clubId, "terminal-${UUID.randomUUID()}.example.test")
        val key = "domain-terminal-${UUID.randomUUID()}"
        domainChecker.nextResult = ClubDomainActualCheckResult(ClubDomainStatus.FAILED, "PROVIDER_SECRET_DETAIL")

        var response = recheckDomain(sessionCookie(admin), domainId, key, "ACTION_REQUIRED")
        repeat(2) {
            jdbcTemplate.update(
                "update platform_admin_club_command_convergence set available_at = '2000-01-01 00:00:00'",
            )
            response = recheckDomain(sessionCookie(admin), domainId, key, "ACTION_REQUIRED")
        }

        assertThat(domainChecker.calls).isEqualTo(3)
        assertThat(JsonPath.read<String>(response, "$.convergenceState")).isEqualTo("FAILED")
        val terminal =
            jdbcTemplate.queryForMap(
                """
                select state, attempt_count, last_safe_error_code, available_at
                from platform_admin_club_command_convergence
                """.trimIndent(),
            )
        assertThat(terminal["state"]).isEqualTo("FAILED")
        assertThat((terminal["attempt_count"] as Number).toInt()).isEqualTo(3)
        assertThat(terminal["last_safe_error_code"]).isEqualTo("DOMAIN_CHECK_FAILED")
        assertThat(terminal["available_at"]).isNull()

        recheckDomain(sessionCookie(admin), domainId, key, "ACTION_REQUIRED")
        assertThat(domainChecker.calls).isEqualTo(3)
        assertThat(count("platform_admin_club_command_convergence_events")).isEqualTo(6)
    }
}

private fun assertVisibilityReceiptEffect(jdbcTemplate: JdbcTemplate) {
    val effect =
        jdbcTemplate.queryForMap(
            """
            select json_unquote(json_extract(safe_result_json, '$.beforeVisibility')) before_visibility,
                   json_unquote(json_extract(safe_result_json, '$.afterVisibility')) after_visibility,
                   json_unquote(json_extract(safe_result_json, '$.beforeStatus')) before_status,
                   json_unquote(json_extract(safe_result_json, '$.afterStatus')) after_status
            from platform_admin_club_command_receipts
            """.trimIndent(),
        )
    assertThat(effect)
        .containsEntry("before_visibility", "PRIVATE")
        .containsEntry("after_visibility", "PUBLIC")
        .containsEntry("before_status", "SETUP_REQUIRED")
        .containsEntry("after_status", "ACTIVE")
    val auditEffect =
        jdbcTemplate.queryForMap(
            """
            select json_unquote(json_extract(metadata_json, '$.beforeVisibility')) before_visibility,
                   json_unquote(json_extract(metadata_json, '$.afterVisibility')) after_visibility,
                   json_unquote(json_extract(metadata_json, '$.beforeStatus')) before_status,
                   json_unquote(json_extract(metadata_json, '$.afterStatus')) after_status
            from platform_audit_events where event_type = 'ADMIN_CLUB_VISIBILITY_CHANGED'
            """.trimIndent(),
        )
    assertThat(auditEffect).containsAllEntriesOf(effect)
}

abstract class PlatformAdminClubCommandDbSupport(
    protected val mockMvc: MockMvc,
    private val authSessionService: AuthSessionService,
    protected val jdbcTemplate: JdbcTemplate,
    protected val domainChecker: FakeClubDomainActualStateChecker,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val sessionTokenHashes = linkedSetOf<String>()
    private val adminUserIds = linkedSetOf<String>()
    protected val clubIds = linkedSetOf<String>()

    @BeforeEach
    fun prepare() {
        cleanupEvidence()
    }

    @AfterEach
    fun cleanup() {
        cleanupEvidence()
    }

    protected fun patchMetadata(
        adminUserId: String,
        clubId: String,
        expectedRevision: Long,
        name: String,
    ) = mockMvc.patch("/api/admin/clubs/$clubId/metadata") {
        contentType = MediaType.APPLICATION_JSON
        content =
            """
            {
              "expectedAdminRevision": $expectedRevision,
              "name": "$name",
              "tagline": "Safe synthetic tagline",
              "about": "Safe synthetic public description"
            }
            """.trimIndent()
        cookie(sessionCookie(adminUserId))
    }

    protected fun previewVisibility(
        adminUserId: String,
        clubId: String,
        expectedRevision: Long,
        target: String,
    ): String =
        mockMvc
            .post("/api/admin/clubs/$clubId/visibility/preview") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"expectedAdminRevision":$expectedRevision,"targetVisibility":"$target"}"""
                cookie(sessionCookie(adminUserId))
            }.andExpect {
                status { isOk() }
                jsonPath("$.previewId") { isNotEmpty() }
                jsonPath("$.expiresAt") { isNotEmpty() }
                jsonPath("$.currentVisibility") { value(if (target == "PUBLIC") "PRIVATE" else "PUBLIC") }
                jsonPath("$.targetVisibility") { value(target) }
                jsonPath("$.requestFingerprintPrefix") { isNotEmpty() }
            }.andReturn()
            .response
            .contentAsString

    protected fun confirmVisibility(
        adminUserId: String,
        clubId: String,
        previewId: String,
        idempotencyKey: String,
        expectedRevision: Long,
        expectedStatus: Int = 200,
        targetVisibility: String = "PUBLIC",
    ): String =
        mockMvc
            .post("/api/admin/clubs/$clubId/visibility/confirm") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "previewId":"$previewId",
                      "idempotencyKey":"$idempotencyKey",
                      "expectedAdminRevision":$expectedRevision,
                      "targetVisibility":"$targetVisibility",
                      "confirmed":true
                    }
                    """.trimIndent()
                cookie(sessionCookie(adminUserId))
            }.andExpect { status { isEqualTo(expectedStatus) } }
            .andReturn()
            .response
            .contentAsString

    protected fun confirmVisibility(
        cookie: Cookie,
        clubId: String,
        previewId: String,
        idempotencyKey: String,
        expectedRevision: Long,
    ): String =
        mockMvc
            .post("/api/admin/clubs/$clubId/visibility/confirm") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "previewId":"$previewId",
                      "idempotencyKey":"$idempotencyKey",
                      "expectedAdminRevision":$expectedRevision,
                      "targetVisibility":"PUBLIC",
                      "confirmed":true
                    }
                    """.trimIndent()
                cookie(cookie)
            }.andExpect { status { isOk() } }
            .andReturn()
            .response
            .contentAsString

    protected fun previewDomain(
        adminUserId: String,
        clubId: String,
        expectedRevision: Long,
        hostname: String,
    ): String =
        mockMvc
            .post("/api/admin/clubs/$clubId/domains/preview") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "expectedAdminRevision":$expectedRevision,
                      "hostname":"$hostname",
                      "kind":"SUBDOMAIN",
                      "isPrimary":false
                    }
                    """.trimIndent()
                cookie(sessionCookie(adminUserId))
            }.andExpect {
                status { isOk() }
                jsonPath("$.previewId") { isNotEmpty() }
                jsonPath("$.requestFingerprintPrefix") { isNotEmpty() }
            }.andReturn()
            .response
            .contentAsString

    protected fun confirmDomain(
        adminUserId: String,
        clubId: String,
        previewId: String,
        idempotencyKey: String,
        expectedRevision: Long,
        hostname: String,
        expectedStatus: Int = 200,
    ): String =
        mockMvc
            .post("/api/admin/clubs/$clubId/domains") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "previewId":"$previewId",
                      "idempotencyKey":"$idempotencyKey",
                      "expectedAdminRevision":$expectedRevision,
                      "hostname":"$hostname",
                      "kind":"SUBDOMAIN",
                      "isPrimary":false,
                      "confirmed":true
                    }
                    """.trimIndent()
                cookie(sessionCookie(adminUserId))
            }.andExpect { status { isEqualTo(expectedStatus) } }
            .andReturn()
            .response
            .contentAsString

    protected fun recheckDomain(
        cookie: Cookie,
        domainId: String,
        idempotencyKey: String,
        expectedStatus: String,
    ): String =
        mockMvc
            .post("/api/admin/domains/$domainId/check") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"idempotencyKey":"$idempotencyKey","expectedStatus":"$expectedStatus"}"""
                cookie(cookie)
            }.andExpect { status { isOk() } }
            .andReturn()
            .response
            .contentAsString

    protected fun insertDomain(
        clubId: String,
        hostname: String,
    ): String {
        val domainId = UUID.randomUUID().toString()
        jdbcTemplate.update(
            """
            insert into club_domains (id, club_id, hostname, kind, status, is_primary)
            values (?, ?, ?, 'SUBDOMAIN', 'ACTION_REQUIRED', false)
            """.trimIndent(),
            domainId,
            clubId,
            hostname,
        )
        return domainId
    }

    protected fun createPlatformAdmin(role: String): String {
        val userId = UUID.randomUUID().toString()
        jdbcTemplate.update(
            """
            insert into users (id, email, name, short_name, auth_provider)
            values (?, ?, 'Synthetic Admin', 'Admin', 'GOOGLE')
            """.trimIndent(),
            userId,
            "admin-${UUID.randomUUID()}@example.test",
        )
        jdbcTemplate.update(
            "insert into platform_admins (user_id, role, status) values (?, ?, 'ACTIVE')",
            userId,
            role,
        )
        adminUserIds += userId
        return userId
    }

    protected fun createClub(status: ClubStatus = ClubStatus.ACTIVE): String {
        val clubId = UUID.randomUUID().toString()
        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about, status, public_visibility, admin_revision)
            values (?, ?, 'Synthetic Club', 'Synthetic tagline', 'Synthetic public description', ?, ?, 0)
            """.trimIndent(),
            clubId,
            "safe-command-${UUID.randomUUID().toString().take(12)}",
            status.name,
            ClubPublicVisibility.PRIVATE.name,
        )
        clubIds += clubId
        return clubId
    }

    protected fun assignActiveHost(clubId: String): ActiveHostFixture {
        val userId = UUID.randomUUID().toString()
        val membershipId = UUID.randomUUID().toString()
        jdbcTemplate.update(
            """
            insert into users (id, email, name, short_name, auth_provider)
            values (?, ?, 'Synthetic Host', 'Host', 'GOOGLE')
            """.trimIndent(),
            userId,
            "host-${UUID.randomUUID()}@example.test",
        )
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            values (?, ?, ?, 'HOST', 'ACTIVE', utc_timestamp(6), 'Host', 'globe-notebook')
            """.trimIndent(),
            membershipId,
            clubId,
            userId,
        )
        adminUserIds += userId
        return ActiveHostFixture(userId, membershipId)
    }

    protected fun clubSlug(clubId: String): String =
        checkNotNull(jdbcTemplate.queryForObject("select slug from clubs where id = ?", String::class.java, clubId))

    protected fun count(table: String): Int {
        val stored = jdbcTemplate.queryForObject("select count(*) from $table", Int::class.java)
        return stored ?: 0
    }

    protected fun sessionCookie(userId: String): Cookie {
        val session =
            authSessionService.issueSession(
                userId = userId,
                userAgent = "PlatformAdminClubCommandDbTest",
                ipAddress = "127.0.0.1",
            )
        sessionTokenHashes += session.storedTokenHash
        return Cookie(AuthSessionService.COOKIE_NAME, session.rawToken)
    }

    private fun cleanupEvidence() {
        jdbcTemplate.execute("drop trigger if exists task3_fail_receipt_insert")
        jdbcTemplate.update("delete from platform_admin_club_command_convergence_events where event_seq = 1")
        jdbcTemplate.update("delete from platform_admin_club_command_convergence_events where event_seq = 0")
        jdbcTemplate.update("delete from platform_admin_club_command_convergence")
        jdbcTemplate.update("delete from platform_admin_command_idempotency_keys")
        jdbcTemplate.update("delete from platform_admin_command_idempotency")
        jdbcTemplate.update("delete from platform_admin_club_command_previews")
        jdbcTemplate.update("delete from platform_admin_club_command_receipts")
        jdbcTemplate.update(
            "delete from platform_audit_events where event_type like 'ADMIN_CLUB_%'",
        )
        deleteWhereIn("club_audit_events", "club_id", clubIds)
        deleteWhereIn("memberships", "club_id", clubIds)
        deleteWhereIn("club_domains", "club_id", clubIds)
        deleteWhereIn("auth_sessions", "session_token_hash", sessionTokenHashes)
        deleteWhereIn("platform_admins", "user_id", adminUserIds)
        deleteWhereIn("auth_sessions", "user_id", adminUserIds)
        deleteWhereIn("users", "id", adminUserIds)
        deleteWhereIn("clubs", "id", clubIds)
        sessionTokenHashes.clear()
        adminUserIds.clear()
        clubIds.clear()
        domainChecker.reset()
    }

    private fun deleteWhereIn(
        tableName: String,
        columnName: String,
        values: Set<String>,
    ) {
        if (values.isEmpty()) return
        val placeholders = values.joinToString(",") { "?" }
        jdbcTemplate.update("delete from $tableName where $columnName in ($placeholders)", *values.toTypedArray())
    }
}

data class ActiveHostFixture(
    val userId: String,
    val membershipId: String,
) {
    fun actor(
        clubId: String,
        clubSlug: String,
    ) = ClubActor(
        UUID.fromString(userId),
        UUID.fromString(membershipId),
        UUID.fromString(clubId),
        clubSlug,
        setOf(ClubCapability.MANAGE_MEMBERS),
    )
}

@TestConfiguration
class PlatformAdminVisibilityLockTestConfiguration {
    @Bean
    @Primary
    fun blockingPlatformAdminClubVisibilityLockPort(
        delegate: JdbcPlatformAdminClubVisibilityLockAdapter,
    ): BlockingPlatformAdminClubVisibilityLockPort = BlockingPlatformAdminClubVisibilityLockPort(delegate)
}

class BlockingPlatformAdminClubVisibilityLockPort(
    private val delegate: JdbcPlatformAdminClubVisibilityLockAdapter,
) : PlatformAdminClubVisibilityLockPort {
    @Volatile private var locked: CountDownLatch? = null

    @Volatile private var release: CountDownLatch? = null

    override fun lockVisibilityState(
        clubId: UUID,
        requireActiveHost: Boolean,
    ): LockedPlatformAdminClubVisibilityState? {
        val state = delegate.lockVisibilityState(clubId, requireActiveHost)
        locked?.countDown()
        release?.await(10, TimeUnit.SECONDS)
        return state
    }

    fun blockNextLock() {
        locked = CountDownLatch(1)
        release = CountDownLatch(1)
    }

    fun awaitLocked(): Boolean = locked?.await(10, TimeUnit.SECONDS) ?: false

    fun release() {
        release?.countDown()
    }

    fun reset() {
        release()
        locked = null
        release = null
    }
}
