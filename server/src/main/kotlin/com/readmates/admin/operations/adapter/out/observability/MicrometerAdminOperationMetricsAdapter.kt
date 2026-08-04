package com.readmates.admin.operations.adapter.out.observability

import com.readmates.admin.operations.application.model.AdminOperationAction
import com.readmates.admin.operations.application.model.AdminOperationSeverity
import com.readmates.admin.operations.application.model.AdminOperationSourceStatus
import com.readmates.admin.operations.application.model.AdminOperationSourceType
import com.readmates.admin.operations.application.port.out.AdminOperationLifecycleResult
import com.readmates.admin.operations.application.port.out.AdminOperationMetricsPort
import io.micrometer.core.instrument.Counter
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.Timer
import org.springframework.stereotype.Component
import java.time.Duration

@Component
class MicrometerAdminOperationMetricsAdapter(
    private val meterRegistry: MeterRegistry,
) : AdminOperationMetricsPort {
    override fun recordReconciliation(
        source: AdminOperationSourceType,
        status: AdminOperationSourceStatus,
    ) {
        Counter
            .builder(RECONCILIATION_METRIC)
            .description("Admin operation source reconciliation outcomes")
            .tag("source", source.name)
            .tag("status", status.name)
            .register(meterRegistry)
            .increment()
    }

    override fun recordLifecycle(
        action: AdminOperationAction,
        result: AdminOperationLifecycleResult,
    ) {
        Counter
            .builder(LIFECYCLE_METRIC)
            .description("Admin operation case lifecycle outcomes")
            .tag("action", action.name)
            .tag("result", result.name)
            .register(meterRegistry)
            .increment()
    }

    override fun recordCaseAge(
        source: AdminOperationSourceType,
        severity: AdminOperationSeverity,
        seconds: Long,
    ) {
        Timer
            .builder(CASE_AGE_METRIC)
            .description("Age of admin operation cases observed during reads")
            .tag("source", source.name)
            .tag("severity", severity.name)
            .register(meterRegistry)
            .record(Duration.ofSeconds(seconds.coerceAtLeast(0)))
    }

    private companion object {
        const val RECONCILIATION_METRIC = "readmates.admin.operations.reconciliation"
        const val LIFECYCLE_METRIC = "readmates.admin.operations.lifecycle"
        const val CASE_AGE_METRIC = "readmates.admin.operations.case.age"
    }
}
