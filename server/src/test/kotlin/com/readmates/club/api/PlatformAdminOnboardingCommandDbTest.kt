package com.readmates.club.api

import com.jayway.jsonpath.JsonPath
import com.readmates.auth.application.service.AuthSessionService
import com.readmates.club.adapter.out.security.PlatformAdminInvitationTokenDeriver
import com.readmates.club.application.model.ClubDomainActualCheckResult
import com.readmates.club.application.port.out.PlatformAdminHostInvitationConvergenceAcquisition
import com.readmates.club.application.port.out.PlatformAdminOnboardingCommandPort
import com.readmates.club.application.service.PlatformAdminHostInvitationConvergenceService
import com.readmates.club.domain.ClubDomainStatus
import com.readmates.notification.application.port.out.MailDeliveryCommand
import com.readmates.notification.application.port.out.MailDeliveryFailure
import com.readmates.notification.application.port.out.MailDeliveryFailureKind
import com.readmates.notification.application.port.out.MailDeliveryPort
import com.readmates.shared.adminmutation.application.port.out.AdminCommandIdempotencyPort
import jakarta.servlet.http.Cookie
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
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
import org.springframework.mail.javamail.JavaMailSender
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.transaction.support.TransactionSynchronizationManager
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.auth.session-cookie-secure=false",
        "readmates.notifications.enabled=true",
        "readmates.notifications.worker.enabled=true",
        "readmates.notifications.worker.fixed-delay=24h",
        "readmates.notifications.sender-email=no-reply@example.test",
        "readmates.notifications.sender-name=ReadMates Test",
        "readmates.notifications.kafka.max-delivery-attempts=3",
        "readmates.notifications.kafka.max-publish-attempts=3",
        "readmates.notifications.worker.retry-delays=1m,2m",
    ],
)
@AutoConfigureMockMvc
@Import(PlatformAdminDomainCheckTestConfiguration::class, PlatformAdminOnboardingMailTestConfiguration::class)
@Tag("integration")
class PlatformAdminOnboardingCommandDbTest(
    @param:Autowired mockMvc: MockMvc,
    @param:Autowired authSessionService: AuthSessionService,
    @param:Autowired jdbcTemplate: JdbcTemplate,
    @param:Autowired domainActualStateChecker: FakeClubDomainActualStateChecker,
    @param:Autowired worker: PlatformAdminHostInvitationConvergenceService,
    @param:Autowired mail: RecordingPlatformAdminMailDeliveryPort,
    @param:Autowired tokenDeriver: PlatformAdminInvitationTokenDeriver,
    @param:Autowired commandPort: PlatformAdminOnboardingCommandPort,
    @param:Autowired transactions: TransactionTemplate,
    @param:Autowired clock: Clock,
    @param:Autowired idempotencyPort: AdminCommandIdempotencyPort,
) : PlatformAdminOnboardingDbSupport(
        mockMvc,
        authSessionService,
        jdbcTemplate,
        domainActualStateChecker,
        worker,
        mail,
        tokenDeriver,
        commandPort,
        transactions,
        clock,
        idempotencyPort,
    ) {
    @Test
    fun `new host origin is atomic private evidence and completed replay precedes preview expiry`() {
        val admin = createPlatformAdminUser("OWNER", "ACTIVE")
        val slug = "durable-${UUID.randomUUID().toString().take(8)}"
        val email = "host-${UUID.randomUUID()}@example.test"
        val preview = preview(admin, commandJson(slug, email))
        val previewId = JsonPath.read<String>(preview, "$.previewId")
        val key = "onboarding-${UUID.randomUUID()}"

        val first = confirm(admin, previewId, key, commandJson(slug, email))
        val clubId = JsonPath.read<String>(first, "$.club.clubId")
        val receiptId = JsonPath.read<String>(first, "$.receiptId")
        registerOrigin(clubId)
        jdbcTemplate.update(
            """
            update platform_admin_club_command_previews
            set created_at = timestampadd(minute, -2, utc_timestamp(6)),
                expires_at = timestampadd(minute, -1, utc_timestamp(6))
            where id = ?
            """.trimIndent(),
            previewId,
        )
        val replay = confirm(admin, previewId, key, commandJson(slug, email))

        assertThat(JsonPath.read<String>(replay, "$.receiptId")).isEqualTo(receiptId)
        assertHostOriginEvidence(first, email, clubId, receiptId, slug)
    }

    @Test
    fun `maximum persisted about size commits and replays from immutable receipt`() {
        val admin = createPlatformAdminUser("OWNER", "ACTIVE")
        val slug = "about-boundary-${UUID.randomUUID().toString().take(8)}"
        val email = "about-boundary-${UUID.randomUUID()}@example.test"
        val about =
            buildString(65_535) {
                repeat(32_767) { append("\\\n") }
                append('\\')
            }
        val command = commandJson(slug, email, about = about)
        val previewId = JsonPath.read<String>(preview(admin, command), "$.previewId")
        val key = "about-boundary-${UUID.randomUUID()}"

        val committed = runCatching { confirm(admin, previewId, key, command) }
        assertThat(committed.exceptionOrNull())
            .withFailMessage("a valid TEXT-sized about must fit immutable receipt evidence")
            .isNull()
        val first = committed.getOrThrow()
        val clubId = JsonPath.read<String>(first, "$.club.clubId")
        val receiptId = JsonPath.read<String>(first, "$.receiptId")
        registerOrigin(clubId)

        val replay = confirm(admin, previewId, key, command)
        assertThat(JsonPath.read<String>(replay, "$.receiptId")).isEqualTo(receiptId)
        assertThat(JsonPath.read<String>(replay, "$.club.about").toByteArray(Charsets.UTF_8)).hasSize(65_535)
    }

    @Test
    fun `same key request drift conflicts and actor switch rolls back its claim`() {
        val owner = createPlatformAdminUser("OWNER", "ACTIVE")
        val operator = createPlatformAdminUser("OPERATOR", "ACTIVE")
        val slug = "claim-${UUID.randomUUID().toString().take(8)}"
        val email = "claim-${UUID.randomUUID()}@example.test"
        val previewId = JsonPath.read<String>(preview(owner, commandJson(slug, email)), "$.previewId")
        val actorSwitch = confirm(operator, previewId, "actor-${UUID.randomUUID()}", commandJson(slug, email), 409)
        assertThat(JsonPath.read<String>(actorSwitch, "$.code")).isEqualTo("PREVIEW_MISMATCH")
        assertThat(idempotencyCount()).isZero()

        val key = "stable-${UUID.randomUUID()}"
        val first = confirm(owner, previewId, key, commandJson(slug, email))
        registerOrigin(JsonPath.read(first, "$.club.clubId"))
        val drift = confirm(owner, previewId, key, commandJson(slug, "other-${UUID.randomUUID()}@example.test"), 409)
        assertThat(JsonPath.read<String>(drift, "$.code")).isEqualTo("IDEMPOTENCY_CONFLICT")
        assertThat(idempotencyCount()).isOne()
    }

    @Test
    fun `existing user origin assigns one HOST without invitation delivery effect`() {
        val admin = createPlatformAdminUser("OPERATOR", "ACTIVE")
        val existingUserId = createGoogleUser("existing-${UUID.randomUUID()}@example.test", "Synthetic Existing Host")
        val email = emailForUser(existingUserId)
        val slug = "existing-${UUID.randomUUID().toString().take(8)}"
        val preview = preview(admin, commandJson(slug, email))
        assertThat(JsonPath.read<String>(preview, "$.firstHostKind")).isEqualTo("EXISTING_USER")
        assertThat(preview).doesNotContain(email, existingUserId)
        val previewId = JsonPath.read<String>(preview, "$.previewId")

        val result =
            confirm(
                admin,
                previewId,
                "existing-${UUID.randomUUID()}",
                commandJson(slug, email, existingUserConfirmation = "ASSIGN_EXISTING_USER_AS_HOST"),
            )
        val clubId = JsonPath.read<String>(result, "$.club.clubId")
        registerOrigin(clubId)

        assertThat(JsonPath.read<String>(result, "$.firstHostKind")).isEqualTo("EXISTING_USER_ASSIGNED")
        assertThat(JsonPath.read<String>(result, "$.invitationDelivery")).isEqualTo("NOT_REQUIRED")
        assertThat(countForClub("invitations", clubId)).isZero()
        assertThat(countForClub("memberships", clubId)).isOne()
        assertThat(
            jdbcTemplate.queryForObject(
                """
                select count(*) from memberships
                where club_id = ? and user_id = ? and role = 'HOST' and status = 'ACTIVE'
                """.trimIndent(),
                Int::class.java,
                clubId,
                existingUserId,
            ),
        ).isOne()
        assertThat(
            jdbcTemplate.queryForObject(
                """
                select count(*) from platform_admin_club_command_convergence c
                join platform_admin_club_command_receipts r on r.id = c.receipt_id_snapshot
                where r.club_id_snapshot = ? and c.effect_type = 'HOST_INVITATION'
                """.trimIndent(),
                Int::class.java,
                clubId,
            ),
        ).isZero()
    }

    @Test
    fun `optional domain stores its own target and duplicate hostname fails before origin`() {
        val admin = createPlatformAdminUser("OWNER", "ACTIVE")
        val slug = "domain-${UUID.randomUUID().toString().take(8)}"
        val email = "domain-${UUID.randomUUID()}@example.test"
        val hostname = "domain-${UUID.randomUUID()}.example.test"
        val command = commandJson(slug, email, domainHostname = hostname)
        val previewId = JsonPath.read<String>(preview(admin, command), "$.previewId")
        domainActualStateChecker.nextResult = ClubDomainActualCheckResult(ClubDomainStatus.ACTIVE, null)
        val result = confirm(admin, previewId, "domain-${UUID.randomUUID()}", command)
        val clubId = JsonPath.read<String>(result, "$.club.clubId")
        registerOrigin(clubId)
        assertOnboardingDomainConvergence(clubId)

        val existingClub = createDomainTestClub()
        val duplicate = "duplicate-${UUID.randomUUID()}.example.test"
        insertDomain(existingClub, duplicate)
        val blockedCommand =
            commandJson(
                "blocked-${UUID.randomUUID().toString().take(8)}",
                email,
                domainHostname = duplicate,
            )
        val blockedPreview = preview(admin, blockedCommand)
        assertThat(JsonPath.read<List<String>>(blockedPreview, "$.prerequisiteCodes"))
            .contains("CLUB_DOMAIN_CONFLICT")
        val blocked =
            confirm(
                admin,
                JsonPath.read(blockedPreview, "$.previewId"),
                "blocked-${UUID.randomUUID()}",
                blockedCommand,
                409,
            )
        assertThat(JsonPath.read<String>(blocked, "$.code")).isEqualTo("CLUB_DOMAIN_CONFLICT")
    }

    @Test
    fun `preview expiry consumption source drift and current capability loss fail closed`() {
        val admin = createPlatformAdminUser("OWNER", "ACTIVE")
        val expiredSlug = "expired-${UUID.randomUUID().toString().take(8)}"
        val expiredEmail = "expired-${UUID.randomUUID()}@example.test"
        val expiredId = JsonPath.read<String>(preview(admin, commandJson(expiredSlug, expiredEmail)), "$.previewId")
        jdbcTemplate.update(
            """
            update platform_admin_club_command_previews
            set created_at = timestampadd(minute, -2, utc_timestamp(6)),
                expires_at = timestampadd(minute, -1, utc_timestamp(6))
            where id = ?
            """.trimIndent(),
            expiredId,
        )
        val expired =
            confirm(admin, expiredId, "expired-${UUID.randomUUID()}", commandJson(expiredSlug, expiredEmail), 409)
        assertThat(JsonPath.read<String>(expired, "$.code")).isEqualTo("PREVIEW_EXPIRED")
        assertThat(idempotencyCount()).isZero()

        val driftSlug = "drift-${UUID.randomUUID().toString().take(8)}"
        val driftEmail = "drift-${UUID.randomUUID()}@example.test"
        val driftId = JsonPath.read<String>(preview(admin, commandJson(driftSlug, driftEmail)), "$.previewId")
        createGoogleUser(driftEmail, "Synthetic Drift Host")
        val drift = confirm(admin, driftId, "drift-${UUID.randomUUID()}", commandJson(driftSlug, driftEmail), 409)
        assertThat(JsonPath.read<String>(drift, "$.code")).isEqualTo("PREVIEW_MISMATCH")
        assertThat(idempotencyCount()).isZero()

        val consumedSlug = "consumed-${UUID.randomUUID().toString().take(8)}"
        val consumedEmail = "consumed-${UUID.randomUUID()}@example.test"
        val consumedId = JsonPath.read<String>(preview(admin, commandJson(consumedSlug, consumedEmail)), "$.previewId")
        val stored = confirm(admin, consumedId, "winner-${UUID.randomUUID()}", commandJson(consumedSlug, consumedEmail))
        registerOrigin(JsonPath.read(stored, "$.club.clubId"))
        val consumed =
            confirm(admin, consumedId, "loser-${UUID.randomUUID()}", commandJson(consumedSlug, consumedEmail), 409)
        assertThat(JsonPath.read<String>(consumed, "$.code")).isEqualTo("PREVIEW_CONSUMED")

        val deniedSlug = "denied-${UUID.randomUUID().toString().take(8)}"
        val deniedEmail = "denied-${UUID.randomUUID()}@example.test"
        val deniedId = JsonPath.read<String>(preview(admin, commandJson(deniedSlug, deniedEmail)), "$.previewId")
        jdbcTemplate.update("update platform_admins set status = 'DISABLED' where user_id = ?", admin)
        confirm(admin, deniedId, "denied-${UUID.randomUUID()}", commandJson(deniedSlug, deniedEmail), 403)
        assertThat(idempotencyCount()).isOne()
    }

    @Test
    fun `receipt failure rolls back club invitation audit convergence and claim`() {
        val admin = createPlatformAdminUser("OWNER", "ACTIVE")
        val slug = "rollback-${UUID.randomUUID().toString().take(8)}"
        val email = "rollback-${UUID.randomUUID()}@example.test"
        val previewId = JsonPath.read<String>(preview(admin, commandJson(slug, email)), "$.previewId")
        jdbcTemplate.execute(
            """
            create trigger task4_fail_receipt_insert before insert on platform_admin_club_command_receipts
            for each row signal sqlstate '45000' set message_text = 'synthetic onboarding receipt failure'
            """.trimIndent(),
        )
        try {
            assertThatThrownBy {
                confirm(admin, previewId, "rollback-${UUID.randomUUID()}", commandJson(slug, email))
            }.hasRootCauseMessage("synthetic onboarding receipt failure")
        } finally {
            jdbcTemplate.execute("drop trigger if exists task4_fail_receipt_insert")
        }

        assertThat(
            jdbcTemplate.queryForObject("select count(*) from clubs where slug = ?", Int::class.java, slug),
        ).isZero()
        assertThat(idempotencyCount()).isZero()
        assertThat(countForEvent("ADMIN_CLUB_ONBOARDED")).isZero()
        assertThat(count("platform_admin_club_command_convergence")).isZero()
        assertThat(
            jdbcTemplate.queryForObject(
                "select consumed_at is null from platform_admin_club_command_previews where id = ?",
                Boolean::class.java,
                previewId,
            ),
        ).isTrue()
    }
}

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.auth.session-cookie-secure=false",
        "readmates.notifications.enabled=true",
        "readmates.notifications.worker.enabled=true",
        "readmates.notifications.worker.fixed-delay=24h",
        "readmates.notifications.sender-email=no-reply@example.test",
        "readmates.notifications.sender-name=ReadMates Test",
        "readmates.notifications.kafka.max-delivery-attempts=3",
        "readmates.notifications.kafka.max-publish-attempts=3",
        "readmates.notifications.worker.retry-delays=1m,2m",
    ],
)
@AutoConfigureMockMvc
@Import(PlatformAdminDomainCheckTestConfiguration::class, PlatformAdminOnboardingMailTestConfiguration::class)
@Tag("integration")
class PlatformAdminOnboardingConvergenceDbTest(
    @param:Autowired mockMvc: MockMvc,
    @param:Autowired authSessionService: AuthSessionService,
    @param:Autowired jdbcTemplate: JdbcTemplate,
    @param:Autowired domainActualStateChecker: FakeClubDomainActualStateChecker,
    @param:Autowired worker: PlatformAdminHostInvitationConvergenceService,
    @param:Autowired mail: RecordingPlatformAdminMailDeliveryPort,
    @param:Autowired tokenDeriver: PlatformAdminInvitationTokenDeriver,
    @param:Autowired commandPort: PlatformAdminOnboardingCommandPort,
    @param:Autowired transactions: TransactionTemplate,
    @param:Autowired clock: Clock,
    @param:Autowired idempotencyPort: AdminCommandIdempotencyPort,
) : PlatformAdminOnboardingDbSupport(
        mockMvc,
        authSessionService,
        jdbcTemplate,
        domainActualStateChecker,
        worker,
        mail,
        tokenDeriver,
        commandPort,
        transactions,
        clock,
        idempotencyPort,
    ) {
    @Test
    fun `retryable mail keeps one invitation and retries the exact link outside transactions`() {
        val admin = createPlatformAdminUser("OWNER", "ACTIVE")
        val slug = "worker-${UUID.randomUUID().toString().take(8)}"
        val email = "worker-${UUID.randomUUID()}@example.test"
        val previewId = JsonPath.read<String>(preview(admin, commandJson(slug, email)), "$.previewId")
        val result = confirm(admin, previewId, "worker-${UUID.randomUUID()}", commandJson(slug, email))
        val clubId = JsonPath.read<String>(result, "$.club.clubId")
        registerOrigin(clubId)
        mail.failure = MailDeliveryFailure(MailDeliveryFailureKind.RETRYABLE)

        assertThat(worker.processOne()).isTrue()
        val firstUrl = mail.acceptUrls.single()
        assertThat(mail.transactionStates).containsExactly(false)
        val pending = convergenceState(clubId)
        assertThat(pending["state"]).isEqualTo("PENDING")
        assertThat((pending["attempt_count"] as Number).toInt()).isOne()
        jdbcTemplate.update(
            """
            update platform_admin_club_command_convergence
            set available_at = '2000-01-01 00:00:00'
            where effect_type = 'HOST_INVITATION'
            """.trimIndent(),
        )
        mail.failure = null

        assertThat(worker.processOne()).isTrue()
        assertThat(mail.acceptUrls).containsExactly(firstUrl, firstUrl)
        assertThat(mail.transactionStates).containsExactly(false, false)
        assertThat(convergenceState(clubId)["state"]).isEqualTo("SUCCEEDED")
        assertThat(countForClub("invitations", clubId)).isOne()
        assertThat(count("platform_admin_club_command_convergence_events")).isEqualTo(4)
    }

    @Test
    fun `permanent ambiguous and exhausted mail outcomes use safe bounded states`() {
        val admin = createPlatformAdminUser("OWNER", "ACTIVE")
        val permanentClub = createPendingInvitation(admin, "permanent")
        mail.failure = MailDeliveryFailure(MailDeliveryFailureKind.PERMANENT)
        assertThat(worker.processOne()).isTrue()
        assertThat(convergenceState(permanentClub))
            .containsEntry("state", "FAILED")
            .containsEntry("last_safe_error_code", "MAIL_PERMANENT")

        val ambiguousClub = createPendingInvitation(admin, "ambiguous")
        mail.failure = MailDeliveryFailure(MailDeliveryFailureKind.AMBIGUOUS)
        assertThat(worker.processOne()).isTrue()
        assertThat(convergenceState(ambiguousClub))
            .containsEntry("state", "PENDING")
            .containsEntry("last_safe_error_code", "MAIL_AMBIGUOUS")
        makeHostConvergenceDue(ambiguousClub)
        mail.failure = null
        assertThat(worker.processOne()).isTrue()
        assertThat(convergenceState(ambiguousClub)["state"]).isEqualTo("SUCCEEDED")

        val exhaustedClub = createPendingInvitation(admin, "exhausted")
        mail.failure = MailDeliveryFailure(MailDeliveryFailureKind.RETRYABLE)
        repeat(3) { attempt ->
            assertThat(worker.processOne()).isTrue()
            if (attempt < 2) makeHostConvergenceDue(exhaustedClub)
        }
        val exhausted = convergenceState(exhaustedClub)
        assertThat(exhausted)
            .containsEntry("state", "FAILED")
            .containsEntry("last_safe_error_code", "MAIL_RETRYABLE")
        assertThat((exhausted["attempt_count"] as Number).toInt()).isEqualTo(3)
    }

    @Test
    fun `expired lease consumes the ambiguous attempt before retry and stale outcome cannot overwrite it`() {
        val admin = createPlatformAdminUser("OWNER", "ACTIVE")
        val clubId = createPendingInvitation(admin, "lease")
        val firstOwner = "worker-${UUID.randomUUID()}"
        val now = clock.instant()
        val acquired =
            checkNotNull(
                transactions.execute {
                    commandPort.tryAcquireHostInvitationConvergence(
                        firstOwner,
                        now,
                        now.plus(Duration.ofMinutes(5)),
                        3,
                    )
                },
            ) as PlatformAdminHostInvitationConvergenceAcquisition.Acquired
        val second =
            transactions.execute {
                commandPort.tryAcquireHostInvitationConvergence(
                    "worker-${UUID.randomUUID()}",
                    now,
                    now.plus(Duration.ofMinutes(5)),
                    3,
                )
            }
        assertThat(second).isEqualTo(PlatformAdminHostInvitationConvergenceAcquisition.Unavailable)
        assertThat(worker.processOne()).isFalse()
        jdbcTemplate.update(
            """
            update platform_admin_club_command_convergence
            set lease_expires_at = '2000-01-01 00:00:00'
            where receipt_id_snapshot = ?
            """.trimIndent(),
            acquired.lease.receiptId.toString(),
        )
        mail.failure = null
        assertThat(worker.processOne()).isTrue()
        assertThat(convergenceState(clubId)["state"]).isEqualTo("SUCCEEDED")
        val stale =
            transactions.execute {
                commandPort.finishHostInvitationConvergence(
                    lease = acquired.lease,
                    leaseOwner = firstOwner,
                    succeeded = false,
                    safeErrorCode = "MAIL_AMBIGUOUS",
                    terminalFailure = false,
                    completedAt = clock.instant(),
                    retryAt = clock.instant().plus(Duration.ofMinutes(1)),
                )
            }
        assertThat(stale).isFalse()
        assertThat(countForClub("invitations", clubId)).isOne()
        assertThat(convergenceState(clubId)["attempt_count"]).isEqualTo(2)
        assertExpiredLeaseRetryEvents(acquired.lease.receiptId)
    }

    @Test
    fun `repeated expired leases exhaust the delivery budget without a fourth send`() {
        val admin = createPlatformAdminUser("OWNER", "ACTIVE")
        val clubId = createPendingInvitation(admin, "lease-budget")
        val now = clock.instant()

        repeat(3) { index ->
            val acquired =
                checkNotNull(
                    transactions.execute {
                        commandPort.tryAcquireHostInvitationConvergence(
                            "crashed-worker-$index-${UUID.randomUUID()}",
                            now,
                            now.plus(Duration.ofMinutes(5)),
                            3,
                        )
                    },
                ) as PlatformAdminHostInvitationConvergenceAcquisition.Acquired
            jdbcTemplate.update(
                """
                update platform_admin_club_command_convergence
                set lease_expires_at = '2000-01-01 00:00:00'
                where id = ?
                """.trimIndent(),
                acquired.lease.convergenceId.toString(),
            )
        }

        mail.reset()
        assertThat(worker.processOne()).isTrue()
        assertThat(mail.acceptUrls).isEmpty()
        assertThat(convergenceState(clubId))
            .containsEntry("state", "FAILED")
            .containsEntry("attempt_count", 3)
            .containsEntry("last_safe_error_code", "MAIL_AMBIGUOUS")
        assertThat(count("platform_admin_club_command_convergence_events")).isEqualTo(6)
    }

    @Test
    fun `pending delivery is a key reference and terminal outcome serializes behind retirement lock`() {
        val admin = createPlatformAdminUser("OWNER", "ACTIVE")
        val clubId = createPendingInvitation(admin, "key-reference")
        val version = receiptDigestKeyVersion(clubId)
        val before =
            checkNotNull(transactions.execute { idempotencyPort.lockDigestKeySnapshot() })
                .single { it.digestKeyVersion == version }
        assertThat(before.pendingHostInvitationCount).isOne()

        assertTerminalSerializesBehindRetirement(version)
        val after =
            checkNotNull(transactions.execute { idempotencyPort.lockDigestKeySnapshot() })
                .single { it.digestKeyVersion == version }
        assertThat(after.pendingHostInvitationCount).isZero()
        assertThat(convergenceState(clubId)["state"]).isEqualTo("SUCCEEDED")
    }

    @Test
    fun `concurrent confirmation converges on one origin and one receipt`() {
        val admin = createPlatformAdminUser("OWNER", "ACTIVE")
        val slug = "concurrent-${UUID.randomUUID().toString().take(8)}"
        val email = "concurrent-${UUID.randomUUID()}@example.test"
        val previewId = JsonPath.read<String>(preview(admin, commandJson(slug, email)), "$.previewId")
        val key = "concurrent-${UUID.randomUUID()}"
        val cookie = sessionCookieForUser(admin)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val calls =
                List(2) {
                    executor.submit<Pair<Int, String>> { confirmAny(cookie, previewId, key, commandJson(slug, email)) }
                }
            val responses = calls.map { it.get(15, TimeUnit.SECONDS) }
            assertThat(responses.map(Pair<Int, String>::first)).contains(200)
            assertThat(responses.map(Pair<Int, String>::first)).allMatch { it == 200 || it == 409 }
            val replay = confirm(cookie, previewId, key, commandJson(slug, email))
            val receiptIds =
                (
                    responses.filter { it.first == 200 }.map { JsonPath.read<String>(it.second, "$.receiptId") } +
                        JsonPath.read<String>(replay, "$.receiptId")
                ).toSet()
            val clubId = JsonPath.read<String>(replay, "$.club.clubId")
            registerOrigin(clubId)
            assertThat(receiptIds).hasSize(1)
            assertThat(
                jdbcTemplate.queryForObject("select count(*) from clubs where slug = ?", Int::class.java, slug),
            ).isOne()
            assertThat(countForClub("invitations", clubId)).isOne()
        } finally {
            executor.shutdownNow()
        }
    }
}

abstract class PlatformAdminOnboardingDbSupport(
    mockMvc: MockMvc,
    authSessionService: AuthSessionService,
    jdbcTemplate: JdbcTemplate,
    domainActualStateChecker: FakeClubDomainActualStateChecker,
    protected val worker: PlatformAdminHostInvitationConvergenceService,
    protected val mail: RecordingPlatformAdminMailDeliveryPort,
    protected val tokenDeriver: PlatformAdminInvitationTokenDeriver,
    protected val commandPort: PlatformAdminOnboardingCommandPort,
    protected val transactions: TransactionTemplate,
    protected val clock: Clock,
    protected val idempotencyPort: AdminCommandIdempotencyPort,
) : PlatformAdminControllerDbSupport(mockMvc, authSessionService, jdbcTemplate, domainActualStateChecker) {
    @BeforeEach
    fun resetMail() {
        mail.reset()
    }

    protected fun assertHostOriginEvidence(
        response: String,
        email: String,
        clubId: String,
        receiptId: String,
        slug: String,
    ) {
        assertThat(response).doesNotContain(email, "acceptUrl", "tokenHash", "/invite/")
        assertThat(count("clubs")).isGreaterThanOrEqualTo(1)
        assertThat(countForClub("invitations", clubId)).isOne()
        assertThat(countForReceipt("platform_admin_club_command_receipts", receiptId)).isOne()
        assertThat(countForReceipt("platform_admin_club_command_convergence", receiptId)).isOne()
        val convergence = hostConvergenceForReceipt(receiptId)
        val invitationId = checkNotNull(convergence["effect_target_id_snapshot"] as String?)
        assertThat(convergence)
            .containsEntry("effect_type", "HOST_INVITATION")
            .containsEntry("state", "PENDING")
        assertThat(invitationId).isEqualTo(invitationIdForClub(clubId))

        val receiptEvidence = receiptEvidence(receiptId)
        assertThat(receiptEvidence["safe_result"] as String).doesNotContain(email, "token", "invite/")
        assertThat(receiptEvidence["audit_metadata"] as String).doesNotContain(email, "token", "invite/")
        val derived =
            tokenDeriver.derive(
                UUID.fromString(invitationId),
                UUID.fromString(clubId),
                (receiptEvidence["digest_key_version"] as Number).toInt(),
            )
        assertThat(tokenHashForInvitation(invitationId)).isEqualTo(derived.tokenHash)
        assertThat(derived.toString()).isEqualTo("[REDACTED]")
        mockMvc
            .get("/api/clubs/$slug/invitations/${derived.rawToken.exposeForDelivery()}")
            .andExpect {
                status { isOk() }
                jsonPath("$.clubSlug") { value(slug) }
                jsonPath("$.canAccept") { value(true) }
            }
    }

    private fun hostConvergenceForReceipt(receiptId: String): Map<String, Any?> =
        jdbcTemplate.queryForMap(
            """
            select effect_type, effect_target_id_snapshot, state
            from platform_admin_club_command_convergence where receipt_id_snapshot = ?
            """.trimIndent(),
            receiptId,
        )

    private fun receiptEvidence(receiptId: String): Map<String, Any?> =
        jdbcTemplate.queryForMap(
            """
            select cast(r.safe_result_json as char) safe_result,
                   cast(p.metadata_json as char) audit_metadata,
                   r.digest_key_version
            from platform_admin_club_command_receipts r
            join platform_audit_events p on p.id = r.platform_audit_event_id_snapshot
            where r.id = ?
            """.trimIndent(),
            receiptId,
        )

    protected fun assertOnboardingDomainConvergence(clubId: String) {
        val effects =
            jdbcTemplate.queryForList(
                """
                select c.effect_type, c.effect_target_id_snapshot, c.state
                from platform_admin_club_command_convergence c
                join platform_admin_club_command_receipts r on r.id = c.receipt_id_snapshot
                where r.club_id_snapshot = ? order by c.effect_type
                """.trimIndent(),
                clubId,
            )
        assertThat(effects.map { it["effect_type"] }).containsExactly("DOMAIN_PROVISIONING", "HOST_INVITATION")
        assertThat(effects.single { it["effect_type"] == "DOMAIN_PROVISIONING" }["effect_target_id_snapshot"])
            .isEqualTo(createdClubDomainIds.single())
        assertThat(effects.single { it["effect_type"] == "HOST_INVITATION" }["effect_target_id_snapshot"])
            .isEqualTo(createdInvitationIds.single())
        assertThat(effects.single { it["effect_type"] == "DOMAIN_PROVISIONING" }["state"])
            .isEqualTo("SUCCEEDED")
        assertThat(effects.single { it["effect_type"] == "HOST_INVITATION" }["state"])
            .isEqualTo("PENDING")
        assertThat(domainActualStateChecker.calls).isOne()
        assertThat(domainActualStateChecker.observedTransaction).isFalse()
        val origin = onboardingDomainOrigin(clubId)
        assertThat(origin["expected_status"]).isEqualTo("ACTION_REQUIRED")
        assertThat(Instant.parse(origin["origin_updated_at"] as String)).isNotNull()
    }

    private fun onboardingDomainOrigin(clubId: String): Map<String, Any?> =
        jdbcTemplate.queryForMap(
            """
            select json_unquote(json_extract(r.safe_result_json, '$.expectedDomainStatus')) expected_status,
                   json_unquote(json_extract(r.safe_result_json, '$.originTargetUpdatedAt')) origin_updated_at
            from platform_admin_club_command_receipts r
            where r.club_id_snapshot = ? and r.command_type = 'club.onboarding.create'
            """.trimIndent(),
            clubId,
        )

    protected fun receiptDigestKeyVersion(clubId: String): Int =
        checkNotNull(
            jdbcTemplate.queryForObject(
                """
                select r.digest_key_version
                from platform_admin_club_command_receipts r
                where r.club_id_snapshot = ?
                """.trimIndent(),
                Int::class.java,
                clubId,
            ),
        )

    protected fun assertTerminalSerializesBehindRetirement(version: Int) {
        val leaseOwner = "worker-${UUID.randomUUID()}"
        val now = clock.instant()
        val acquired =
            checkNotNull(
                transactions.execute {
                    commandPort.tryAcquireHostInvitationConvergence(
                        leaseOwner,
                        now,
                        now.plus(Duration.ofMinutes(5)),
                        3,
                    )
                },
            ) as PlatformAdminHostInvitationConvergenceAcquisition.Acquired
        val locked = CountDownLatch(1)
        val release = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val retirement = executor.submit { holdRetirementLock(version, locked, release) }
            assertThat(locked.await(10, TimeUnit.SECONDS)).isTrue()
            val terminal = executor.submit<Boolean> { finishHostInvitation(acquired, leaseOwner) }
            Thread.sleep(150)
            assertThat(terminal.isDone).isFalse()
            release.countDown()
            retirement.get(10, TimeUnit.SECONDS)
            assertThat(terminal.get(10, TimeUnit.SECONDS)).isTrue()
        } finally {
            release.countDown()
            executor.shutdownNow()
        }
    }

    protected fun assertExpiredLeaseRetryEvents(receiptId: UUID) {
        assertThat(count("platform_admin_club_command_convergence_events")).isEqualTo(4)
        assertThat(
            jdbcTemplate.queryForList(
                """
                select attempt_no, event_seq, state, safe_error_code
                from platform_admin_club_command_convergence_events
                where receipt_id_snapshot = ?
                order by attempt_no, event_seq
                """.trimIndent(),
                receiptId.toString(),
            ),
        ).containsExactly(
            mapOf("attempt_no" to 1, "event_seq" to 0, "state" to "PENDING", "safe_error_code" to null),
            mapOf("attempt_no" to 1, "event_seq" to 1, "state" to "FAILED", "safe_error_code" to "MAIL_AMBIGUOUS"),
            mapOf("attempt_no" to 2, "event_seq" to 0, "state" to "PENDING", "safe_error_code" to null),
            mapOf("attempt_no" to 2, "event_seq" to 1, "state" to "SUCCEEDED", "safe_error_code" to null),
        )
    }

    private fun holdRetirementLock(
        version: Int,
        locked: CountDownLatch,
        release: CountDownLatch,
    ) {
        transactions.executeWithoutResult {
            idempotencyPort.lockDigestKeyForRetirement(version, clock.instant())
            locked.countDown()
            release.await(10, TimeUnit.SECONDS)
        }
    }

    private fun finishHostInvitation(
        acquired: PlatformAdminHostInvitationConvergenceAcquisition.Acquired,
        leaseOwner: String,
    ): Boolean =
        checkNotNull(
            transactions.execute {
                commandPort.finishHostInvitationConvergence(
                    lease = acquired.lease,
                    leaseOwner = leaseOwner,
                    succeeded = true,
                    safeErrorCode = null,
                    terminalFailure = false,
                    completedAt = clock.instant(),
                    retryAt = null,
                )
            },
        )

    protected fun preview(
        admin: String,
        command: String,
    ): String =
        mockMvc
            .post("/api/admin/clubs/onboarding/preview") {
                contentType = MediaType.APPLICATION_JSON
                content = command
                cookie(sessionCookieForUser(admin))
            }.andExpect {
                status { isOk() }
                jsonPath("$.previewId") { isNotEmpty() }
                jsonPath("$.requestFingerprintPrefix") { isNotEmpty() }
            }.andReturn()
            .response
            .contentAsString

    protected fun confirm(
        admin: String,
        previewId: String,
        key: String,
        command: String,
        status: Int = 200,
    ): String = confirm(sessionCookieForUser(admin), previewId, key, command, status)

    protected fun confirm(
        cookie: Cookie,
        previewId: String,
        key: String,
        command: String,
        status: Int = 200,
    ): String {
        val body = confirmationBody(command, previewId, key)
        return mockMvc
            .post("/api/admin/clubs/onboarding") {
                contentType = MediaType.APPLICATION_JSON
                content = body
                cookie(cookie)
            }.andExpect { status { isEqualTo(status) } }
            .andReturn()
            .response
            .contentAsString
    }

    protected fun confirmAny(
        cookie: Cookie,
        previewId: String,
        key: String,
        command: String,
    ): Pair<Int, String> {
        val body = confirmationBody(command, previewId, key)
        val response =
            mockMvc
                .post("/api/admin/clubs/onboarding") {
                    contentType = MediaType.APPLICATION_JSON
                    content = body
                    cookie(cookie)
                }.andReturn()
                .response
        return response.status to response.contentAsString
    }

    protected fun commandJson(
        slug: String,
        email: String,
        existingUserConfirmation: String? = null,
        domainHostname: String? = null,
        about: String = "Synthetic public description",
    ): String =
        """
        {
          "club":{
            "name":"Synthetic Club","slug":"$slug","tagline":"Synthetic tagline",
            "about":"${about.escapeJson()}"
          },
          "firstHost":{"email":"$email","name":"Synthetic Host"}
          ${existingUserConfirmation?.let { ",\"existingUserConfirmation\":\"$it\"" } ?: ""}
          ${domainHostname?.let { ",\"domain\":{\"hostname\":\"$it\",\"kind\":\"CUSTOM_DOMAIN\"}" } ?: ""}
        }
        """.trimIndent()

    protected fun registerOrigin(clubId: String) {
        createdClubIds += clubId
        createdInvitationIds +=
            jdbcTemplate
                .queryForList("select id from invitations where club_id = ?", String::class.java, clubId)
                .filterNotNull()
        createdMembershipIds += membershipIdsForClub(clubId)
        createdClubDomainIds +=
            jdbcTemplate
                .queryForList("select id from club_domains where club_id = ?", String::class.java, clubId)
                .filterNotNull()
    }

    protected fun createPendingInvitation(
        admin: String,
        label: String,
    ): String {
        val slug = "$label-${UUID.randomUUID().toString().take(8)}"
        val email = "$label-${UUID.randomUUID()}@example.test"
        val command = commandJson(slug, email)
        val previewId = JsonPath.read<String>(preview(admin, command), "$.previewId")
        val result = confirm(admin, previewId, "$label-${UUID.randomUUID()}", command)
        val clubId = JsonPath.read<String>(result, "$.club.clubId")
        registerOrigin(clubId)
        return clubId
    }

    protected fun makeHostConvergenceDue(clubId: String) {
        jdbcTemplate.update(
            """
            update platform_admin_club_command_convergence c
            join platform_admin_club_command_receipts r on r.id = c.receipt_id_snapshot
            set c.available_at = '2000-01-01 00:00:00'
            where r.club_id_snapshot = ? and c.effect_type = 'HOST_INVITATION'
            """.trimIndent(),
            clubId,
        )
    }

    protected fun invitationIdForClub(clubId: String): String =
        checkNotNull(
            jdbcTemplate.queryForObject("select id from invitations where club_id = ?", String::class.java, clubId),
        )

    protected fun tokenHashForInvitation(invitationId: String): String =
        checkNotNull(
            jdbcTemplate.queryForObject(
                "select token_hash from invitations where id = ?",
                String::class.java,
                invitationId,
            ),
        )

    protected fun countForClub(
        table: String,
        clubId: String,
    ): Int = jdbcTemplate.queryForObject("select count(*) from $table where club_id = ?", Int::class.java, clubId) ?: 0

    protected fun countForReceipt(
        table: String,
        receiptId: String,
    ): Int {
        val column = if (table.endsWith("receipts")) "id" else "receipt_id_snapshot"
        return jdbcTemplate.queryForObject(
            "select count(*) from $table where $column = ?",
            Int::class.java,
            receiptId,
        ) ?: 0
    }

    protected fun countForEvent(eventType: String): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from platform_audit_events where event_type = ?",
            Int::class.java,
            eventType,
        ) ?: 0

    protected fun count(table: String): Int = countRows("select count(*) from $table")

    private fun countRows(sql: String): Int = jdbcTemplate.queryForObject(sql, Int::class.java) ?: 0

    protected fun idempotencyCount(): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from platform_admin_command_idempotency where command_type = 'club.onboarding.create'",
            Int::class.java,
        ) ?: 0

    protected fun convergenceState(clubId: String): Map<String, Any?> =
        jdbcTemplate.queryForMap(
            """
            select c.state, c.attempt_count, c.last_safe_error_code
            from platform_admin_club_command_convergence c
            join platform_admin_club_command_receipts r on r.id = c.receipt_id_snapshot
            where r.club_id_snapshot = ? and c.effect_type = 'HOST_INVITATION'
            """.trimIndent(),
            clubId,
        )
}

private fun confirmationBody(
    command: String,
    previewId: String,
    key: String,
): String =
    command.replaceFirst(
        "{",
        "{\"previewId\":\"$previewId\",\"idempotencyKey\":\"$key\",\"confirmed\":true,",
    )

private fun String.escapeJson(): String =
    replace("\\", "\\\\")
        .replace("\"", "\\\"")
        .replace("\n", "\\n")

@TestConfiguration
class PlatformAdminOnboardingMailTestConfiguration {
    @Bean
    fun javaMailSender(): JavaMailSender = org.mockito.Mockito.mock(JavaMailSender::class.java)

    @Bean
    @Primary
    fun recordingMailPort(): RecordingPlatformAdminMailDeliveryPort = RecordingPlatformAdminMailDeliveryPort()
}

class RecordingPlatformAdminMailDeliveryPort : MailDeliveryPort {
    val acceptUrls = mutableListOf<String>()
    val transactionStates = mutableListOf<Boolean>()

    @Volatile
    var failure: MailDeliveryFailure? = null

    override fun send(command: MailDeliveryCommand) {
        transactionStates += TransactionSynchronizationManager.isActualTransactionActive()
        acceptUrls += command.text.substringAfter("Accept: ")
        failure?.let { throw it }
    }

    fun reset() {
        acceptUrls.clear()
        transactionStates.clear()
        failure = null
    }
}
