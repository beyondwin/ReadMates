package com.readmates.observability.application.service

import io.micrometer.core.instrument.Counter
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.Tag
import io.micrometer.core.instrument.Tags
import io.micrometer.core.instrument.Timer
import org.springframework.stereotype.Component
import java.time.Duration

@Component
class FrontendObservabilityMetrics(
    private val meterRegistry: MeterRegistry,
) {
    fun recordRouteLoad(
        routePattern: String,
        result: String,
        navigationType: String,
        duration: Duration,
    ) {
        Timer
            .builder("readmates.frontend.route_load")
            .description("Browser route load duration")
            .publishPercentileHistogram(true)
            .tags(
                frontendTags(
                    FrontendMetricLabel.ROUTE_PATTERN to routePattern,
                    FrontendMetricLabel.RESULT to result,
                    FrontendMetricLabel.NAVIGATION_TYPE to navigationType,
                ),
            ).register(meterRegistry)
            .record(duration)
    }

    fun recordRuntimeError(
        routePattern: String,
        errorKind: String,
        errorCode: String,
        severity: String,
    ) {
        Counter
            .builder("readmates.frontend.runtime_errors")
            .description("Browser runtime errors by route and class")
            .tags(
                frontendTags(
                    FrontendMetricLabel.ROUTE_PATTERN to routePattern,
                    FrontendMetricLabel.ERROR_KIND to errorKind,
                    FrontendMetricLabel.ERROR_CODE to errorCode,
                    FrontendMetricLabel.SEVERITY to severity,
                ),
            ).register(meterRegistry)
            .increment()
    }

    fun recordApiFailure(
        routePattern: String,
        apiGroup: String,
        statusClass: String,
        errorCode: String,
    ) {
        Counter
            .builder("readmates.frontend.api_failures")
            .description("Frontend-observed API failures by route and API group")
            .tags(
                frontendTags(
                    FrontendMetricLabel.ROUTE_PATTERN to routePattern,
                    FrontendMetricLabel.API_GROUP to apiGroup,
                    FrontendMetricLabel.STATUS_CLASS to statusClass,
                    FrontendMetricLabel.ERROR_CODE to errorCode,
                ),
            ).register(meterRegistry)
            .increment()
    }

    fun recordDropped(reason: String) {
        Counter
            .builder("readmates.frontend.observability.dropped")
            .description("Dropped frontend telemetry events by low-cardinality reason")
            .tags(frontendTags(FrontendMetricLabel.REASON to reason))
            .register(meterRegistry)
            .increment()
    }

    private fun frontendTags(vararg labels: Pair<FrontendMetricLabel, String>): Tags =
        Tags.of(labels.map { (label, value) -> Tag.of(label.tagKey, value) })
}

private enum class FrontendMetricLabel(
    val tagKey: String,
) {
    ROUTE_PATTERN("route_pattern"),
    RESULT("result"),
    NAVIGATION_TYPE("navigation_type"),
    ERROR_KIND("error_kind"),
    ERROR_CODE("error_code"),
    SEVERITY("severity"),
    API_GROUP("api_group"),
    STATUS_CLASS("status_class"),
    REASON("reason"),
}
