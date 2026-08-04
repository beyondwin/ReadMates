package com.readmates.admin.operations.adapter.out.source

import com.readmates.admin.operations.application.model.AdminOperationSeverity
import com.readmates.admin.operations.application.model.AdminOperationSourceStatus
import com.readmates.admin.operations.application.model.AdminOperationSourceType
import com.readmates.admin.operations.application.port.out.AdminOperationSignalVerification
import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.AiOpsAction
import com.readmates.aigen.application.model.AiOpsJobFilters
import com.readmates.aigen.application.model.AiOpsJobList
import com.readmates.aigen.application.model.AiOpsJobListItem
import com.readmates.aigen.application.model.JobStage
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.`in`.GetAiOpsJobUseCase
import com.readmates.aigen.application.port.`in`.ListAiOpsJobsUseCase
import com.readmates.aigen.config.AiGenerationProperties
import com.readmates.club.application.model.AdminTodayClosingRiskItem
import com.readmates.club.application.model.AdminTodayClosingRiskSnapshot
import com.readmates.club.application.model.FirstHostOnboardingState
import com.readmates.club.application.model.PlatformAdminClubList
import com.readmates.club.application.model.PlatformAdminClubListItem
import com.readmates.club.application.port.`in`.ListAdminTodayClosingRisksUseCase
import com.readmates.club.application.port.`in`.ListPlatformAdminClubsUseCase
import com.readmates.club.domain.ClubPublicVisibility
import com.readmates.club.domain.ClubStatus
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.notification.application.model.AdminNotificationDelivery
import com.readmates.notification.application.model.AdminNotificationFailureCluster
import com.readmates.notification.application.model.AdminNotificationFilter
import com.readmates.notification.application.model.AdminNotificationOperationsSnapshot
import com.readmates.notification.application.model.AdminNotificationOutboxEvent
import com.readmates.notification.application.model.AdminNotificationRelaySummary
import com.readmates.notification.application.model.AdminNotificationReplayConfirmCommand
import com.readmates.notification.application.model.AdminNotificationReplayConfirmResult
import com.readmates.notification.application.model.AdminNotificationReplayPreview
import com.readmates.notification.application.model.AdminNotificationReplayPreviewRequest
import com.readmates.notification.application.model.AdminNotificationStatusSummary
import com.readmates.notification.application.port.`in`.ManageAdminNotificationOperationsUseCase
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentPlatformAdmin
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.Clock
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID
import com.readmates.notification.application.model.AdminNotificationClubHealth as NotificationClubHealth

class AdminOperationSignalProvidersTest {
    private val observedAt = OffsetDateTime.parse("2026-08-04T10:15:30Z")
    private val clock = Clock.fixed(observedAt.toInstant(), ZoneOffset.UTC)
    private val admin =
        CurrentPlatformAdmin(
            userId = UUID.fromString("10000000-0000-0000-0000-000000000001"),
            email = RAW_EMAIL,
            role = PlatformAdminRole.OPERATOR,
        )

    @Test
    fun `club readiness maps exact safe identities and summary codes`() {
        val domainClub = club(index = 1, domainActionRequiredCount = 2)
        val setupClub =
            club(
                index = 2,
                status = ClubStatus.SETUP_REQUIRED,
                tagline = "",
                about = "",
                firstHostOnboardingState = FirstHostOnboardingState.MISSING,
            )
        val readyClub = club(index = 3)
        val publicClub = club(index = 4, publicVisibility = ClubPublicVisibility.PUBLIC)
        val provider =
            ClubReadinessOperationSignalProvider(
                listClubsUseCase =
                    FakeListPlatformAdminClubsUseCase(
                        listOf(domainClub, setupClub, readyClub, publicClub),
                    ),
                clock = clock,
            )

        val batch = provider.collect(admin)

        assertThat(batch.sourceType).isEqualTo(AdminOperationSourceType.CLUB_READINESS)
        assertThat(batch.status).isEqualTo(AdminOperationSourceStatus.AVAILABLE)
        assertThat(batch.authoritative).isTrue()
        assertThat(batch.generatedAt).isEqualTo(observedAt)
        assertThat(batch.signals.map { it.sourceKey to it.summaryCode }).containsExactly(
            "CLUB_READINESS:${domainClub.clubId}" to "CLUB_DOMAIN_ACTION_REQUIRED",
            "CLUB_READINESS:${setupClub.clubId}" to "CLUB_SETUP_REQUIRED",
            "CLUB_READINESS:${readyClub.clubId}" to "CLUB_READY_TO_PUBLISH",
        )
        assertThat(batch.signals.map { it.severity }).containsExactly(
            AdminOperationSeverity.WARNING,
            AdminOperationSeverity.WARNING,
            AdminOperationSeverity.READY,
        )
        assertThat(batch.signals.map { it.impactCount }).containsExactly(2, 1, 1)
        assertThat(batch.signals.map { it.detailHref }).containsExactly(
            "/admin/clubs/${domainClub.clubId}",
            "/admin/clubs/${setupClub.clubId}",
            "/admin/clubs/${readyClub.clubId}",
        )
        assertSafeProjection(batch.signals.flatMap { listOf(it.sourceKey, it.summaryCode, it.detailHref) })
        assertThat(provider.verify(admin, "CLUB_READINESS:${domainClub.clubId}"))
            .isEqualTo(AdminOperationSignalVerification.ACTIVE)
        assertThat(provider.verify(admin, "CLUB_READINESS:${publicClub.clubId}"))
            .isEqualTo(AdminOperationSignalVerification.ABSENT)
    }

    @Test
    fun `club full size page is partial and cannot verify a missing identity as absent`() {
        val clubs = (1..CLUB_PAGE_LIMIT).map { club(index = it, publicVisibility = ClubPublicVisibility.PUBLIC) }
        val provider = ClubReadinessOperationSignalProvider(FakeListPlatformAdminClubsUseCase(clubs), clock)

        val batch = provider.collect(admin)

        assertThat(batch.status).isEqualTo(AdminOperationSourceStatus.PARTIAL)
        assertThat(batch.authoritative).isFalse()
        assertThat(provider.verify(admin, "CLUB_READINESS:${UUID.randomUUID()}"))
            .isEqualTo(AdminOperationSignalVerification.UNAVAILABLE)
    }

    @Test
    fun `club source exception propagates without fabricating a signal`() {
        val provider =
            ClubReadinessOperationSignalProvider(
                FakeListPlatformAdminClubsUseCase(error = IllegalStateException(RAW_PROVIDER_ERROR)),
                clock,
            )

        assertThatThrownBy { provider.collect(admin) }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessage(RAW_PROVIDER_ERROR)
    }

    @Test
    fun `notification maps club delivery failures and aggregate platform backlog safely`() {
        val failedClub = notificationClub(index = 1, failed = 3, dead = 2)
        val healthyClub = notificationClub(index = 2)
        val snapshot = notificationSnapshot(clubHealth = listOf(failedClub, healthyClub))
        val provider = NotificationOperationSignalProvider(FakeNotificationOperationsUseCase(snapshot))

        val batch = provider.collect(admin)

        assertThat(batch.status).isEqualTo(AdminOperationSourceStatus.AVAILABLE)
        assertThat(batch.authoritative).isTrue()
        assertThat(batch.signals.map { it.sourceKey to it.summaryCode }).containsExactly(
            "NOTIFICATION:CLUB:${failedClub.clubId}" to "NOTIFICATION_DELIVERY_FAILURE",
            "NOTIFICATION:PLATFORM_BACKLOG" to "NOTIFICATION_PLATFORM_BACKLOG",
        )
        assertThat(batch.signals.map { it.severity }).containsExactly(
            AdminOperationSeverity.CRITICAL,
            AdminOperationSeverity.CRITICAL,
        )
        assertThat(batch.signals.map { it.impactCount }).containsExactly(5, 9)
        assertThat(batch.signals.map { it.detailHref }).containsExactly(
            "/admin/notifications?clubId=${failedClub.clubId}",
            "/admin/notifications?focus=outbox_backlog",
        )
        assertSafeProjection(batch.signals.flatMap { listOf(it.sourceKey, it.summaryCode, it.detailHref) })
        assertThat(provider.verify(admin, "NOTIFICATION:CLUB:${failedClub.clubId}"))
            .isEqualTo(AdminOperationSignalVerification.ACTIVE)
        assertThat(provider.verify(admin, "NOTIFICATION:CLUB:${healthyClub.clubId}"))
            .isEqualTo(AdminOperationSignalVerification.ABSENT)
        assertThat(provider.verify(admin, "NOTIFICATION:PLATFORM_BACKLOG"))
            .isEqualTo(AdminOperationSignalVerification.ACTIVE)
    }

    @Test
    fun `notification full size club health never proves a missing club absent but aggregate backlog remains exact`() {
        val clubs = (1..NOTIFICATION_PAGE_LIMIT).map { notificationClub(index = it) }
        val provider =
            NotificationOperationSignalProvider(
                FakeNotificationOperationsUseCase(notificationSnapshot(clubHealth = clubs)),
            )

        val batch = provider.collect(admin)

        assertThat(batch.status).isEqualTo(AdminOperationSourceStatus.PARTIAL)
        assertThat(batch.authoritative).isFalse()
        assertThat(provider.verify(admin, "NOTIFICATION:CLUB:${UUID.randomUUID()}"))
            .isEqualTo(AdminOperationSignalVerification.UNAVAILABLE)
        assertThat(provider.verify(admin, "NOTIFICATION:PLATFORM_BACKLOG"))
            .isEqualTo(AdminOperationSignalVerification.ACTIVE)
    }

    @Test
    fun `AI disabled is disabled with no signals and cannot verify old identities`() {
        val lists = FakeListAiOpsJobsUseCase(error = AssertionError("disabled provider must not list jobs"))
        val gets = FakeGetAiOpsJobUseCase(error = AssertionError("disabled provider must not get jobs"))
        val provider = AiOperationSignalProvider(AiGenerationProperties(enabled = false), lists, gets, clock)

        val batch = provider.collect(admin)

        assertThat(batch.sourceType).isEqualTo(AdminOperationSourceType.AI_JOB)
        assertThat(batch.status).isEqualTo(AdminOperationSourceStatus.DISABLED)
        assertThat(batch.authoritative).isFalse()
        assertThat(batch.signals).isEmpty()
        assertThat(provider.verify(admin, "AI_JOB:${UUID.randomUUID()}"))
            .isEqualTo(AdminOperationSignalVerification.UNAVAILABLE)
    }

    @Test
    fun `AI maps failed and stale jobs without private job content`() {
        val failed = aiJob(index = 1, status = JobStatus.FAILED, staleCandidate = true)
        val stale = aiJob(index = 2, status = JobStatus.RUNNING, staleCandidate = true)
        val healthy = aiJob(index = 3, status = JobStatus.RUNNING, staleCandidate = false)
        val lists = FakeListAiOpsJobsUseCase(AiOpsJobList(listOf(failed, stale, healthy), nextCursor = null))
        val gets = FakeGetAiOpsJobUseCase(mapOf(failed.jobId to failed, stale.jobId to stale, healthy.jobId to healthy))
        val provider = AiOperationSignalProvider(AiGenerationProperties(enabled = true), lists, gets, clock)

        val batch = provider.collect(admin)

        assertThat(batch.status).isEqualTo(AdminOperationSourceStatus.AVAILABLE)
        assertThat(batch.authoritative).isTrue()
        assertThat(batch.signals.map { it.sourceKey to it.summaryCode }).containsExactly(
            "AI_JOB:${failed.jobId}" to "AI_JOB_FAILED",
            "AI_JOB:${stale.jobId}" to "AI_JOB_STALE",
        )
        assertThat(batch.signals.map { it.severity }).containsExactly(
            AdminOperationSeverity.CRITICAL,
            AdminOperationSeverity.WARNING,
        )
        assertThat(batch.signals.map { it.impactCount }).containsOnly(1)
        assertThat(batch.signals.map { it.detailHref }).containsExactly(
            "/admin/ai-ops?clubId=${failed.clubId}",
            "/admin/ai-ops?clubId=${stale.clubId}",
        )
        assertSafeProjection(batch.signals.flatMap { listOf(it.sourceKey, it.summaryCode, it.detailHref) })
        assertThat(provider.verify(admin, "AI_JOB:${failed.jobId}"))
            .isEqualTo(AdminOperationSignalVerification.ACTIVE)
        assertThat(provider.verify(admin, "AI_JOB:${healthy.jobId}"))
            .isEqualTo(AdminOperationSignalVerification.ABSENT)
        assertThat(gets.requestedJobIds).containsExactly(failed.jobId, healthy.jobId)
    }

    @Test
    fun `AI continued list is partial while exact get determines absence`() {
        val listed = aiJob(index = 1, status = JobStatus.FAILED)
        val healthy = aiJob(index = 2, status = JobStatus.COMMITTED)
        val lists = FakeListAiOpsJobsUseCase(AiOpsJobList(listOf(listed), nextCursor = "continued"))
        val gets = FakeGetAiOpsJobUseCase(mapOf(healthy.jobId to healthy))
        val provider = AiOperationSignalProvider(AiGenerationProperties(enabled = true), lists, gets, clock)

        val batch = provider.collect(admin)

        assertThat(batch.status).isEqualTo(AdminOperationSourceStatus.PARTIAL)
        assertThat(batch.authoritative).isFalse()
        assertThat(provider.verify(admin, "AI_JOB:${healthy.jobId}"))
            .isEqualTo(AdminOperationSignalVerification.ABSENT)
        val missingJobId = UUID.randomUUID()
        assertThat(provider.verify(admin, "AI_JOB:$missingJobId"))
            .isEqualTo(AdminOperationSignalVerification.ABSENT)
        assertThat(gets.requestedJobIds).containsExactly(healthy.jobId, missingJobId)
    }

    @Test
    fun `closing risk maps safe session identity and server generated internal link`() {
        val blocked = closingRisk(index = 1, overallState = "BLOCKED", occurrenceCount = 4)
        val inProgress = closingRisk(index = 2, overallState = "IN_PROGRESS")
        val ready = closingRisk(index = 3, overallState = "READY")
        val provider =
            ClosingRiskOperationSignalProvider(
                FakeClosingRisksUseCase(closingSnapshot(listOf(blocked, inProgress, ready))),
            )

        val batch = provider.collect(admin)

        assertThat(batch.status).isEqualTo(AdminOperationSourceStatus.AVAILABLE)
        assertThat(batch.authoritative).isTrue()
        assertThat(batch.signals.map { it.sourceKey to it.summaryCode }).containsExactly(
            "CLOSING_RISK:${blocked.sessionId}" to "SESSION_CLOSING_BLOCKED",
            "CLOSING_RISK:${inProgress.sessionId}" to "SESSION_CLOSING_BLOCKED",
            "CLOSING_RISK:${ready.sessionId}" to "SESSION_CLOSING_BLOCKED",
        )
        assertThat(batch.signals.map { it.severity }).containsExactly(
            AdminOperationSeverity.CRITICAL,
            AdminOperationSeverity.WARNING,
            AdminOperationSeverity.READY,
        )
        assertThat(batch.signals.map { it.impactCount }).containsOnly(1)
        assertThat(batch.signals.map { it.detailHref }).containsExactly(
            "/clubs/${blocked.clubSlug}/app/host/sessions/${blocked.sessionId}/closing",
            "/clubs/${inProgress.clubSlug}/app/host/sessions/${inProgress.sessionId}/closing",
            "/clubs/${ready.clubSlug}/app/host/sessions/${ready.sessionId}/closing",
        )
        assertSafeProjection(batch.signals.flatMap { listOf(it.sourceKey, it.summaryCode, it.detailHref) })
        assertThat(provider.verify(admin, "CLOSING_RISK:${blocked.sessionId}"))
            .isEqualTo(AdminOperationSignalVerification.ACTIVE)
    }

    @Test
    fun `closing risk full size result never proves a missing session absent`() {
        val risks = (1..CLOSING_RISK_PAGE_LIMIT).map { closingRisk(index = it) }
        val provider = ClosingRiskOperationSignalProvider(FakeClosingRisksUseCase(closingSnapshot(risks)))

        val batch = provider.collect(admin)

        assertThat(batch.status).isEqualTo(AdminOperationSourceStatus.PARTIAL)
        assertThat(batch.authoritative).isFalse()
        assertThat(provider.verify(admin, "CLOSING_RISK:${UUID.randomUUID()}"))
            .isEqualTo(AdminOperationSignalVerification.UNAVAILABLE)
    }

    private fun assertSafeProjection(values: List<String>) {
        assertThat(values).allSatisfy { value ->
            assertThat(value)
                .doesNotContain(RAW_HOSTNAME)
                .doesNotContain(RAW_EMAIL)
                .doesNotContain(RAW_PROVIDER_ERROR)
                .doesNotContain(RAW_BOOK_TITLE)
                .doesNotContain(RAW_BLOCKER_CODE)
                .doesNotContain(RAW_TOKEN)
                .doesNotContain(RAW_DEPLOYMENT_ID)
        }
    }

    private fun club(
        index: Int,
        status: ClubStatus = ClubStatus.ACTIVE,
        publicVisibility: ClubPublicVisibility = ClubPublicVisibility.PRIVATE,
        tagline: String = "safe tagline",
        about: String = "safe about $RAW_HOSTNAME $RAW_EMAIL",
        domainActionRequiredCount: Int = 0,
        firstHostOnboardingState: FirstHostOnboardingState = FirstHostOnboardingState.ASSIGNED,
    ) = PlatformAdminClubListItem(
        clubId = indexedUuid(index),
        slug = "club-$index",
        name = "club $index",
        tagline = tagline,
        about = about,
        status = status,
        publicVisibility = publicVisibility,
        domainCount = domainActionRequiredCount,
        domainActionRequiredCount = domainActionRequiredCount,
        notificationFailureCount = 0,
        aiFailureCount = 0,
        firstHostOnboardingState = firstHostOnboardingState,
    )

    private fun notificationClub(
        index: Int,
        failed: Int = 0,
        dead: Int = 0,
    ) = NotificationClubHealth(
        clubId = indexedUuid(index),
        slug = "club-$index",
        name = "club $index $RAW_EMAIL",
        pending = 0,
        failed = failed,
        dead = dead,
        lastSuccessAt = observedAt.minusHours(1),
    )

    private fun notificationSnapshot(clubHealth: List<NotificationClubHealth>) =
        AdminNotificationOperationsSnapshot(
            generatedAt = observedAt,
            outboxSummary =
                AdminNotificationStatusSummary(
                    pending = 0,
                    active = 0,
                    failed = 1,
                    dead = 1,
                    sentOrPublishedLast24h = 4,
                ),
            deliverySummary =
                AdminNotificationStatusSummary(
                    pending = 0,
                    active = 0,
                    failed = 2,
                    dead = 1,
                    sentOrPublishedLast24h = 5,
                ),
            relaySummary =
                AdminNotificationRelaySummary(
                    publishing = 0,
                    sending = 0,
                    stalePublishing = 2,
                    staleSending = 2,
                ),
            failureClusters =
                listOf(
                    AdminNotificationFailureCluster(
                        safeErrorCode = RAW_PROVIDER_ERROR,
                        status = "FAILED",
                        count = 5,
                        latestAt = observedAt,
                    ),
                ),
            clubHealth = clubHealth,
            recentManualDispatches = emptyList(),
        )

    private fun aiJob(
        index: Int,
        status: JobStatus,
        staleCandidate: Boolean = false,
    ) = AiOpsJobListItem(
        jobId = indexedUuid(index),
        clubId = indexedUuid(index + 100),
        clubSlug = "club-$index",
        clubName = "club $index $RAW_EMAIL",
        sessionId = indexedUuid(index + 200),
        sessionNumber = index,
        bookTitle = RAW_BOOK_TITLE,
        status = status,
        stage = JobStage.GENERATING_RECORD,
        provider = Provider.OPENAI,
        model = "safe-model",
        errorCode = "SAFE_ERROR",
        safeErrorMessage = "$RAW_PROVIDER_ERROR $RAW_TOKEN",
        costEstimateUsd = BigDecimal("1.25"),
        createdAt = observedAt.minusHours(2).toInstant(),
        lastUpdatedAt = observedAt.minusHours(1).toInstant(),
        expiresAt = observedAt.plusHours(4).toInstant(),
        staleCandidate = staleCandidate,
        availableActions = setOf(AiOpsAction.FORCE_CANCEL),
    )

    private fun closingRisk(
        index: Int,
        overallState: String = "BLOCKED",
        occurrenceCount: Int = 1,
    ) = AdminTodayClosingRiskItem(
        clubId = indexedUuid(index + 300),
        clubSlug = "club-$index",
        clubName = "club $index $RAW_EMAIL",
        sessionId = indexedUuid(index),
        sessionNumber = index,
        bookTitle = RAW_BOOK_TITLE,
        meetingDate = LocalDate.parse("2026-08-03"),
        overallState = overallState,
        primaryBlocker = RAW_BLOCKER_CODE,
        hostClosingHref = "https://$RAW_HOSTNAME/private/$RAW_DEPLOYMENT_ID",
        firstDetectedAt = observedAt.minusDays(2),
        lastSeenAt = observedAt.minusHours(1),
        ageDays = 2,
        occurrenceCount = occurrenceCount,
        ledgerState = "ACTIVE",
    )

    private fun closingSnapshot(items: List<AdminTodayClosingRiskItem>) =
        AdminTodayClosingRiskSnapshot(generatedAt = observedAt, items = items)

    private fun indexedUuid(index: Int): UUID = UUID(0, index.toLong())

    private companion object {
        const val CLUB_PAGE_LIMIT = 100
        const val NOTIFICATION_PAGE_LIMIT = 25
        const val CLOSING_RISK_PAGE_LIMIT = 25
        const val RAW_HOSTNAME = "private-host.internal.example"
        const val RAW_EMAIL = "operator@example.test"
        const val RAW_PROVIDER_ERROR = "provider refused private request"
        const val RAW_BOOK_TITLE = "Private unreleased book title"
        const val RAW_BLOCKER_CODE = "FEEDBACK_DOCUMENT_INVALID"
        const val RAW_TOKEN = "secret-token-value"
        const val RAW_DEPLOYMENT_ID = "deployment-private-123"
    }
}

private class FakeListPlatformAdminClubsUseCase(
    private val items: List<PlatformAdminClubListItem> = emptyList(),
    private val error: Throwable? = null,
) : ListPlatformAdminClubsUseCase {
    override fun listClubs(admin: CurrentPlatformAdmin): PlatformAdminClubList {
        error?.let { throw it }
        return PlatformAdminClubList(items)
    }
}

private class FakeNotificationOperationsUseCase(
    private val value: AdminNotificationOperationsSnapshot,
) : ManageAdminNotificationOperationsUseCase {
    override fun snapshot(admin: CurrentPlatformAdmin): AdminNotificationOperationsSnapshot = value

    override fun listEvents(
        admin: CurrentPlatformAdmin,
        filter: AdminNotificationFilter,
        pageRequest: PageRequest,
    ): CursorPage<AdminNotificationOutboxEvent> = error("not used")

    override fun listDeliveries(
        admin: CurrentPlatformAdmin,
        filter: AdminNotificationFilter,
        pageRequest: PageRequest,
    ): CursorPage<AdminNotificationDelivery> = error("not used")

    override fun previewReplay(
        admin: CurrentPlatformAdmin,
        request: AdminNotificationReplayPreviewRequest,
    ): AdminNotificationReplayPreview = error("not used")

    override fun confirmReplay(
        admin: CurrentPlatformAdmin,
        command: AdminNotificationReplayConfirmCommand,
    ): AdminNotificationReplayConfirmResult = error("not used")
}

private class FakeListAiOpsJobsUseCase(
    private val value: AiOpsJobList = AiOpsJobList(emptyList(), null),
    private val error: Throwable? = null,
) : ListAiOpsJobsUseCase {
    override fun list(
        admin: CurrentPlatformAdmin,
        filters: AiOpsJobFilters,
    ): AiOpsJobList {
        error?.let { throw it }
        return value
    }
}

private class FakeGetAiOpsJobUseCase(
    private val values: Map<UUID, AiOpsJobListItem> = emptyMap(),
    private val error: Throwable? = null,
) : GetAiOpsJobUseCase {
    val requestedJobIds = mutableListOf<UUID>()

    override fun get(
        admin: CurrentPlatformAdmin,
        jobId: UUID,
    ): AiOpsJobListItem {
        requestedJobIds += jobId
        error?.let { throw it }
        return values[jobId] ?: throw AiGenerationException.JobNotFound(jobId)
    }
}

private class FakeClosingRisksUseCase(
    private val value: AdminTodayClosingRiskSnapshot,
) : ListAdminTodayClosingRisksUseCase {
    override fun todayClosingRisks(admin: CurrentPlatformAdmin): AdminTodayClosingRiskSnapshot = value
}
