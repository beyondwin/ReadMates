package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.out.AuditStatus
import com.readmates.aigen.application.port.out.JobRecord
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.util.UUID

/**
 * Cross-provider failover behavior for [AiGenerationWorker]. Kept as a top-level
 * class (not @Nested) because the :unitTest filter excludes `*$*` test names.
 */
class AiGenerationWorkerFailoverTest {
    private val claudeModel = AiGenerationTestFixtures.CLAUDE_MODEL
    private val openaiModel = ModelId(Provider.OPENAI, "gpt-5.4-mini")
    private val enabled = setOf(claudeModel, openaiModel)

    private fun harness(fallbackChainOrder: List<String> = listOf(openaiModel.name)): FailoverHarness =
        FailoverHarness(enabled, fallbackChainOrder, claudeModel)

    @Test
    fun `availability failure fails over to next provider and accounts under actual model`() {
        val h = harness()
        h.claude.enqueueFailure(AiGenerationTestFixtures.providerError(ErrorCode.PROVIDER_UNAVAILABLE))
        h.openai.enqueueSuccess(AiGenerationTestFixtures.snapshotOutput())
        val record = h.savedRecord(model = claudeModel)

        h.worker.process(record.jobId)

        val saved = h.jobStore.records.getValue(record.jobId)
        assertThat(saved.status).isEqualTo(JobStatus.SUCCEEDED)
        assertThat(saved.actualModel).isEqualTo(openaiModel)
        val success = h.auditPort.entries.last { it.status == AuditStatus.SUCCESS }
        assertThat(success.provider).isEqualTo(Provider.OPENAI)
        assertThat(success.model).isEqualTo(openaiModel.name)
        assertThat(
            h.openai.calls
                .single()
                .model,
        ).isEqualTo(openaiModel)
    }

    @Test
    fun `failover target also failing yields FAILED with two failure audit rows`() {
        val h = harness()
        h.claude.enqueueFailure(AiGenerationTestFixtures.providerError(ErrorCode.PROVIDER_UNAVAILABLE))
        h.openai.enqueueFailure(AiGenerationTestFixtures.providerError(ErrorCode.PROVIDER_UNAVAILABLE))
        val record = h.savedRecord(model = claudeModel)

        h.worker.process(record.jobId)

        assertThat(
            h.jobStore.records
                .getValue(record.jobId)
                .status,
        ).isEqualTo(JobStatus.FAILED)
        assertThat(h.auditPort.entries.count { it.status == AuditStatus.FAILED }).isEqualTo(2)
    }

    @Test
    fun `empty chain keeps same-provider retry`() {
        val h = harness(fallbackChainOrder = emptyList())
        h.claude.enqueueFailure(AiGenerationTestFixtures.providerError(ErrorCode.PROVIDER_UNAVAILABLE))
        h.claude.enqueueSuccess(AiGenerationTestFixtures.snapshotOutput())
        val record = h.savedRecord(model = claudeModel)

        h.worker.process(record.jobId)

        val saved = h.jobStore.records.getValue(record.jobId)
        assertThat(saved.status).isEqualTo(JobStatus.SUCCEEDED)
        assertThat(saved.actualModel).isNull()
        assertThat(h.claude.calls).hasSize(2)
        assertThat(h.openai.calls).isEmpty()
    }

    @Test
    fun `content failure does not fail over even with chain configured`() {
        val h = harness()
        h.claude.enqueueFailure(AiGenerationTestFixtures.providerError(ErrorCode.SCHEMA_INVALID))
        h.claude.enqueueSuccess(AiGenerationTestFixtures.snapshotOutput())
        val record = h.savedRecord(model = claudeModel)

        h.worker.process(record.jobId)

        val saved = h.jobStore.records.getValue(record.jobId)
        assertThat(saved.status).isEqualTo(JobStatus.SUCCEEDED)
        assertThat(saved.actualModel).isNull()
        assertThat(h.openai.calls).isEmpty()
        assertThat(h.claude.calls[1].instructions).contains("Strict: SCHEMA_INVALID")
    }

    @Test
    fun `validation violation after failover retries on the failover provider`() {
        val h = harness()
        h.claude.enqueueFailure(AiGenerationTestFixtures.providerError(ErrorCode.PROVIDER_UNAVAILABLE))
        h.openai.enqueueSuccess(AiGenerationTestFixtures.snapshotOutput())
        h.openai.enqueueSuccess(AiGenerationTestFixtures.snapshotOutput())
        var first = true
        h.validator.resultProvider = { _, _ ->
            if (first) {
                first = false
                ValidationResult.Violation(ErrorCode.SCHEMA_INVALID, "bad")
            } else {
                ValidationResult.Ok
            }
        }
        val record = h.savedRecord(model = claudeModel)

        h.worker.process(record.jobId)

        assertThat(
            h.jobStore.records
                .getValue(record.jobId)
                .status,
        ).isEqualTo(JobStatus.SUCCEEDED)
        assertThat(h.openai.calls).hasSize(2)
        assertThat(h.openai.calls[1].model).isEqualTo(openaiModel)
    }

    @Test
    fun `call cap exhausted prevents failover call`() {
        val h = harness(fallbackChainOrder = listOf(openaiModel.name))
        h.properties = h.properties.copy(job = h.properties.job.copy(maxLlmCallsPerJob = 1))
        h.rebuildWorker()
        h.claude.enqueueFailure(AiGenerationTestFixtures.providerError(ErrorCode.PROVIDER_UNAVAILABLE))
        val record = h.savedRecord(model = claudeModel)

        h.worker.process(record.jobId)

        assertThat(
            h.jobStore.records
                .getValue(record.jobId)
                .status,
        ).isEqualTo(JobStatus.FAILED)
        assertThat(h.openai.calls).isEmpty()
    }
}

internal class FailoverHarness(
    enabled: Set<ModelId>,
    fallbackChainOrder: List<String>,
    @Suppress("unused") private val primaryModel: ModelId,
) {
    val sessionId: UUID = UUID.randomUUID()
    val clubId: UUID = UUID.randomUUID()
    val hostUserId: UUID = UUID.randomUUID()

    val jobStore = FakeJobStore()
    val claude = FakeContentGenerator(provider = Provider.CLAUDE)
    val openai = FakeContentGenerator(provider = Provider.OPENAI)
    val generators = mapOf(Provider.CLAUDE to claude, Provider.OPENAI to openai)
    val auditPort = FakeAuditPort()
    val costGuard = FakeCostGuard()
    val validator = FakeValidator()
    val latencyNotification = FakeLatencyNotification()
    val sleeper = FakeSleeper()
    val modelCatalog = AiGenerationTestFixtures.defaultModelCatalog(enabled = enabled)
    var properties =
        AiGenerationTestFixtures.defaultProperties().copy(fallbackChain = fallbackChainOrder)

    private fun newChain() = ProviderFallbackChain(generators, modelCatalog, properties)

    var worker = build()

    private fun build(): AiGenerationWorker =
        AiGenerationWorker(
            jobStore = jobStore,
            generators = generators,
            modelCatalog = modelCatalog,
            validator = validator,
            auditPort = auditPort,
            costGuard = costGuard,
            latencyNotification = latencyNotification,
            properties = properties,
            clock = FakeClock(AiGenerationTestFixtures.NOW),
            metrics = fakeMetrics(),
            sleeper = sleeper,
            fallbackChain = newChain(),
        )

    fun rebuildWorker() {
        worker = build()
    }

    fun savedRecord(model: ModelId): JobRecord {
        val record =
            AiGenerationTestFixtures.jobRecord(
                sessionId = sessionId,
                clubId = clubId,
                hostUserId = hostUserId,
                model = model,
            )
        jobStore.save(record)
        return record
    }
}
