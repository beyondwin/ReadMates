package com.readmates.admin.operations.adapter.out.observability

import com.readmates.admin.operations.application.model.AdminOperationAction
import com.readmates.admin.operations.application.model.AdminOperationSeverity
import com.readmates.admin.operations.application.model.AdminOperationSourceStatus
import com.readmates.admin.operations.application.model.AdminOperationSourceType
import com.readmates.admin.operations.application.port.out.AdminOperationLifecycleResult
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Duration

class MicrometerAdminOperationMetricsAdapterTest {
    @Test
    fun `metrics contain only source status action result severity labels`() {
        val registry = SimpleMeterRegistry()
        val adapter = MicrometerAdminOperationMetricsAdapter(registry)

        adapter.recordReconciliation(
            source = AdminOperationSourceType.CLUB_READINESS,
            status = AdminOperationSourceStatus.PARTIAL,
        )
        adapter.recordLifecycle(
            action = AdminOperationAction.RESOLVE,
            result = AdminOperationLifecycleResult.SOURCE_UNAVAILABLE,
        )
        adapter.recordCaseAge(
            source = AdminOperationSourceType.AI_JOB,
            severity = AdminOperationSeverity.CRITICAL,
            seconds = 3_600,
        )

        assertThat(
            registry
                .get("readmates.admin.operations.reconciliation")
                .tags("source", "CLUB_READINESS", "status", "PARTIAL")
                .counter()
                .count(),
        ).isEqualTo(1.0)
        assertThat(
            registry
                .get("readmates.admin.operations.lifecycle")
                .tags("action", "RESOLVE", "result", "SOURCE_UNAVAILABLE")
                .counter()
                .count(),
        ).isEqualTo(1.0)
        val caseAge =
            registry
                .get("readmates.admin.operations.case.age")
                .tags("source", "AI_JOB", "severity", "CRITICAL")
                .timer()
        assertThat(caseAge.count()).isEqualTo(1)
        assertThat(caseAge.totalTime(java.util.concurrent.TimeUnit.SECONDS)).isEqualTo(3_600.0)

        assertThat(registry.meters.map { meter -> meter.id.name }).containsExactlyInAnyOrder(
            "readmates.admin.operations.reconciliation",
            "readmates.admin.operations.lifecycle",
            "readmates.admin.operations.case.age",
        )
        assertThat(registry.meters.flatMap { meter -> meter.id.tags.map { tag -> tag.key } }.toSet())
            .containsExactlyInAnyOrder("source", "status", "action", "result", "severity")
        assertThat(registry.meters.flatMap { meter -> meter.id.tags.map { tag -> tag.value } })
            .containsExactlyInAnyOrder(
                "CLUB_READINESS",
                "PARTIAL",
                "RESOLVE",
                "SOURCE_UNAVAILABLE",
                "AI_JOB",
                "CRITICAL",
            )
    }

    @Test
    fun `case age clamps negative durations at zero`() {
        val registry = SimpleMeterRegistry()
        val adapter = MicrometerAdminOperationMetricsAdapter(registry)

        adapter.recordCaseAge(
            source = AdminOperationSourceType.NOTIFICATION,
            severity = AdminOperationSeverity.WARNING,
            seconds = -1,
        )

        val caseAge = registry.get("readmates.admin.operations.case.age").timer()
        assertThat(caseAge.count()).isEqualTo(1)
        assertThat(caseAge.totalTime(java.util.concurrent.TimeUnit.NANOSECONDS))
            .isEqualTo(Duration.ZERO.toNanos().toDouble())
    }
}
