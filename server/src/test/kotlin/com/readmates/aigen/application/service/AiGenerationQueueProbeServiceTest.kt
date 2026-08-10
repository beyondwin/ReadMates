package com.readmates.aigen.application.service

import com.readmates.aigen.application.port.`in`.AiGenerationQueueProbeSnapshot
import com.readmates.aigen.application.port.out.ActiveAiGenerationJobProbe
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneId

class AiGenerationQueueProbeServiceTest {
    private val firstSample = Instant.parse("2026-08-10T10:00:00Z")
    private val clock = MutableCountingClock(firstSample)
    private val probe = FakeActiveAiGenerationJobProbe()
    private val service = AiGenerationQueueProbeService(probe, clock)

    @Test
    fun `before first sample the immutable snapshot is unavailable without a false zero`() {
        val snapshot = service.readSnapshot()

        assertThat(snapshot.sampledAt).isNull()
        assertThat(snapshot.depth).isNaN()
        assertThat(snapshot.available).isFalse()
        assertThat(snapshot.lastSuccessAt).isNull()
        assertThat(probe.calls).isZero()
        assertThat(clock.reads).isZero()
    }

    @Test
    fun `one sample reads one clock instant and performs exactly one outbound probe`() {
        probe.results += ActiveAiGenerationJobProbe.Available(17)

        service.sample()

        assertThat(service.readSnapshot()).isEqualTo(
            AiGenerationQueueProbeSnapshot(
                sampledAt = firstSample,
                depth = 17.0,
                available = true,
                lastSuccessAt = firstSample,
            ),
        )
        assertThat(probe.calls).isEqualTo(1)
        assertThat(probe.observedAt).containsExactly(firstSample)
        assertThat(clock.reads).isEqualTo(1)
    }

    @Test
    fun `failed later sample keeps last success and advances only sampled time`() {
        probe.results += ActiveAiGenerationJobProbe.Available(3)
        service.sample()
        val failedAt = firstSample.plusSeconds(30)
        clock.current = failedAt
        probe.results +=
            ActiveAiGenerationJobProbe.Unavailable(
                ActiveAiGenerationJobProbe.UnavailableReason.QUARANTINED,
            )

        service.sample()

        assertThat(service.readSnapshot()).isEqualTo(
            AiGenerationQueueProbeSnapshot(
                sampledAt = failedAt,
                depth = Double.NaN,
                available = false,
                lastSuccessAt = firstSample,
            ),
        )
        assertThat(probe.calls).isEqualTo(2)
        assertThat(clock.reads).isEqualTo(2)
    }

    @Test
    fun `outbound failure is converted to an unavailable sample without losing prior success`() {
        probe.results += ActiveAiGenerationJobProbe.Available(1)
        service.sample()
        clock.current = firstSample.plus(Duration.ofSeconds(30))
        probe.failure = IllegalStateException("redis endpoint detail")

        service.sample()

        val snapshot = service.readSnapshot()
        assertThat(snapshot.available).isFalse()
        assertThat(snapshot.depth).isNaN()
        assertThat(snapshot.lastSuccessAt).isEqualTo(firstSample)
        assertThat(snapshot.sampledAt).isEqualTo(firstSample.plusSeconds(30))
    }
}

private class FakeActiveAiGenerationJobProbe : ActiveAiGenerationJobProbe {
    val results = ArrayDeque<ActiveAiGenerationJobProbe.Result>()
    val observedAt = mutableListOf<Instant>()
    var calls = 0
    var failure: RuntimeException? = null

    override fun probe(now: Instant): ActiveAiGenerationJobProbe.Result {
        calls += 1
        observedAt += now
        failure?.let { throw it }
        return results.removeFirst()
    }
}

private class MutableCountingClock(
    var current: Instant,
) : Clock() {
    var reads = 0

    override fun getZone(): ZoneId = ZoneId.of("UTC")

    override fun withZone(zone: ZoneId): Clock = this

    override fun instant(): Instant {
        reads += 1
        return current
    }
}
