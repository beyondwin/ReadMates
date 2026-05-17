package com.readmates.aigen.application.service

import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.JobStatus
import org.assertj.core.api.Assertions.assertThatCode
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.util.UUID

class AiGenerationJobTransitionPolicyTest {
    private val policy = AiGenerationJobTransitionPolicy()
    private val jobId = UUID.fromString("00000000-0000-0000-0000-000000000001")

    @Test
    fun `worker may only start from PENDING`() {
        assertAllowed { policy.requireWorkerStart(JobStatus.PENDING, jobId) }

        listOf(
            JobStatus.RUNNING,
            JobStatus.SUCCEEDED,
            JobStatus.FAILED,
            JobStatus.CANCELLED,
            JobStatus.COMMITTING,
            JobStatus.COMMITTED,
        ).forEach { status ->
            assertRejected(status, "worker start") {
                policy.requireWorkerStart(status, jobId)
            }
        }
    }

    @Test
    fun `worker completion may only persist from RUNNING`() {
        assertAllowed { policy.requireWorkerCompletion(JobStatus.RUNNING, jobId) }

        listOf(
            JobStatus.PENDING,
            JobStatus.SUCCEEDED,
            JobStatus.FAILED,
            JobStatus.CANCELLED,
            JobStatus.COMMITTING,
            JobStatus.COMMITTED,
        ).forEach { status ->
            assertRejected(status, "worker completion") {
                policy.requireWorkerCompletion(status, jobId)
            }
        }
    }

    @Test
    fun `regenerate and commit may only start from SUCCEEDED`() {
        assertAllowed { policy.requireRegenerate(JobStatus.SUCCEEDED, jobId) }
        assertAllowed { policy.requireCommit(JobStatus.SUCCEEDED, jobId) }

        listOf(
            JobStatus.PENDING,
            JobStatus.RUNNING,
            JobStatus.FAILED,
            JobStatus.CANCELLED,
            JobStatus.COMMITTING,
            JobStatus.COMMITTED,
        ).forEach { status ->
            assertRejected(status, "regenerate") {
                policy.requireRegenerate(status, jobId)
            }
            assertRejected(status, "commit") {
                policy.requireCommit(status, jobId)
            }
        }
    }

    @Test
    fun `cancel is allowed before terminal and before commit starts`() {
        listOf(JobStatus.PENDING, JobStatus.RUNNING, JobStatus.SUCCEEDED).forEach { status ->
            assertAllowed { policy.requireCancel(status, jobId) }
        }

        listOf(
            JobStatus.FAILED,
            JobStatus.CANCELLED,
            JobStatus.COMMITTING,
            JobStatus.COMMITTED,
        ).forEach { status ->
            assertRejected(status, "cancel") {
                policy.requireCancel(status, jobId)
            }
        }
    }

    private fun assertAllowed(block: () -> Unit) {
        assertThatCode(block).doesNotThrowAnyException()
    }

    private fun assertRejected(
        status: JobStatus,
        action: String,
        block: () -> Unit,
    ) {
        assertThatThrownBy(block)
            .isInstanceOfSatisfying(AiGenerationException.IllegalGenerationState::class.java) { error ->
                org.assertj.core.api.Assertions
                    .assertThat(error.currentStatus)
                    .isEqualTo(status.name)
                org.assertj.core.api.Assertions
                    .assertThat(error.attemptedAction)
                    .isEqualTo(action)
            }
    }
}
