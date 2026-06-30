package com.readmates.observability.application.service

import com.readmates.observability.application.model.FrontendApiFailureEvent
import com.readmates.observability.application.model.FrontendObservabilityEvent
import com.readmates.observability.application.model.FrontendObservabilityResult
import com.readmates.observability.application.model.FrontendRouteLoadEvent
import com.readmates.observability.application.model.FrontendRuntimeErrorEvent
import com.readmates.observability.application.port.`in`.RecordFrontendObservabilityUseCase
import org.springframework.stereotype.Service

@Service
class FrontendObservabilityService(
    private val metrics: FrontendObservabilityMetrics,
) : RecordFrontendObservabilityUseCase {
    override fun record(events: List<FrontendObservabilityEvent>): FrontendObservabilityResult {
        var accepted = 0
        for (event in events) {
            when (event) {
                is FrontendRouteLoadEvent -> {
                    metrics.recordRouteLoad(event.routePattern, event.result, event.navigationType, event.duration)
                    accepted += 1
                }

                is FrontendRuntimeErrorEvent -> {
                    metrics.recordRuntimeError(event.routePattern, event.errorKind, event.errorCode, event.severity)
                    accepted += 1
                }

                is FrontendApiFailureEvent -> {
                    metrics.recordApiFailure(event.routePattern, event.apiGroup, event.statusClass, event.errorCode)
                    accepted += 1
                }
            }
        }
        return FrontendObservabilityResult(accepted = accepted, dropped = 0)
    }
}
