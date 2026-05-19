package com.readmates.aigen.application.service

import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.AiOpsFailureCodeCount
import com.readmates.aigen.application.model.AiOpsJobFilters
import com.readmates.aigen.application.model.AiOpsJobList
import com.readmates.aigen.application.model.AiOpsJobListItem
import com.readmates.aigen.application.model.AiOpsProviderCost
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

    private fun admin(role: PlatformAdminRole): CurrentPlatformAdmin =
        CurrentPlatformAdmin(
            userId = UUID.randomUUID(),
            email = "${role.name.lowercase()}@example.com",
            role = role,
        )
}

private class EmptyAuditQueryPort : AiGenerationAuditQueryPort {
    var jobById: AiOpsJobListItem? = null

    override fun countFailuresSince(since: Instant): Long = 0

    override fun costSince(since: Instant): BigDecimal = BigDecimal.ZERO

    override fun failureCodesSince(since: Instant): List<AiOpsFailureCodeCount> = emptyList()

    override fun providerCostsSince(since: Instant): List<AiOpsProviderCost> = emptyList()

    override fun listJobs(filters: AiOpsJobFilters): AiOpsJobList = AiOpsJobList(emptyList(), null)

    override fun findJobById(jobId: UUID): AiOpsJobListItem? = jobById
}

private class RecordingActionAudit : AiGenerationAdminActionAuditPort {
    val entries = mutableListOf<AiGenerationAdminActionAuditEntry>()

    override fun record(entry: AiGenerationAdminActionAuditEntry) {
        entries += entry
    }
}
