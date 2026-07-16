package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.JobStage
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.port.out.JobRecord
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.util.UUID

class AiGenerationWorkerTest {
    @Test
    fun `missing job is ignored`() {
        val context = TestContext()

        context.worker.process(UUID.randomUUID())

        assertThat(context.processed).isEmpty()
    }

    @Test
    fun `pending job transitions to running and invokes grounded executor`() {
        val context = TestContext()
        val record = context.savedRecord()

        context.worker.process(record.jobId)

        val running = context.processed.single()
        assertThat(running.status).isEqualTo(JobStatus.RUNNING)
        assertThat(running.stage).isEqualTo(JobStage.PREPARING_TRANSCRIPT)
        assertThat(running.progressPct).isEqualTo(5)
        assertThat(context.costGuard.released)
            .containsExactly(Triple(record.hostUserId, record.clubId, record.jobId))
    }

    @Test
    fun `crashed provider execution retains admission for redelivery recovery`() {
        val context = TestContext()
        val record = context.savedRecord()
        context.executorFailure = IllegalStateException("synthetic provider crash")

        assertThatThrownBy { context.worker.process(record.jobId) }
            .isSameAs(context.executorFailure)
        assertThat(context.costGuard.released).isEmpty()
    }

    @Test
    fun `terminal job never invokes grounded executor`() {
        val context = TestContext()
        val record = context.savedRecord().copy(status = JobStatus.CANCELLED, stage = null)
        context.jobStore.save(record)

        context.worker.process(record.jobId)

        assertThat(context.processed).isEmpty()
    }

    @Test
    fun `running redelivery recovers stale attempt before grounded executor`() {
        val context = TestContext()
        val record = context.savedRecord().copy(status = JobStatus.RUNNING, stage = JobStage.GENERATING_RECORD)
        context.jobStore.save(record)

        context.worker.process(record.jobId)

        assertThat(context.reservations.markCalls).isEqualTo(1)
        assertThat(context.processed).containsExactly(record)
    }

    @Test
    fun `running redelivery defers while physical request can still be live`() {
        val context = TestContext()
        val record = context.savedRecord().copy(status = JobStatus.RUNNING, stage = JobStage.GENERATING_RECORD)
        context.jobStore.save(record)
        context.reservations.activeInFlight = true

        assertThatThrownBy { context.worker.process(record.jobId) }
            .isInstanceOf(ProviderCallStillInFlightException::class.java)
        assertThat(context.processed).isEmpty()
    }

    private class TestContext {
        val jobStore = FakeJobStore()
        val reservations = FakeProviderCallReservations(jobStore)
        val costGuard = FakeCostGuard()
        val processed = mutableListOf<JobRecord>()
        var executorFailure: RuntimeException? = null
        val clock = FakeClock(AiGenerationTestFixtures.NOW)
        val properties = AiGenerationTestFixtures.defaultProperties()
        val worker =
            AiGenerationWorker(
                jobStore = jobStore,
                groundedExecutor =
                    GroundedGenerationExecutor { record, _ ->
                        executorFailure?.let { throw it }
                        processed += record
                    },
                providerCallReservations = reservations,
                costGuard = costGuard,
                properties = properties,
                clock = clock,
            )

        fun savedRecord(): JobRecord = AiGenerationTestFixtures.jobRecord().also(jobStore::save)
    }
}
