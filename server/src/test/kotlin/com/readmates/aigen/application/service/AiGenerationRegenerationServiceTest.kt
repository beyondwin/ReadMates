package com.readmates.aigen.application.service

import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.port.`in`.JobSessionMismatchException
import com.readmates.aigen.application.port.`in`.RegenerationResult
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.util.UUID

class AiGenerationRegenerationServiceTest {
    @Test
    fun `delegates successful job to grounded regeneration executor`() {
        val store = FakeJobStore()
        val record = AiGenerationTestFixtures.jobRecord().copy(status = JobStatus.SUCCEEDED, revision = 3)
        store.save(record)
        var delegated = false
        val expected =
            RegenerationResult(
                GenerationItem.SUMMARY,
                "updated",
                TokenUsage.ZERO,
                BigDecimal.ZERO,
                emptyList(),
            )
        val service =
            service(store) { actual, item, revision, model, instructions ->
                delegated = true
                assertThat(actual).isEqualTo(record)
                assertThat(item).isEqualTo(GenerationItem.SUMMARY)
                assertThat(revision).isEqualTo(3)
                assertThat(model).isEqualTo("gpt-5.4-mini")
                assertThat(instructions).isEqualTo("shorter")
                expected
            }

        val result =
            service.regenerate(
                record.sessionId,
                record.jobId,
                GenerationItem.SUMMARY,
                "gpt-5.4-mini",
                "shorter",
                3,
            )

        assertThat(delegated).isTrue()
        assertThat(result).isEqualTo(expected)
    }

    @Test
    fun `requires revision before grounded delegation`() {
        val store = FakeJobStore()
        val record = AiGenerationTestFixtures.jobRecord().copy(status = JobStatus.SUCCEEDED)
        store.save(record)
        val service = service(store) { _, _, _, _, _ -> error("must not delegate") }

        assertThatThrownBy {
            service.regenerate(record.sessionId, record.jobId, GenerationItem.SUMMARY, null, null, null)
        }.isInstanceOf(AiGenerationException.Coded::class.java)
    }

    @Test
    fun `rejects cross-session access before grounded delegation`() {
        val store = FakeJobStore()
        val record = AiGenerationTestFixtures.jobRecord().copy(status = JobStatus.SUCCEEDED)
        store.save(record)
        val service = service(store) { _, _, _, _, _ -> error("must not delegate") }

        assertThatThrownBy {
            service.regenerate(UUID.randomUUID(), record.jobId, GenerationItem.SUMMARY, null, null, 0)
        }.isInstanceOf(JobSessionMismatchException::class.java)
    }

    private fun service(
        store: FakeJobStore,
        executor: GroundedRegenerationExecutor,
    ) = AiGenerationRegenerationService(store, AiGenerationJobTransitionPolicy(), executor)
}
