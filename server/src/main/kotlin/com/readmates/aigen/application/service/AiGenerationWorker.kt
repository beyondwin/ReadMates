package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.JobStage
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.port.out.AiGenerationJobStore
import com.readmates.aigen.application.port.out.GenerationCostGuard
import com.readmates.aigen.application.port.out.JobRecord
import com.readmates.aigen.application.port.out.ProviderCallReservationPort
import com.readmates.aigen.config.AiGenerationProperties
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Service
import java.time.Clock
import java.time.Instant
import java.util.UUID

private const val PROVIDER_REQUEST_STILL_IN_FLIGHT = "Provider request is still within its active timeout window"

class ProviderCallStillInFlightException : RuntimeException(PROVIDER_REQUEST_STILL_IN_FLIGHT)

/** Grounded-only Kafka worker. All physical-call policy lives in the grounded executor/coordinator. */
@Service
@ConditionalOnProperty(prefix = "readmates", name = ["aigen.enabled"], havingValue = "true")
class AiGenerationWorker(
    private val jobStore: AiGenerationJobStore,
    private val groundedExecutor: GroundedGenerationExecutor,
    private val providerCallReservations: ProviderCallReservationPort,
    private val costGuard: GenerationCostGuard,
    private val properties: AiGenerationProperties,
    private val clock: Clock,
) {
    fun process(jobId: UUID) {
        val record = jobStore.load(jobId) ?: return
        val start = clock.instant()
        when (record.status) {
            JobStatus.RUNNING -> processRedelivery(record, start)
            JobStatus.PENDING -> processPending(record, start)
            else -> Unit
        }
    }

    private fun processRedelivery(
        record: JobRecord,
        start: Instant,
    ) {
        val recoveryNow = clock.instant()
        val recovery =
            providerCallReservations.recoverStaleInFlightUnknown(
                record.jobId,
                recoveryNow.minus(properties.providerCalls.requestTimeout),
                recoveryNow,
            )
        if (recovery.activeInFlight) throw ProviderCallStillInFlightException()
        processAndReleaseAdmission(record, start)
    }

    private fun processPending(
        record: JobRecord,
        start: Instant,
    ) {
        val transitioned =
            jobStore.transitionStatus(
                jobId = record.jobId,
                expected = setOf(JobStatus.PENDING),
                next = JobStatus.RUNNING,
                stage = JobStage.PREPARING_TRANSCRIPT,
                progressPct = PROGRESS_PROVIDER_RUNNING_PCT,
                error = null,
            )
        if (transitioned) {
            processAndReleaseAdmission(
                record =
                    record.copy(
                        status = JobStatus.RUNNING,
                        stage = JobStage.PREPARING_TRANSCRIPT,
                        progressPct = PROGRESS_PROVIDER_RUNNING_PCT,
                    ),
                start = start,
            )
        }
    }

    private fun processAndReleaseAdmission(
        record: JobRecord,
        start: Instant,
    ) {
        groundedExecutor.process(record, start)
        costGuard.releaseAdmission(record.hostUserId, record.clubId, record.jobId)
    }

    private companion object {
        const val PROGRESS_PROVIDER_RUNNING_PCT = 5
    }
}
