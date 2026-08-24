package com.readmates.aigen.application.service

import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.AiOpsAction
import com.readmates.aigen.application.model.ConfirmAiOpsAdminCommand
import com.readmates.aigen.application.model.JobStage
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.port.out.AiGenerationAdminCommandConvergenceAcquisition
import com.readmates.aigen.application.port.out.AiGenerationAdminCommandConvergenceLease
import com.readmates.aigen.application.port.out.AiGenerationAdminCommandConvergenceOutcome
import com.readmates.aigen.application.port.out.AiGenerationAdminCommandPort
import com.readmates.aigen.application.port.out.AiGenerationAdminCommandReceiptRecord
import com.readmates.aigen.application.port.out.LoadAiGenerationAdminCommandPreviewResult
import com.readmates.aigen.application.port.out.StoreAiGenerationAdminCommandOrigin
import com.readmates.aigen.application.port.out.StoreAiGenerationAdminCommandOriginResult
import com.readmates.aigen.application.port.out.StoredAiGenerationAdminCommandPreview
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.adminmutation.application.model.AdminCommandClaimResult
import com.readmates.shared.adminmutation.application.model.AdminCommandDigest
import com.readmates.shared.adminmutation.application.service.AdminCommandIdempotencyService
import com.readmates.shared.adminmutation.application.service.AdminCommandIdentityService
import com.readmates.shared.adminmutation.config.AdminCommandIdempotencyProperties
import com.readmates.shared.adminmutation.config.AdminCommandIdentityProperties
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentPlatformAdmin
import com.readmates.shared.security.PlatformCapability
import com.readmates.shared.security.toPlatformActor
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers
import org.mockito.Mockito.mock
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID
import org.mockito.Mockito.`when` as whenever

class AiGenerationAdminSafeCommandServiceTest {
    private val jobStore = FakeJobStore()
    private val commandPort = FakeAiGenerationAdminCommandPort()
    private val idempotency = mock(AdminCommandIdempotencyService::class.java)
    private val identityService =
        AdminCommandIdentityService(
            AdminCommandIdentityProperties(
                currentKey = "test-ai-admin-command-digest-key",
                currentKeyVersion = 7,
                previousKeyVersion = 6,
            ),
        )
    private val properties = AdminCommandIdempotencyProperties()
    private val clock = Clock.fixed(NOW, ZoneOffset.UTC)
    private val service =
        AiGenerationOpsService(
            auditQueryPort = mock(),
            adminActionAuditPort = mock(),
            jobStore = jobStore,
            clock = clock,
            commitRecoveryService = null,
            commandPort = commandPort,
            identityService = identityService,
            idempotencyService = idempotency,
            idempotencyProperties = properties,
        )

    @Test
    fun `operator preview captures revision and safe effect without mutating the job`() {
        val job = liveJob(JobStatus.RUNNING, revision = 7)
        jobStore.save(job)

        val preview =
            service.previewAdminCommand(
                admin(PlatformAdminRole.OPERATOR).toPlatformActor(),
                job.jobId,
                AiOpsAction.FORCE_CANCEL,
            )

        assertThat(preview.jobId).isEqualTo(job.jobId)
        assertThat(preview.jobStatus).isEqualTo(JobStatus.RUNNING)
        assertThat(preview.jobRevision).isEqualTo(7)
        assertThat(preview.effectType).isEqualTo("AI_JOB_CANCEL")
        assertThat(preview.impactCodes).containsExactly("CANCEL_JOB", "DELETE_TRANSIENT_PAYLOAD")
        assertThat(preview.fingerprintPrefix).hasSize(8)
        assertThat(jobStore.load(job.jobId)?.status).isEqualTo(JobStatus.RUNNING)
        assertThat(jobStore.transientPayloadDeleted).isEmpty()
        assertThat(commandPort.previews.single().actorCapabilities)
            .contains(PlatformCapability.MANAGE_AI_OPERATIONS.name)
        assertThat(commandPort.previews.single().sanitizedImpact)
            .doesNotContainKeys("prompt", "transcript", "providerPayload", "rawError")
    }

    @Test
    fun `confirm commits only origin receipt audit and pending convergence before redis effect`() {
        val actor = admin(PlatformAdminRole.OWNER).toPlatformActor()
        val job = liveJob(JobStatus.SUCCEEDED, revision = 7)
        jobStore.save(job)
        val preview = service.previewAdminCommand(actor, job.jobId, AiOpsAction.FORCE_CANCEL)
        claimed()

        val receipt =
            service.confirmAdminCommand(
                actor,
                job.jobId,
                AiOpsAction.FORCE_CANCEL,
                ConfirmAiOpsAdminCommand(preview.previewId, "safe-command-key", 7, confirmed = true),
            )

        assertThat(receipt.originStatus).isEqualTo("ACCEPTED")
        assertThat(receipt.effectStatus).isEqualTo("PENDING")
        assertThat(receipt.beforeJobStatus).isEqualTo(JobStatus.SUCCEEDED)
        assertThat(receipt.afterJobStatus).isEqualTo(JobStatus.SUCCEEDED)
        assertThat(receipt.beforeJobRevision).isEqualTo(7)
        assertThat(receipt.afterJobRevision).isEqualTo(7)
        assertThat(jobStore.load(job.jobId)?.status).isEqualTo(JobStatus.SUCCEEDED)
        assertThat(jobStore.transientPayloadDeleted).isEmpty()
        assertThat(commandPort.origins).hasSize(1)
        assertThat(commandPort.origins.single().safeResult).containsOnlyKeys("resultCode", "effectStatus")
    }

    @Test
    fun `completed replay precedes expired consumed preview and returns the same receipt`() {
        val actor = admin(PlatformAdminRole.OPERATOR).toPlatformActor()
        val job = liveJob(JobStatus.COMMIT_RETRY, revision = 4)
        jobStore.save(job)
        val preview = service.previewAdminCommand(actor, job.jobId, AiOpsAction.RETRY_COMMIT)
        val claim = claim()
        whenever(idempotency.claim(mockAny(), mockAny()))
            .thenReturn(claim)
            .thenReturn(AdminCommandClaimResult.Completed(RECEIPT_TYPE, RECEIPT_ID.toString()))
        whenever(idempotency.complete(claim.claimId, claim.claimToken, RECEIPT_TYPE, RECEIPT_ID.toString()))
            .thenReturn(true)
        val command = ConfirmAiOpsAdminCommand(preview.previewId, "response-loss-key", 4, confirmed = true)

        val first = service.confirmAdminCommand(actor, job.jobId, AiOpsAction.RETRY_COMMIT, command)
        commandPort.expireAndConsume(preview.previewId)
        val replay = service.confirmAdminCommand(actor, job.jobId, AiOpsAction.RETRY_COMMIT, command)

        assertThat(replay.receiptId).isEqualTo(first.receiptId)
        assertThat(commandPort.origins).hasSize(1)
    }

    @Test
    fun `support and stale revision fail closed before an origin is stored`() {
        val job = liveJob(JobStatus.RUNNING, revision = 5)
        jobStore.save(job)
        val support = admin(PlatformAdminRole.SUPPORT).toPlatformActor()

        assertThatThrownBy {
            service.previewAdminCommand(support, job.jobId, AiOpsAction.FORCE_CANCEL)
        }.isInstanceOf(AccessDeniedException::class.java)

        val operator = admin(PlatformAdminRole.OPERATOR).toPlatformActor()
        val preview = service.previewAdminCommand(operator, job.jobId, AiOpsAction.FORCE_CANCEL)
        claimed()
        assertThatThrownBy {
            service.confirmAdminCommand(
                operator,
                job.jobId,
                AiOpsAction.FORCE_CANCEL,
                ConfirmAiOpsAdminCommand(preview.previewId, "stale-revision-key", 6, confirmed = true),
            )
        }.isInstanceOfSatisfying(AiGenerationException.SafeOpsError::class.java) {
            assertThat(it.code).isEqualTo("PREVIEW_MISMATCH")
        }
        assertThat(commandPort.origins).isEmpty()
    }

    private fun claimed() {
        val claim = claim()
        whenever(idempotency.claim(mockAny(), mockAny())).thenReturn(claim)
        whenever(idempotency.complete(claim.claimId, claim.claimToken, RECEIPT_TYPE, RECEIPT_ID.toString()))
            .thenReturn(true)
    }

    private fun claim() =
        AdminCommandClaimResult.Claimed(
            claimId = UUID.fromString("aaaaaaaa-0000-4000-8000-000000000001"),
            claimToken = UUID.fromString("aaaaaaaa-0000-4000-8000-000000000002"),
            currentDigest =
                AdminCommandDigest(
                    schemaVersion = "readmates:ai-admin-command:v1",
                    digestKeyVersion = 7,
                    idempotencyKeyHmac = ByteArray(32) { 1 },
                    requestHmac = ByteArray(32) { 2 },
                ),
        )

    private fun liveJob(
        status: JobStatus,
        revision: Long,
    ) = AiGenerationTestFixtures
        .jobRecord(status = status, stage = JobStage.READY)
        .copy(revision = revision)

    private fun admin(role: PlatformAdminRole) =
        CurrentPlatformAdmin(
            userId = UUID.fromString("aaaaaaaa-0000-4000-8000-000000000010"),
            email = "admin@example.test",
            role = role,
        )

    private companion object {
        val NOW: Instant = Instant.parse("2026-08-24T02:00:00Z")
        val RECEIPT_ID: UUID = UUID.fromString("aaaaaaaa-0000-4000-8000-000000000003")
        const val RECEIPT_TYPE = "ai_generation_admin_command_receipt"
    }
}

@Suppress("UNCHECKED_CAST")
private fun <T> mockAny(): T = ArgumentMatchers.any<T>() ?: null as T

private class FakeAiGenerationAdminCommandPort : AiGenerationAdminCommandPort {
    val previews = mutableListOf<StoredAiGenerationAdminCommandPreview>()
    val origins = mutableListOf<StoreAiGenerationAdminCommandOrigin>()
    private val receipts = mutableMapOf<UUID, AiGenerationAdminCommandReceiptRecord>()

    override fun savePreview(preview: StoredAiGenerationAdminCommandPreview) {
        previews += preview
    }

    override fun loadPreview(previewId: UUID): LoadAiGenerationAdminCommandPreviewResult =
        previews
            .firstOrNull { it.previewId == previewId }
            ?.let(LoadAiGenerationAdminCommandPreviewResult::Loaded)
            ?: LoadAiGenerationAdminCommandPreviewResult.Missing

    override fun storeOrigin(command: StoreAiGenerationAdminCommandOrigin): StoreAiGenerationAdminCommandOriginResult {
        val stored = previews.single { it.previewId == command.preview.previewId }
        if (stored.consumedAt != null) return StoreAiGenerationAdminCommandOriginResult.PreviewConsumed
        origins += command
        val receipt =
            AiGenerationAdminCommandReceiptRecord(
                receiptId = RECEIPT_ID,
                previewId = command.preview.previewId,
                action = command.preview.action,
                actorAdminId = command.actorAdminId,
                jobId = command.preview.jobId,
                clubId = command.preview.clubId,
                beforeJobStatus = command.beforeJobStatus,
                beforeJobRevision = command.beforeJobRevision,
                afterJobStatus = command.afterJobStatus,
                afterJobRevision = command.afterJobRevision,
                originStatus = "ACCEPTED",
                safeResult = command.safeResult,
                convergenceId = command.convergenceId,
                effectStatus = "PENDING",
                safeErrorCode = null,
            )
        receipts[receipt.receiptId] = receipt
        val index = previews.indexOf(stored)
        previews[index] = stored.copy(consumedAt = command.occurredAt, consumedReceiptId = receipt.receiptId)
        return StoreAiGenerationAdminCommandOriginResult.Stored(receipt)
    }

    override fun loadReceipt(
        receiptId: UUID,
        actorAdminId: UUID,
        jobId: UUID,
        action: AiOpsAction,
    ): AiGenerationAdminCommandReceiptRecord? =
        receipts[receiptId]?.takeIf {
            it.actorAdminId == actorAdminId && it.jobId == jobId && it.action == action
        }

    override fun loadAvailableConvergenceIds(
        now: Instant,
        limit: Int,
    ): List<UUID> = emptyList()

    override fun tryAcquireConvergence(
        convergenceId: UUID,
        leaseOwner: String,
        now: Instant,
        leaseExpiresAt: Instant,
    ): AiGenerationAdminCommandConvergenceAcquisition = AiGenerationAdminCommandConvergenceAcquisition.Unavailable

    override fun finishConvergence(
        lease: AiGenerationAdminCommandConvergenceLease,
        leaseOwner: String,
        outcome: AiGenerationAdminCommandConvergenceOutcome,
        completedAt: Instant,
    ): Boolean = false

    fun expireAndConsume(previewId: UUID) {
        val index = previews.indexOfFirst { it.previewId == previewId }
        val preview = previews[index]
        previews[index] =
            preview.copy(
                expiresAt = NOW.minusSeconds(1),
                consumedAt = NOW,
                consumedReceiptId = RECEIPT_ID,
            )
    }

    private companion object {
        val NOW: Instant = Instant.parse("2026-08-24T02:00:00Z")
        val RECEIPT_ID: UUID = UUID.fromString("aaaaaaaa-0000-4000-8000-000000000003")
    }
}
