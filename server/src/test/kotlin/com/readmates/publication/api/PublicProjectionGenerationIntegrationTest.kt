package com.readmates.publication.api

import com.readmates.auth.application.CurrentSessionPolicy
import com.readmates.auth.application.MemberLifecycleRequest
import com.readmates.auth.application.model.ReplaceOwnMemberProfileCommand
import com.readmates.auth.application.service.InvitationService
import com.readmates.auth.application.service.MemberApprovalService
import com.readmates.auth.application.service.MemberLifecycleService
import com.readmates.auth.application.service.MemberProfileService
import com.readmates.auth.domain.MembershipRole
import com.readmates.club.application.model.UpdatePlatformAdminClubCommand
import com.readmates.club.application.service.ClubLifecycleService
import com.readmates.club.application.service.PlatformAdminClubRegistryService
import com.readmates.club.domain.ClubPublicVisibility
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.publication.application.port.out.LoadPublishedPublicDataPort
import com.readmates.session.api.CLEANUP_EXPOSURE_PUBLICATION_SQL
import com.readmates.session.api.HostSessionAtomicityDbTestSupport
import com.readmates.session.application.model.ExpectedSessionRevision
import com.readmates.session.application.model.HostSessionCommand
import com.readmates.session.application.model.UpdateHostSessionCommand
import com.readmates.session.application.port.`in`.HostSessionDraftUseCase
import com.readmates.session.application.port.`in`.PurgeExpiredHostSessionTrashUseCase
import com.readmates.shared.security.ClubActor
import com.readmates.shared.security.ClubCapability
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.CurrentPlatformAdmin
import com.readmates.shared.security.PlatformActor
import com.readmates.shared.security.PlatformCapability
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.parallel.Execution
import org.junit.jupiter.api.parallel.ExecutionMode
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@AutoConfigureMockMvc
@Sql(
    statements = [CLEANUP_PUBLIC_CONVERGENCE_SQL, CLEANUP_EXPOSURE_PUBLICATION_SQL],
    executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
)
@Sql(
    statements = [CLEANUP_PUBLIC_CONVERGENCE_SQL, CLEANUP_EXPOSURE_PUBLICATION_SQL],
    executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
)
@Tag("integration")
@Suppress("LargeClass")
@Execution(ExecutionMode.SAME_THREAD)
class PublicProjectionGenerationIntegrationTest(
    @Autowired mockMvc: MockMvc,
    @Autowired jdbcTemplate: JdbcTemplate,
    @Autowired private val publicData: LoadPublishedPublicDataPort,
    @Autowired private val purgeExpiredTrash: PurgeExpiredHostSessionTrashUseCase,
    @Autowired private val platformClubs: PlatformAdminClubRegistryService,
    @Autowired private val draftSessions: HostSessionDraftUseCase,
    @Autowired private val memberProfiles: MemberProfileService,
    @Autowired private val memberApprovals: MemberApprovalService,
    @Autowired private val memberLifecycle: MemberLifecycleService,
    @Autowired private val invitations: InvitationService,
    @Autowired private val clubLifecycle: ClubLifecycleService,
) : HostSessionAtomicityDbTestSupport(mockMvc, jdbcTemplate) {
    @Test
    @Suppress("LongMethod")
    fun `concurrent club exposure and public member profile update preserve ordered effects without deadlock`() {
        val executor = Executors.newFixedThreadPool(2)
        try {
            repeat(4) { iteration ->
                val fixture = createConcurrencyFixture(200 + iteration)
                try {
                    val before = currentMarker(fixture.sessionId.toString())
                    val linksBefore =
                        sessionConvergenceCount("public_mutation_convergence_links", fixture.sessionId.toString())
                    val workBefore = sessionConvergenceCount("public_convergence_work", fixture.sessionId.toString())
                    val clubLinksBefore = clubOnlyConvergenceCount("public_mutation_convergence_links", fixture.clubId)
                    val ready = CountDownLatch(2)
                    val start = CountDownLatch(1)
                    val profile =
                        executor.submit<String> {
                            ready.countDown()
                            check(start.await(5, TimeUnit.SECONDS))
                            memberProfiles
                                .replaceOwnProfile(
                                    fixture.host.email,
                                    fixture.clubId,
                                    ReplaceOwnMemberProfileCommand(
                                        "Fixture Host ${200 + iteration}",
                                        "balloon-green-book",
                                    ),
                                ).displayName
                        }
                    val exposure =
                        executor.submit<ClubPublicVisibility> {
                            ready.countDown()
                            check(start.await(5, TimeUnit.SECONDS))
                            makeClubPrivate(fixture)
                        }
                    check(ready.await(5, TimeUnit.SECONDS))
                    start.countDown()

                    assertThat(profile.get(10, TimeUnit.SECONDS)).isEqualTo("Fixture Host ${200 + iteration}")
                    assertThat(exposure.get(10, TimeUnit.SECONDS)).isEqualTo(ClubPublicVisibility.PRIVATE)
                    val after = projection(fixture.sessionId.toString())
                    val generationDelta = after.generation - before.first
                    assertThat(generationDelta).isBetween(1L, 2L)
                    assertThat(after.clubGeneration - before.second).isEqualTo(generationDelta)
                    assertThat(after.originReadable)
                        .describedAs("iteration %s must retain the committed club deny", iteration)
                        .isFalse()
                    assertThat(
                        sessionConvergenceCount("public_mutation_convergence_links", fixture.sessionId.toString()) -
                            linksBefore,
                    ).isEqualTo(generationDelta.toInt())
                    assertThat(
                        sessionConvergenceCount("public_convergence_work", fixture.sessionId.toString()) - workBefore,
                    ).isEqualTo(generationDelta.toInt())
                    assertThat(
                        clubOnlyConvergenceCount("public_mutation_convergence_links", fixture.clubId) - clubLinksBefore,
                    ).isEqualTo(1)
                } finally {
                    cleanupConcurrencyFixture(fixture)
                }
            }
        } finally {
            executor.shutdownNow()
        }
    }

    @Test
    @Suppress("LongMethod")
    fun `concurrent club exposure and viewer approval preserve exact club and session effects`() {
        val executor = Executors.newFixedThreadPool(2)
        try {
            repeat(4) { iteration ->
                val fixture = createConcurrencyFixture(300 + iteration)
                val viewerMembershipId = createViewerMembership(fixture)
                try {
                    val before = currentMarker(fixture.sessionId.toString())
                    val clubGenerationBefore = currentClubGeneration(fixture.clubId)
                    val sessionLinksBefore =
                        sessionConvergenceCount("public_mutation_convergence_links", fixture.sessionId.toString())
                    val clubLinksBefore = clubOnlyConvergenceCount("public_mutation_convergence_links", fixture.clubId)
                    val clubWorkBefore = clubOnlyConvergenceCount("public_convergence_work", fixture.clubId)
                    val ready = CountDownLatch(2)
                    val start = CountDownLatch(1)
                    val approval =
                        executor.submit<String> {
                            ready.countDown()
                            check(start.await(5, TimeUnit.SECONDS))
                            memberApprovals
                                .activateViewer(
                                    ClubActor(
                                        fixture.host.userId,
                                        fixture.membershipId,
                                        fixture.clubId,
                                        fixture.host.clubSlug,
                                        setOf(ClubCapability.MANAGE_MEMBERS),
                                    ),
                                    viewerMembershipId,
                                ).status.name
                        }
                    val exposure =
                        executor.submit<ClubPublicVisibility> {
                            ready.countDown()
                            check(start.await(5, TimeUnit.SECONDS))
                            makeClubPrivate(fixture)
                        }
                    check(ready.await(5, TimeUnit.SECONDS))
                    start.countDown()

                    assertThat(approval.get(10, TimeUnit.SECONDS)).isEqualTo("ACTIVE")
                    assertThat(exposure.get(10, TimeUnit.SECONDS)).isEqualTo(ClubPublicVisibility.PRIVATE)
                    val after = currentMarker(fixture.sessionId.toString())
                    assertThat(after.first - before.first).isEqualTo(1)
                    assertThat(currentClubGeneration(fixture.clubId) - clubGenerationBefore).isEqualTo(2)
                    assertThat(
                        sessionConvergenceCount("public_mutation_convergence_links", fixture.sessionId.toString()) -
                            sessionLinksBefore,
                    ).isEqualTo(1)
                    assertThat(
                        clubOnlyConvergenceCount("public_mutation_convergence_links", fixture.clubId) - clubLinksBefore,
                    ).isEqualTo(2)
                    assertThat(clubOnlyConvergenceCount("public_convergence_work", fixture.clubId) - clubWorkBefore)
                        .isEqualTo(2)
                } finally {
                    cleanupConcurrencyFixture(fixture)
                }
            }
        } finally {
            executor.shutdownNow()
        }
    }

    @Test
    @Suppress("LongMethod")
    fun `concurrent club exposure and member suspension preserve exact public effects without deadlock`() {
        val executor = Executors.newFixedThreadPool(2)
        try {
            repeat(4) { iteration ->
                val fixture = createConcurrencyFixture(400 + iteration)
                val memberId = createActiveMember(fixture)
                try {
                    val sessionBefore = currentMarker(fixture.sessionId.toString())
                    val clubGenerationBefore = currentClubGeneration(fixture.clubId)
                    val sessionLinksBefore =
                        sessionConvergenceCount("public_mutation_convergence_links", fixture.sessionId.toString())
                    val clubLinksBefore = clubOnlyConvergenceCount("public_mutation_convergence_links", fixture.clubId)
                    val clubWorkBefore = clubOnlyConvergenceCount("public_convergence_work", fixture.clubId)
                    val ready = CountDownLatch(2)
                    val start = CountDownLatch(1)
                    val suspension =
                        executor.submit<String> {
                            ready.countDown()
                            check(start.await(5, TimeUnit.SECONDS))
                            memberLifecycle
                                .suspend(
                                    hostActor(fixture, ClubCapability.MANAGE_MEMBERS),
                                    memberId,
                                    MemberLifecycleRequest(CurrentSessionPolicy.NEXT_SESSION),
                                ).member.status.name
                        }
                    val exposure =
                        executor.submit<ClubPublicVisibility> {
                            ready.countDown()
                            check(start.await(5, TimeUnit.SECONDS))
                            makeClubPrivate(fixture)
                        }
                    check(ready.await(5, TimeUnit.SECONDS))
                    start.countDown()

                    assertThat(suspension.get(10, TimeUnit.SECONDS)).isEqualTo("SUSPENDED")
                    assertThat(exposure.get(10, TimeUnit.SECONDS)).isEqualTo(ClubPublicVisibility.PRIVATE)
                    val sessionAfter = currentMarker(fixture.sessionId.toString())
                    assertThat(sessionAfter.first - sessionBefore.first).isEqualTo(1)
                    assertThat(currentClubGeneration(fixture.clubId) - clubGenerationBefore).isEqualTo(2)
                    assertThat(
                        sessionConvergenceCount("public_mutation_convergence_links", fixture.sessionId.toString()) -
                            sessionLinksBefore,
                    ).isEqualTo(1)
                    assertThat(
                        clubOnlyConvergenceCount("public_mutation_convergence_links", fixture.clubId) - clubLinksBefore,
                    ).isEqualTo(2)
                    assertThat(clubOnlyConvergenceCount("public_convergence_work", fixture.clubId) - clubWorkBefore)
                        .isEqualTo(2)
                } finally {
                    cleanupConcurrencyFixture(fixture)
                }
            }
        } finally {
            executor.shutdownNow()
        }
    }

    @Test
    @Suppress("LongMethod")
    fun `concurrent club exposure and invitation acceptance preserve exact public effects without deadlock`() {
        val executor = Executors.newFixedThreadPool(2)
        try {
            repeat(4) { iteration ->
                val fixture = createConcurrencyFixture(500 + iteration)
                val invitedEmail = "fixture.invited.$iteration.${fixture.clubId.toString().take(8)}@example.com"
                val invitation =
                    invitations.createInvitation(
                        hostActor(fixture, ClubCapability.MANAGE_INVITATIONS),
                        invitedEmail,
                        "Fixture invited member",
                        applyToCurrentSession = false,
                    )
                val rawToken = checkNotNull(invitation.acceptUrl).substringAfterLast("/")
                val googleSubject = "fixture-google-subject-$iteration-${fixture.clubId.toString().take(8)}"
                try {
                    val sessionBefore = currentMarker(fixture.sessionId.toString())
                    val clubGenerationBefore = currentClubGeneration(fixture.clubId)
                    val sessionLinksBefore =
                        sessionConvergenceCount("public_mutation_convergence_links", fixture.sessionId.toString())
                    val clubLinksBefore = clubOnlyConvergenceCount("public_mutation_convergence_links", fixture.clubId)
                    val clubWorkBefore = clubOnlyConvergenceCount("public_convergence_work", fixture.clubId)
                    val ready = CountDownLatch(2)
                    val start = CountDownLatch(1)
                    val acceptance =
                        executor.submit<String> {
                            ready.countDown()
                            check(start.await(5, TimeUnit.SECONDS))
                            invitations
                                .acceptGoogleInvitation(
                                    rawToken = rawToken,
                                    googleSubjectId = googleSubject,
                                    email = invitedEmail,
                                    displayName = "Fixture invited member",
                                    profileImageUrl = null,
                                ).membershipStatus.name
                        }
                    val exposure =
                        executor.submit<ClubPublicVisibility> {
                            ready.countDown()
                            check(start.await(5, TimeUnit.SECONDS))
                            makeClubPrivate(fixture)
                        }
                    check(ready.await(5, TimeUnit.SECONDS))
                    start.countDown()

                    assertThat(acceptance.get(10, TimeUnit.SECONDS)).isEqualTo("ACTIVE")
                    assertThat(exposure.get(10, TimeUnit.SECONDS)).isEqualTo(ClubPublicVisibility.PRIVATE)
                    val sessionAfter = currentMarker(fixture.sessionId.toString())
                    assertThat(sessionAfter.first - sessionBefore.first).isEqualTo(1)
                    assertThat(currentClubGeneration(fixture.clubId) - clubGenerationBefore).isEqualTo(2)
                    assertThat(
                        sessionConvergenceCount("public_mutation_convergence_links", fixture.sessionId.toString()) -
                            sessionLinksBefore,
                    ).isEqualTo(1)
                    assertThat(
                        clubOnlyConvergenceCount("public_mutation_convergence_links", fixture.clubId) - clubLinksBefore,
                    ).isEqualTo(2)
                    assertThat(clubOnlyConvergenceCount("public_convergence_work", fixture.clubId) - clubWorkBefore)
                        .isEqualTo(2)
                    assertThat(authReceiptCount(fixture.clubId, "INVITATION_ACCEPTED")).isEqualTo(1)
                } finally {
                    cleanupConcurrencyFixture(fixture)
                    jdbcTemplate.update("delete from users where email = ?", invitedEmail)
                }
            }
        } finally {
            executor.shutdownNow()
        }
    }

    @Test
    @Suppress("LongMethod")
    fun `concurrent identical lifecycle suspension commits one effect and one locked no-op`() {
        val executor = Executors.newFixedThreadPool(2)
        try {
            repeat(4) { iteration ->
                val fixture = createConcurrencyFixture(600 + iteration)
                val admin =
                    CurrentPlatformAdmin(
                        userId = fixture.host.userId,
                        email = fixture.host.email,
                        role = PlatformAdminRole.OPERATOR,
                    )
                try {
                    val sessionBefore = currentMarker(fixture.sessionId.toString())
                    val clubGenerationBefore = currentClubGeneration(fixture.clubId)
                    val sessionLinksBefore =
                        sessionConvergenceCount("public_mutation_convergence_links", fixture.sessionId.toString())
                    val clubLinksBefore = clubOnlyConvergenceCount("public_mutation_convergence_links", fixture.clubId)
                    val ready = CountDownLatch(2)
                    val start = CountDownLatch(1)
                    val suspensions =
                        (1..2).map {
                            executor.submit<Unit> {
                                ready.countDown()
                                check(start.await(5, TimeUnit.SECONDS))
                                clubLifecycle.suspend(fixture.clubId, admin, "Synthetic concurrent suspension")
                            }
                        }
                    check(ready.await(5, TimeUnit.SECONDS))
                    start.countDown()
                    suspensions.forEach { it.get(10, TimeUnit.SECONDS) }

                    val sessionAfter = currentMarker(fixture.sessionId.toString())
                    assertThat(sessionAfter.first - sessionBefore.first).isEqualTo(1)
                    assertThat(currentClubGeneration(fixture.clubId) - clubGenerationBefore).isEqualTo(1)
                    assertThat(
                        sessionConvergenceCount("public_mutation_convergence_links", fixture.sessionId.toString()) -
                            sessionLinksBefore,
                    ).isEqualTo(1)
                    assertThat(
                        clubOnlyConvergenceCount("public_mutation_convergence_links", fixture.clubId) - clubLinksBefore,
                    ).isEqualTo(1)
                    assertThat(clubReceiptCount(fixture.clubId, "CLUB_SUSPENDED")).isEqualTo(1)
                    assertThat(clubStatus(fixture.clubId)).isEqualTo("SUSPENDED")
                } finally {
                    cleanupConcurrencyFixture(fixture)
                }
            }
        } finally {
            executor.shutdownNow()
        }
    }

    @Test
    @Suppress("LongMethod")
    fun `concurrent identical club exposure updates commit one semantic public effect`() {
        val executor = Executors.newFixedThreadPool(2)
        val admin =
            PlatformActor(
                UUID.fromString("00000000-0000-0000-0000-0000000000bb"),
                setOf(PlatformCapability.MANAGE_CLUBS),
            )
        try {
            repeat(4) { iteration ->
                val fixture = createConcurrencyFixture(100 + iteration)
                try {
                    val before = currentMarker(fixture.sessionId.toString())
                    val linksBefore =
                        sessionConvergenceCount("public_mutation_convergence_links", fixture.sessionId.toString())
                    val workBefore = sessionConvergenceCount("public_convergence_work", fixture.sessionId.toString())
                    val clubLinksBefore = clubOnlyConvergenceCount("public_mutation_convergence_links", fixture.clubId)
                    val clubWorkBefore = clubOnlyConvergenceCount("public_convergence_work", fixture.clubId)
                    val ready = CountDownLatch(2)
                    val start = CountDownLatch(1)
                    val updates =
                        (1..2).map {
                            executor.submit<ClubPublicVisibility> {
                                ready.countDown()
                                check(start.await(5, TimeUnit.SECONDS))
                                platformClubs
                                    .updateClub(
                                        admin,
                                        fixture.clubId,
                                        UpdatePlatformAdminClubCommand(
                                            name = null,
                                            tagline = null,
                                            about = null,
                                            publicVisibility = ClubPublicVisibility.PRIVATE,
                                        ),
                                    ).publicVisibility
                            }
                        }
                    check(ready.await(5, TimeUnit.SECONDS))
                    start.countDown()

                    assertThat(updates.map { it.get(10, TimeUnit.SECONDS) })
                        .containsExactly(ClubPublicVisibility.PRIVATE, ClubPublicVisibility.PRIVATE)
                    val after = currentMarker(fixture.sessionId.toString())
                    assertThat(after.first - before.first).isEqualTo(1)
                    assertThat(after.second - before.second).isEqualTo(1)
                    assertThat(
                        sessionConvergenceCount("public_mutation_convergence_links", fixture.sessionId.toString()) -
                            linksBefore,
                    ).isEqualTo(1)
                    assertThat(
                        sessionConvergenceCount("public_convergence_work", fixture.sessionId.toString()) - workBefore,
                    ).isEqualTo(1)
                    assertThat(
                        clubOnlyConvergenceCount("public_mutation_convergence_links", fixture.clubId) - clubLinksBefore,
                    ).isEqualTo(1)
                    assertThat(clubOnlyConvergenceCount("public_convergence_work", fixture.clubId) - clubWorkBefore)
                        .isEqualTo(1)
                } finally {
                    cleanupConcurrencyFixture(fixture)
                }
            }
        } finally {
            executor.shutdownNow()
        }
    }

    @Suppress("LongMethod")
    @Test
    fun `concurrent club exposure and published basic edit preserve every convergence without deadlock`() {
        val executor = Executors.newFixedThreadPool(2)
        val admin =
            PlatformActor(
                UUID.fromString("00000000-0000-0000-0000-0000000000bb"),
                setOf(PlatformCapability.MANAGE_CLUBS),
            )
        try {
            repeat(8) { iteration ->
                val fixture = createConcurrencyFixture(iteration)
                try {
                    val before = currentMarker(fixture.sessionId.toString())
                    val linksBefore =
                        sessionConvergenceCount("public_mutation_convergence_links", fixture.sessionId.toString())
                    val workBefore =
                        sessionConvergenceCount("public_convergence_work", fixture.sessionId.toString())
                    val clubOnlyLinksBefore =
                        clubOnlyConvergenceCount("public_mutation_convergence_links", fixture.clubId)
                    val clubOnlyWorkBefore = clubOnlyConvergenceCount("public_convergence_work", fixture.clubId)
                    val ready = CountDownLatch(2)
                    val start = CountDownLatch(1)
                    val basicEdit =
                        executor.submit<String> {
                            ready.countDown()
                            check(start.await(5, TimeUnit.SECONDS))
                            draftSessions
                                .update(
                                    UpdateHostSessionCommand(
                                        host = fixture.host,
                                        sessionId = fixture.sessionId,
                                        session = concurrencySessionCommand(fixture.host, iteration),
                                        expectedSessionRevision = ExpectedSessionRevision(0),
                                        idempotencyKey = "fixture-concurrent-basic-$iteration",
                                    ),
                                ).bookTitle
                        }
                    val clubExposure =
                        executor.submit<ClubPublicVisibility> {
                            ready.countDown()
                            check(start.await(5, TimeUnit.SECONDS))
                            platformClubs
                                .updateClub(
                                    admin,
                                    fixture.clubId,
                                    UpdatePlatformAdminClubCommand(
                                        name = "Concurrency club $iteration updated",
                                        tagline = null,
                                        about = null,
                                        publicVisibility = ClubPublicVisibility.PRIVATE,
                                    ),
                                ).publicVisibility
                        }
                    check(ready.await(5, TimeUnit.SECONDS))
                    start.countDown()

                    assertThat(basicEdit.get(10, TimeUnit.SECONDS)).isEqualTo("concurrent public book $iteration")
                    assertThat(clubExposure.get(10, TimeUnit.SECONDS)).isEqualTo(ClubPublicVisibility.PRIVATE)
                    val after = projection(fixture.sessionId.toString())
                    assertThat(after.generation - before.first).isEqualTo(2)
                    assertThat(after.clubGeneration - before.second).isEqualTo(2)
                    assertThat(
                        sessionConvergenceCount(
                            "public_mutation_convergence_links",
                            fixture.sessionId.toString(),
                        ) - linksBefore,
                    ).isEqualTo(2)
                    assertThat(
                        sessionConvergenceCount("public_convergence_work", fixture.sessionId.toString()) - workBefore,
                    ).isEqualTo(2)
                    assertThat(
                        clubOnlyConvergenceCount(
                            "public_mutation_convergence_links",
                            fixture.clubId,
                        ) - clubOnlyLinksBefore,
                    ).isEqualTo(1)
                    assertThat(
                        clubOnlyConvergenceCount("public_convergence_work", fixture.clubId) - clubOnlyWorkBefore,
                    ).isEqualTo(1)
                } finally {
                    cleanupConcurrencyFixture(fixture)
                }
            }
        } finally {
            executor.shutdownNow()
        }
    }

    @Test
    fun `committed unreadable marker remains authoritative even when live feature rows look public`() {
        val sessionId = createDraft("stored deny is authoritative", "key-c1-marker-create-01").first
        jdbcTemplate.update(
            """
            update sessions
            set state = 'PUBLISHED', access_scope = 'GUEST_READABLE', visibility = 'PUBLIC'
            where id = ?
            """.trimIndent(),
            sessionId,
        )
        val initial = versions(sessionId)
        putPublication(
            sessionId,
            "key-c1-marker-publication-01",
            initial.exposure,
            initial.publication,
            "GUEST_READABLE",
            "PUBLIC_RECORD",
            "Marker authority summary",
        )
        jdbcTemplate.update(
            "update public_projection_current set origin_readable = false where session_id = ?",
            sessionId,
        )

        val originReadable =
            publicData
                .loadSessionProjectionGeneration("reading-sai", UUID.fromString(sessionId))
                ?.originReadable
        assertThat(originReadable)
            .isFalse()
    }

    @Test
    fun `publish and unpublish rotate readable origin once while idempotent replay remains stable`() {
        val sessionId = createDraft("public lifecycle convergence", "key-c1-life-create-01").first
        jdbcTemplate.update(
            "update sessions set state = 'CLOSED', access_scope = 'GUEST_READABLE', visibility = 'MEMBER' where id = ?",
            sessionId,
        )
        val initial = versions(sessionId)
        putPublication(
            sessionId = sessionId,
            idempotencyKey = "key-c1-life-publication-01",
            expectedExposure = initial.exposure,
            expectedPublication = initial.publication,
            accessScope = "GUEST_READABLE",
            siteVisibility = "PUBLIC_RECORD",
            summary = "Lifecycle convergence summary",
        )
        val beforePublish = projection(sessionId)
        val publishExpected = publishVectorJson(sessionId)

        publish(sessionId, "key-c1-life-publish-01", publishExpected)

        val published = projection(sessionId)
        assertThat(published.generation).isEqualTo(beforePublish.generation + 1)
        assertThat(published.clubGeneration).isEqualTo(beforePublish.clubGeneration + 1)
        assertThat(published.originReadable).isTrue()

        publish(sessionId, "key-c1-life-publish-01", publishExpected)
        assertThat(projection(sessionId)).isEqualTo(published)

        mockMvc
            .post("/api/host/sessions/$sessionId/unpublish") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-c1-life-unpublish-01",
                        """{"sessionRevision":${versions(sessionId).session}}""",
                        "{}",
                    )
            }.andExpect { status { isOk() } }

        val unpublished = projection(sessionId)
        assertThat(unpublished.generation).isEqualTo(published.generation + 1)
        assertThat(unpublished.clubGeneration).isEqualTo(published.clubGeneration + 1)
        assertThat(unpublished.originReadable).isFalse()
    }

    @Suppress("LongMethod")
    @Test
    fun `published basic public content edit rotates once and idempotent replay stays stable`() {
        val sessionId = createDraft("public basic edit", "key-c1-basic-create-01").first
        jdbcTemplate.update(
            """
            update sessions
            set state = 'PUBLISHED', access_scope = 'GUEST_READABLE', visibility = 'PUBLIC'
            where id = ?
            """.trimIndent(),
            sessionId,
        )
        val initial = versions(sessionId)
        putPublication(
            sessionId,
            "key-c1-basic-publication-01",
            initial.exposure,
            initial.publication,
            "GUEST_READABLE",
            "PUBLIC_RECORD",
            "Basic edit public summary",
        )
        val before = projection(sessionId)
        val etagBefore =
            mockMvc
                .get("/api/public/clubs/reading-sai/sessions/$sessionId")
                .andExpect { status { isOk() } }
                .andReturn()
                .response
                .getHeader("ETag")
        val body =
            envelope(
                "key-c1-basic-save-01",
                """{"sessionRevision":${versions(sessionId).session}}""",
                """
                {
                  "title":"public basic edit changed",
                  "bookTitle":"generation-aware book",
                  "bookAuthor":"Example Author",
                  "bookImageUrl":"https://example.test/covers/generation-aware.jpg",
                  "date":"2026-09-05",
                  "locationLabel":"Online"
                }
                """.trimIndent(),
            )

        mockMvc
            .patch("/api/host/sessions/$sessionId") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = body
            }.andExpect { status { isOk() } }

        val changed = projection(sessionId)
        assertThat(changed.generation).isEqualTo(before.generation + 1)
        assertThat(changed.clubGeneration).isEqualTo(before.clubGeneration + 1)
        assertThat(changed.originReadable).isTrue()
        assertThat(changed.mutationReceiptId).isNotEqualTo(before.mutationReceiptId)
        assertThat(changed.workCount).isEqualTo(1)
        assertThat(
            mockMvc
                .get("/api/public/clubs/reading-sai/sessions/$sessionId")
                .andExpect { status { isOk() } }
                .andReturn()
                .response
                .getHeader("ETag"),
        ).isNotEqualTo(etagBefore)

        mockMvc
            .patch("/api/host/sessions/$sessionId") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = body
            }.andExpect { status { isOk() } }
        assertThat(projection(sessionId)).isEqualTo(changed)

        mockMvc
            .patch("/api/host/sessions/$sessionId") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    body
                        .replace("key-c1-basic-save-01", "key-c1-basic-save-noop-01")
                        .replace(
                            Regex("\"sessionRevision\":\\d+"),
                            """"sessionRevision":${versions(sessionId).session}""",
                        )
            }.andExpect { status { isOk() } }
        assertThat(projection(sessionId)).isEqualTo(changed)

        jdbcTemplate.update(
            "update public_projection_current set origin_readable = false where session_id = ?",
            sessionId,
        )
        mockMvc
            .patch("/api/host/sessions/$sessionId") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    body
                        .replace("key-c1-basic-save-01", "key-c1-basic-save-denied-01")
                        .replace("public basic edit changed", "public basic edit while denied")
                        .replace("generation-aware book", "generation-aware denied book")
                        .replace(
                            Regex("\"sessionRevision\":\\d+"),
                            """"sessionRevision":${versions(sessionId).session}""",
                        )
            }.andExpect { status { isOk() } }
        val denied = projection(sessionId)
        assertThat(denied.generation).isEqualTo(changed.generation + 1)
        assertThat(denied.originReadable).isFalse()
        mockMvc
            .get("/api/public/clubs/reading-sai/sessions/$sessionId")
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `publication changes rotate current generations and bind the immutable host receipt atomically`() {
        val sessionId = createDraft("public convergence generation", "key-c1-create-01").first
        val withdrawalReplayFixture = "fixture-withdrawal-replay"
        jdbcTemplate.update(
            "update sessions set state = 'CLOSED', access_scope = 'GUEST_READABLE', visibility = 'MEMBER' where id = ?",
            sessionId,
        )
        val initial = versions(sessionId)

        putPublication(
            sessionId = sessionId,
            idempotencyKey = "key-c1-publication-01",
            expectedExposure = initial.exposure,
            expectedPublication = initial.publication,
            accessScope = "GUEST_READABLE",
            siteVisibility = "PUBLIC_RECORD",
            summary = "Public convergence summary",
        )

        val first = projection(sessionId)
        assertThat(first.generation).isEqualTo(1L)
        assertThat(first.clubGeneration).isGreaterThan(0L)
        assertThat(first.originReadable).isFalse()
        assertThat(first.liveRecordRevision).isEqualTo(0L)
        assertThat(first.mutationReceiptId).isNotBlank()
        assertThat(first.linkedGeneration).isEqualTo(first.generation)
        assertThat(first.workCount).isEqualTo(1)

        val afterFirst = versions(sessionId)
        putPublication(
            sessionId = sessionId,
            idempotencyKey = "key-c1-publication-noop-01",
            expectedExposure = afterFirst.exposure,
            expectedPublication = afterFirst.publication,
            accessScope = "GUEST_READABLE",
            siteVisibility = "PUBLIC_RECORD",
            summary = "Public convergence summary",
        )
        assertThat(projection(sessionId)).isEqualTo(first)

        putPublication(
            sessionId = sessionId,
            idempotencyKey = withdrawalReplayFixture,
            expectedExposure = afterFirst.exposure,
            expectedPublication = afterFirst.publication,
            accessScope = "HOST_ONLY",
            siteVisibility = "HIDDEN",
            summary = "Public convergence summary",
        )

        val withdrawn = projection(sessionId)
        assertThat(withdrawn.generation).isEqualTo(first.generation + 1)
        assertThat(withdrawn.clubGeneration).isEqualTo(first.clubGeneration + 1)
        assertThat(withdrawn.originReadable).isFalse()
        assertThat(withdrawn.convergenceId).isNotEqualTo(first.convergenceId)
        assertThat(withdrawn.linkedGeneration).isEqualTo(withdrawn.generation)
        assertThat(withdrawn.workCount).isEqualTo(1)
    }

    @Test
    @Suppress("LongMethod", "MaxLineLength")
    fun `immutable links and ordered events survive synthetic resource hard delete while work can expire`() {
        val sessionId = createDraft("public convergence hard delete", "key-c1-delete-create-01").first
        jdbcTemplate.update(
            "update sessions set state = 'CLOSED', access_scope = 'GUEST_READABLE', visibility = 'MEMBER' where id = ?",
            sessionId,
        )
        val initial = versions(sessionId)
        putPublication(
            sessionId = sessionId,
            idempotencyKey = "key-c1-delete-publication-01",
            expectedExposure = initial.exposure,
            expectedPublication = initial.publication,
            accessScope = "GUEST_READABLE",
            siteVisibility = "PUBLIC_RECORD",
            summary = "Synthetic convergence content",
        )
        val beforeDelete = projection(sessionId)
        assertThatThrownBy {
            jdbcTemplate.update(
                """
                insert into public_convergence_events (
                  convergence_id, attempt_no, event_seq, status, observed_at,
                  result_category, club_id_snapshot, session_id_snapshot, publication_id_snapshot
                ) values (?, 2, 1, 'SUCCEEDED', utc_timestamp(6), 'NO_CHANGE', ?, ?, null)
                """.trimIndent(),
                beforeDelete.convergenceId,
                CLUB_ID,
                sessionId,
            )
        }
        jdbcTemplate.update(
            """
            insert into public_convergence_events (
              convergence_id, attempt_no, event_seq, status, observed_at,
              result_category, club_id_snapshot, session_id_snapshot, publication_id_snapshot
            ) values (?, 1, 0, 'PENDING', utc_timestamp(6), null, ?, ?, null)
            """.trimIndent(),
            beforeDelete.convergenceId,
            CLUB_ID,
            sessionId,
        )
        jdbcTemplate.update(
            """
            insert into public_convergence_events (
              convergence_id, attempt_no, event_seq, status, observed_at,
              result_category, club_id_snapshot, session_id_snapshot, publication_id_snapshot
            ) values (?, 1, 1, 'FAILED', utc_timestamp(6), 'PROVIDER_UNAVAILABLE', ?, ?, null)
            """.trimIndent(),
            beforeDelete.convergenceId,
            CLUB_ID,
            sessionId,
        )

        assertThat(
            jdbcTemplate.queryForMap(
                "select attempt_no, status, result_category from public_convergence_current where convergence_id = ?",
                beforeDelete.convergenceId,
            ),
        ).containsEntry("attempt_no", 1).containsEntry("status", "FAILED")

        jdbcTemplate.update(
            """
            update sessions
            set deleted_at = timestampadd(day, -31, utc_timestamp(6)),
                deleted_by_membership_id = '00000000-0000-0000-0000-000000000201',
                purge_after = timestampadd(day, -1, utc_timestamp(6))
            where id = ?
            """.trimIndent(),
            sessionId,
        )
        assertThat(purgeExpiredTrash.purgeExpired(50)).isGreaterThanOrEqualTo(1)

        assertThat(count("sessions", "id", sessionId)).isZero()
        assertThat(count("public_projection_current", "session_id", sessionId)).isZero()
        assertThat(count("public_convergence_work", "convergence_id", beforeDelete.convergenceId)).isZero()
        assertThat(count("public_mutation_convergence_links", "convergence_id", beforeDelete.convergenceId)).isEqualTo(1)
        assertThat(count("public_convergence_events", "convergence_id", beforeDelete.convergenceId)).isEqualTo(2)
        assertThat(
            jdbcTemplate.queryForObject(
                "select concat(club_id_snapshot, ':', session_id_snapshot) from public_mutation_convergence_links where convergence_id = ?",
                String::class.java,
                beforeDelete.convergenceId,
            ),
        ).isEqualTo("$CLUB_ID:$sessionId")
    }

    private fun putPublication(
        sessionId: String,
        idempotencyKey: String,
        expectedExposure: Long,
        expectedPublication: Long,
        accessScope: String,
        siteVisibility: String,
        summary: String,
    ) {
        mockMvc
            .put("/api/host/sessions/$sessionId/publication") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        idempotencyKey,
                        """{"exposureRevision":$expectedExposure,"publicationRevision":$expectedPublication}""",
                        """{"publicSummary":"$summary","accessScope":"$accessScope",""" +
                            """"siteVisibility":"$siteVisibility"}""",
                    )
            }.andExpect { status { isOk() } }
    }

    private fun publish(
        sessionId: String,
        idempotencyKey: String,
        expected: String,
    ) {
        mockMvc
            .post("/api/host/sessions/$sessionId/publish") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope(idempotencyKey, expected, "{}")
            }.andExpect { status { isOk() } }
    }

    @Suppress("LongMethod")
    private fun createConcurrencyFixture(iteration: Int): ConcurrencyFixture {
        val clubId = UUID.randomUUID()
        val membershipId = UUID.randomUUID()
        val sessionId = UUID.randomUUID()
        val publicationId = UUID.randomUUID()
        val slug = "projection-lock-$iteration-${clubId.toString().take(8)}"
        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about, status, public_visibility)
            values (?, ?, ?, 'A concurrency test club', 'A public-safe concurrency fixture.', 'ACTIVE', 'PUBLIC')
            """.trimIndent(),
            clubId.toString(),
            slug,
            "Concurrency club $iteration",
        )
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            values (?, ?, '00000000-0000-0000-0000-000000000101', 'HOST', 'ACTIVE',
                    utc_timestamp(6), 'Fixture Host', 'mushroom-green-book')
            """.trimIndent(),
            membershipId.toString(),
            clubId.toString(),
        )
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, session_date,
              start_time, end_time, location_label, question_deadline_at,
              state, visibility, access_scope
            ) values (?, ?, 1, 'Concurrency session', 'Concurrency book', 'Example Author', '2026-10-01',
                      '19:00:00', '21:00:00', 'Online', '2026-09-30 14:59:00',
                      'PUBLISHED', 'PUBLIC', 'GUEST_READABLE')
            """.trimIndent(),
            sessionId.toString(),
            clubId.toString(),
        )
        jdbcTemplate.update(
            "insert into session_publication_versions (session_id, publication_revision) values (?, 0)",
            sessionId.toString(),
        )
        jdbcTemplate.update(
            "insert into club_host_list_epochs (club_id, meeting_epoch, record_epoch) values (?, 0, 0)",
            clubId.toString(),
        )
        jdbcTemplate.update(
            """
            insert into public_session_publications (
              id, club_id, session_id, public_summary, is_public, published_at, visibility, site_visibility
            ) values (?, ?, ?, 'Concurrency projection summary', true, utc_timestamp(6), 'PUBLIC', 'PUBLIC_RECORD')
            """.trimIndent(),
            publicationId.toString(),
            clubId.toString(),
            sessionId.toString(),
        )
        jdbcTemplate.update(
            """
            insert into session_participants (
              id, club_id, session_id, membership_id, rsvp_status, attendance_status, participation_status
            ) values (?, ?, ?, ?, 'GOING', 'ATTENDED', 'ACTIVE')
            """.trimIndent(),
            UUID.randomUUID().toString(),
            clubId.toString(),
            sessionId.toString(),
            membershipId.toString(),
        )
        jdbcTemplate.update(
            """
            insert into one_line_reviews (id, club_id, session_id, membership_id, text, visibility)
            values (?, ?, ?, ?, 'Public fixture review', 'PUBLIC')
            """.trimIndent(),
            UUID.randomUUID().toString(),
            clubId.toString(),
            sessionId.toString(),
            membershipId.toString(),
        )
        jdbcTemplate.update(
            """
            insert into public_club_projection_generations (
              club_id, generation, origin_readable, convergence_id, updated_at
            ) values (?, 1, true, null, utc_timestamp(6))
            """.trimIndent(),
            clubId.toString(),
        )
        jdbcTemplate.update(
            """
            insert into public_projection_current (
              session_id, club_id, publication_id_snapshot, generation, club_generation,
              live_record_revision, origin_readable, convergence_id, updated_at
            ) values (?, ?, ?, 1, 1, 0, true, null, utc_timestamp(6))
            """.trimIndent(),
            sessionId.toString(),
            clubId.toString(),
            publicationId.toString(),
        )
        return ConcurrencyFixture(
            clubId = clubId,
            membershipId = membershipId,
            sessionId = sessionId,
            host =
                CurrentMember(
                    userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
                    membershipId = membershipId,
                    clubId = clubId,
                    clubSlug = slug,
                    email = "host@example.com",
                    displayName = "Fixture Host",
                    accountName = "Fixture Host",
                    role = MembershipRole.HOST,
                    clubName = "Concurrency club $iteration",
                ),
        )
    }

    private fun concurrencySessionCommand(
        host: CurrentMember,
        iteration: Int,
    ) = HostSessionCommand(
        host = host,
        title = "concurrent title $iteration",
        bookTitle = "concurrent public book $iteration",
        bookAuthor = "Example Author",
        bookLink = null,
        bookImageUrl = null,
        date = "2026-10-01",
        startTime = "19:00",
        endTime = "21:00",
        questionDeadlineAt = "2026-09-30T23:59:00+09:00",
        locationLabel = "Online",
        meetingUrl = null,
        meetingPasscode = null,
    )

    private fun makeClubPrivate(fixture: ConcurrencyFixture): ClubPublicVisibility =
        platformClubs
            .updateClub(
                PlatformActor(
                    UUID.fromString("00000000-0000-0000-0000-0000000000bb"),
                    setOf(PlatformCapability.MANAGE_CLUBS),
                ),
                fixture.clubId,
                UpdatePlatformAdminClubCommand(null, null, null, ClubPublicVisibility.PRIVATE),
            ).publicVisibility

    private fun createViewerMembership(fixture: ConcurrencyFixture): UUID {
        val membershipId = UUID.randomUUID()
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, short_name, avatar_key)
            values (?, ?, '00000000-0000-0000-0000-000000000102', 'MEMBER', 'VIEWER',
                    'Fixture Viewer', 'cloud-green-book')
            """.trimIndent(),
            membershipId.toString(),
            fixture.clubId.toString(),
        )
        return membershipId
    }

    private fun createActiveMember(fixture: ConcurrencyFixture): UUID {
        val membershipId = UUID.randomUUID()
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            values (?, ?, '00000000-0000-0000-0000-000000000102', 'MEMBER', 'ACTIVE',
                    utc_timestamp(6), 'Fixture Member', 'cloud-green-book')
            """.trimIndent(),
            membershipId.toString(),
            fixture.clubId.toString(),
        )
        return membershipId
    }

    private fun hostActor(
        fixture: ConcurrencyFixture,
        capability: ClubCapability,
    ) = ClubActor(
        fixture.host.userId,
        fixture.membershipId,
        fixture.clubId,
        fixture.host.clubSlug,
        setOf(capability),
    )

    private fun cleanupConcurrencyFixture(fixture: ConcurrencyFixture) {
        val clubId = fixture.clubId.toString()
        listOf("public_convergence_events", "public_convergence_work").forEach { table ->
            jdbcTemplate.update("delete from $table where club_id_snapshot = ?", clubId)
        }
        jdbcTemplate.update("delete from public_mutation_convergence_links where club_id_snapshot = ?", clubId)
        jdbcTemplate.update("delete from club_public_projection_mutation_receipts where club_id_snapshot = ?", clubId)
        jdbcTemplate.update("delete from auth_public_projection_mutation_receipts where club_id_snapshot = ?", clubId)
        jdbcTemplate.update("delete from host_session_mutation_receipts where club_id = ?", clubId)
        jdbcTemplate.update("delete from mutation_idempotency_keys where club_id = ?", clubId)
        jdbcTemplate.update("delete from host_session_change_audit where club_id = ?", clubId)
        jdbcTemplate.update("delete from club_audit_events where club_id = ?", clubId)
        jdbcTemplate.update("delete from invitations where club_id = ?", clubId)
        jdbcTemplate.update("delete from public_projection_current where club_id = ?", clubId)
        jdbcTemplate.update("delete from public_club_projection_generations where club_id = ?", clubId)
        jdbcTemplate.update("delete from public_session_publications where club_id = ?", clubId)
        jdbcTemplate.update("delete from one_line_reviews where club_id = ?", clubId)
        jdbcTemplate.update("delete from session_participants where club_id = ?", clubId)
        jdbcTemplate.update(
            "delete from session_publication_versions where session_id = ?",
            fixture.sessionId.toString(),
        )
        jdbcTemplate.update("delete from club_host_list_epochs where club_id = ?", clubId)
        jdbcTemplate.update("delete from sessions where club_id = ?", clubId)
        jdbcTemplate.update("delete from memberships where club_id = ?", clubId)
        jdbcTemplate.update("delete from clubs where id = ?", clubId)
    }

    private fun sessionConvergenceCount(
        table: String,
        sessionId: String,
    ): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from $table where session_id_snapshot = ?",
            Int::class.java,
            sessionId,
        ) ?: 0

    private fun clubOnlyConvergenceCount(
        table: String,
        clubId: UUID = UUID.fromString(CLUB_ID),
    ): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from $table where club_id_snapshot = ? and session_id_snapshot is null",
            Int::class.java,
            clubId.toString(),
        ) ?: 0

    private fun projection(sessionId: String): ProjectionFingerprint {
        val current =
            jdbcTemplate.queryForMap(
                """
                select generation, club_generation, live_record_revision, origin_readable, convergence_id
                from public_projection_current
                where session_id = ?
                """.trimIndent(),
                sessionId,
            )
        val convergenceId = current["convergence_id"].toString()
        val link =
            jdbcTemplate.queryForMap(
                """
                select mutation_receipt_id, committed_generation
                from public_mutation_convergence_links
                where convergence_id = ?
                """.trimIndent(),
                convergenceId,
            )
        return ProjectionFingerprint(
            generation = (current["generation"] as Number).toLong(),
            clubGeneration = (current["club_generation"] as Number).toLong(),
            liveRecordRevision = (current["live_record_revision"] as? Number)?.toLong(),
            originReadable = current["origin_readable"] as Boolean,
            convergenceId = convergenceId,
            mutationReceiptId = link["mutation_receipt_id"].toString(),
            linkedGeneration = (link["committed_generation"] as Number).toLong(),
            workCount = count("public_convergence_work", "convergence_id", convergenceId),
        )
    }

    private fun currentMarker(sessionId: String): Pair<Long, Long> {
        val row =
            jdbcTemplate.queryForMap(
                "select generation, club_generation from public_projection_current where session_id = ?",
                sessionId,
            )
        return (row["generation"] as Number).toLong() to (row["club_generation"] as Number).toLong()
    }

    private fun currentClubGeneration(clubId: UUID): Long =
        checkNotNull(
            jdbcTemplate.queryForObject(
                "select generation from public_club_projection_generations where club_id = ?",
                Long::class.java,
                clubId.toString(),
            ),
        )

    private fun authReceiptCount(
        clubId: UUID,
        operation: String,
    ): Int =
        jdbcTemplate.queryForObject(
            """
            select count(*) from auth_public_projection_mutation_receipts
            where club_id_snapshot = ? and operation = ? and session_id_snapshot is null
            """.trimIndent(),
            Int::class.java,
            clubId.toString(),
            operation,
        ) ?: 0

    private fun clubReceiptCount(
        clubId: UUID,
        operation: String,
    ): Int =
        jdbcTemplate.queryForObject(
            """
            select count(*) from club_public_projection_mutation_receipts
            where club_id_snapshot = ? and operation = ? and session_id_snapshot is null
            """.trimIndent(),
            Int::class.java,
            clubId.toString(),
            operation,
        ) ?: 0

    private fun clubStatus(clubId: UUID): String =
        checkNotNull(
            jdbcTemplate.queryForObject(
                "select status from clubs where id = ?",
                String::class.java,
                clubId.toString(),
            ),
        )

    private fun count(
        table: String,
        column: String,
        value: String,
    ): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from $table where $column = ?",
            Int::class.java,
            value,
        ) ?: 0

    private data class ProjectionFingerprint(
        val generation: Long,
        val clubGeneration: Long,
        val liveRecordRevision: Long?,
        val originReadable: Boolean,
        val convergenceId: String,
        val mutationReceiptId: String,
        val linkedGeneration: Long,
        val workCount: Int,
    )

    private data class ConcurrencyFixture(
        val clubId: UUID,
        val membershipId: UUID,
        val sessionId: UUID,
        val host: CurrentMember,
    )
}

private const val CLEANUP_PUBLIC_CONVERGENCE_SQL = """
    delete from public_convergence_work
    where session_id_snapshot in (
      select id from sessions where club_id = '00000000-0000-0000-0000-000000000001' and number > 7
    );
    delete from public_projection_current
    where session_id in (
      select id from sessions where club_id = '00000000-0000-0000-0000-000000000001' and number > 7
    );
"""
