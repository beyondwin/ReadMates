package com.readmates.aigen.application.service

import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.JobStatus
import org.springframework.stereotype.Component
import java.util.UUID

@Component
class AiGenerationJobTransitionPolicy {
    fun requireWorkerStart(
        status: JobStatus,
        jobId: UUID,
    ) {
        requireStatus(jobId, status, "worker start", JobStatus.PENDING)
    }

    fun requireWorkerCompletion(
        status: JobStatus,
        jobId: UUID,
    ) {
        requireStatus(jobId, status, "worker completion", JobStatus.RUNNING)
    }

    fun requireRegenerate(
        status: JobStatus,
        jobId: UUID,
    ) {
        requireStatus(jobId, status, "regenerate", JobStatus.SUCCEEDED)
    }

    fun requireCommit(
        status: JobStatus,
        jobId: UUID,
    ) {
        requireStatus(jobId, status, "commit", JobStatus.SUCCEEDED)
    }

    fun requireCancel(
        status: JobStatus,
        jobId: UUID,
    ) {
        if (status !in CANCELLABLE_STATUSES) {
            throw illegalState(jobId, status, "cancel")
        }
    }

    private fun requireStatus(
        jobId: UUID,
        actual: JobStatus,
        attemptedAction: String,
        expected: JobStatus,
    ) {
        if (actual != expected) {
            throw illegalState(jobId, actual, attemptedAction)
        }
    }

    private fun illegalState(
        jobId: UUID,
        status: JobStatus,
        attemptedAction: String,
    ): AiGenerationException.IllegalGenerationState =
        AiGenerationException.IllegalGenerationState(
            jobId = jobId,
            currentStatus = status.name,
            attemptedAction = attemptedAction,
        )

    private companion object {
        val CANCELLABLE_STATUSES = setOf(JobStatus.PENDING, JobStatus.RUNNING, JobStatus.SUCCEEDED)
    }
}
