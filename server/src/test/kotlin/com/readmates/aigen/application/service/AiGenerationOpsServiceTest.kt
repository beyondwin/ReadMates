package com.readmates.aigen.application.service

import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.AiOpsAction
import com.readmates.aigen.application.model.AiOpsCostWindow
import com.readmates.aigen.application.model.AiOpsDeltaDirection
import com.readmates.aigen.application.model.AiOpsFailureCodeCount
import com.readmates.aigen.application.model.AiOpsJobFilters
import com.readmates.aigen.application.model.AiOpsJobList
import com.readmates.aigen.application.model.AiOpsJobListItem
import com.readmates.aigen.application.model.AiOpsProviderCost
import com.readmates.aigen.application.model.AiOpsTrendAvailability
import com.readmates.aigen.application.model.AiOpsWindowUsage
import com.readmates.aigen.application.model.JobStage
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.port.out.AiGenerationAdminActionAuditEntry
import com.readmates.aigen.application.port.out.AiGenerationAdminActionAuditPort
import com.readmates.aigen.application.port.out.AiGenerationAuditQueryPort
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentPlatformAdmin
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

class AiGenerationOpsServiceTest {
    private val jobStore = FakeJobStore()
    private val auditQuery = EmptyAuditQueryPort()
    private val actionAudit = RecordingActionAudit()
    private val service =
        AiGenerationOpsService(
            auditQueryPort = auditQuery,
            adminActionAuditPort = actionAudit,
            jobStore = jobStore,
            clock = Clock.fixed(Instant.parse("2026-05-18T00:00:00Z"), ZoneOffset.UTC),
        )

    @Test
    fun `support admin can read summary but cannot force cancel`() {
        val job = AiGenerationTestFixtures.jobRecord(status = JobStatus.RUNNING, stage = JobStage.TRANSCRIPT_LOADED)
        jobStore.save(job)
        val support = admin(PlatformAdminRole.SUPPORT)

        assertThat(service.summary(support).activeJobCount).isEqualTo(1)
        assertThatThrownBy {
            service.forceCancel(support, job.jobId)
        }.isInstanceOf(AccessDeniedException::class.java)
    }

    @Test
    fun `operator can force cancel eligible live job`() {
        val job = AiGenerationTestFixtures.jobRecord(status = JobStatus.RUNNING, stage = JobStage.TRANSCRIPT_LOADED)
        jobStore.save(job)

        val result = service.forceCancel(admin(PlatformAdminRole.OPERATOR), job.jobId)

        assertThat(result.previousStatus).isEqualTo(JobStatus.RUNNING)
        assertThat(result.nextStatus).isEqualTo(JobStatus.CANCELLED)
        assertThat(jobStore.load(job.jobId)?.status).isEqualTo(JobStatus.CANCELLED)
        assertThat(jobStore.transientPayloadDeleted).containsExactly(job.jobId)
        assertThat(actionAudit.entries.single().action).isEqualTo("FORCE_CANCEL")
    }

    @Test
    fun `force cancel returns safe ops code when historical terminal job is no longer live`() {
        val jobId = UUID.randomUUID()
        auditQuery.jobById =
            AiOpsJobListItem(
                jobId = jobId,
                clubId = UUID.randomUUID(),
                clubSlug = null,
                clubName = null,
                sessionId = UUID.randomUUID(),
                sessionNumber = null,
                bookTitle = null,
                status = JobStatus.COMMITTED,
                stage = null,
                provider = AiGenerationTestFixtures.CLAUDE_MODEL.provider,
                model = AiGenerationTestFixtures.CLAUDE_MODEL.name,
                errorCode = null,
                safeErrorMessage = null,
                costEstimateUsd = BigDecimal.ZERO,
                createdAt = Instant.parse("2026-05-17T00:00:00Z"),
                lastUpdatedAt = Instant.parse("2026-05-17T00:00:00Z"),
                expiresAt = null,
                staleCandidate = false,
                availableActions = emptySet(),
            )

        assertThatThrownBy {
            service.forceCancel(admin(PlatformAdminRole.OWNER), jobId)
        }.isInstanceOfSatisfying(AiGenerationException.SafeOpsError::class.java) {
            assertThat(it.code).isEqualTo("JOB_NOT_LIVE")
        }
    }

    @Test
    fun `operator can retry-commit a stuck committing job back to succeeded`() {
        val job = AiGenerationTestFixtures.jobRecord(status = JobStatus.COMMITTING, stage = JobStage.READY)
        jobStore.save(job)

        val result = service.retryCommit(admin(PlatformAdminRole.OPERATOR), job.jobId)

        assertThat(result.previousStatus).isEqualTo(JobStatus.COMMITTING)
        assertThat(result.nextStatus).isEqualTo(JobStatus.SUCCEEDED)
        assertThat(jobStore.load(job.jobId)?.status).isEqualTo(JobStatus.SUCCEEDED)
        assertThat(jobStore.transientPayloadDeleted).doesNotContain(job.jobId)
        assertThat(actionAudit.entries.single().action).isEqualTo("RETRY_COMMIT")
        assertThat(actionAudit.entries.single().previousStatus).isEqualTo("COMMITTING")
        assertThat(actionAudit.entries.single().nextStatus).isEqualTo("SUCCEEDED")
    }

    @Test
    fun `support admin cannot retry-commit`() {
        val job = AiGenerationTestFixtures.jobRecord(status = JobStatus.COMMITTING, stage = JobStage.READY)
        jobStore.save(job)

        assertThatThrownBy {
            service.retryCommit(admin(PlatformAdminRole.SUPPORT), job.jobId)
        }.isInstanceOf(AccessDeniedException::class.java)
        assertThat(jobStore.load(job.jobId)?.status).isEqualTo(JobStatus.COMMITTING)
        assertThat(actionAudit.entries).isEmpty()
    }

    @Test
    fun `retry-commit rejects a job that is not committing`() {
        val job = AiGenerationTestFixtures.jobRecord(status = JobStatus.RUNNING, stage = JobStage.TRANSCRIPT_LOADED)
        jobStore.save(job)

        assertThatThrownBy {
            service.retryCommit(admin(PlatformAdminRole.OPERATOR), job.jobId)
        }.isInstanceOf(AiGenerationException.IllegalGenerationState::class.java)
        assertThat(actionAudit.entries).isEmpty()
    }

    @Test
    fun `committing job lists both force-cancel and retry-commit actions`() {
        val job = AiGenerationTestFixtures.jobRecord(status = JobStatus.COMMITTING, stage = JobStage.READY)
        jobStore.save(job)

        val item = service.list(admin(PlatformAdminRole.OWNER), AiOpsJobFilters(null, null, null, null)).items.single()

        assertThat(item.availableActions)
            .containsExactlyInAnyOrder(AiOpsAction.FORCE_CANCEL, AiOpsAction.RETRY_COMMIT)
    }

    @Test
    fun `running job lists only force-cancel`() {
        val job = AiGenerationTestFixtures.jobRecord(status = JobStatus.RUNNING, stage = JobStage.TRANSCRIPT_LOADED)
        jobStore.save(job)

        val item = service.list(admin(PlatformAdminRole.OWNER), AiOpsJobFilters(null, null, null, null)).items.single()

        assertThat(item.availableActions).containsExactly(AiOpsAction.FORCE_CANCEL)
    }

    @Test
    fun `summary derives 30d cost trend up when current exceeds prior`() {
        val now = Instant.parse("2026-05-18T00:00:00Z")
        auditQuery.usageByStart[now.minusSeconds(30 * 86400)] = AiOpsWindowUsage(BigDecimal("2.0000"), 5)
        auditQuery.usageByStart[now.minusSeconds(60 * 86400)] = AiOpsWindowUsage(BigDecimal("1.0000"), 4)

        val trend = service.summary(admin(PlatformAdminRole.OWNER)).costTrend

        assertThat(trend.window).isEqualTo(AiOpsCostWindow.LAST_30D)
        assertThat(trend.currentCostUsd).isEqualByComparingTo(BigDecimal("2.0000"))
        assertThat(trend.priorCostUsd).isEqualByComparingTo(BigDecimal("1.0000"))
        assertThat(trend.currentJobCount).isEqualTo(5L)
        assertThat(trend.deltaDirection).isEqualTo(AiOpsDeltaDirection.UP)
        assertThat(trend.availability).isEqualTo(AiOpsTrendAvailability.AVAILABLE)
    }

    @Test
    fun `summary reports NOT_ENOUGH_DATA when prior window had no jobs`() {
        val now = Instant.parse("2026-05-18T00:00:00Z")
        auditQuery.usageByStart[now.minusSeconds(7 * 86400)] = AiOpsWindowUsage(BigDecimal("0.5000"), 3)
        auditQuery.usageByStart[now.minusSeconds(14 * 86400)] = AiOpsWindowUsage(BigDecimal.ZERO, 0)

        val trend = service.summary(admin(PlatformAdminRole.OWNER), AiOpsCostWindow.LAST_7D).costTrend

        assertThat(trend.window).isEqualTo(AiOpsCostWindow.LAST_7D)
        assertThat(trend.availability).isEqualTo(AiOpsTrendAvailability.NOT_ENOUGH_DATA)
        assertThat(trend.deltaDirection).isEqualTo(AiOpsDeltaDirection.NONE)
    }

    private fun admin(role: PlatformAdminRole): CurrentPlatformAdmin =
        CurrentPlatformAdmin(
            userId = UUID.randomUUID(),
            email = "${role.name.lowercase()}@example.com",
            role = role,
        )
}

private class EmptyAuditQueryPort : AiGenerationAuditQueryPort {
    var jobById: AiOpsJobListItem? = null
    val usageByStart = mutableMapOf<Instant, AiOpsWindowUsage>()

    override fun countFailuresSince(since: Instant): Long = 0

    override fun costSince(since: Instant): BigDecimal = BigDecimal.ZERO

    override fun failureCodesSince(since: Instant): List<AiOpsFailureCodeCount> = emptyList()

    override fun providerCostsSince(since: Instant): List<AiOpsProviderCost> = emptyList()

    override fun windowUsageBetween(
        start: Instant,
        endExclusive: Instant,
    ): AiOpsWindowUsage = usageByStart[start] ?: AiOpsWindowUsage(BigDecimal.ZERO, 0)

    override fun listJobs(filters: AiOpsJobFilters): AiOpsJobList = AiOpsJobList(emptyList(), null)

    override fun findJobById(jobId: UUID): AiOpsJobListItem? = jobById
}

private class RecordingActionAudit : AiGenerationAdminActionAuditPort {
    val entries = mutableListOf<AiGenerationAdminActionAuditEntry>()

    override fun record(entry: AiGenerationAdminActionAuditEntry) {
        entries += entry
    }
}
