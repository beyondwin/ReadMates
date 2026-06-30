package com.readmates.observability.adapter.`in`.web

import com.readmates.observability.application.model.FrontendApiFailureEvent
import com.readmates.observability.application.model.FrontendObservabilityEvent
import com.readmates.observability.application.model.FrontendRouteLoadEvent
import com.readmates.observability.application.model.FrontendRuntimeErrorEvent
import com.readmates.observability.application.port.`in`.RecordFrontendObservabilityUseCase
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.time.Duration

@RestController
@RequestMapping("/api/observability/frontend-events")
class FrontendObservabilityController(
    private val recordFrontendObservability: RecordFrontendObservabilityUseCase,
) {
    @PostMapping
    @ResponseStatus(HttpStatus.ACCEPTED)
    fun record(
        @RequestBody request: FrontendObservabilityRequest,
    ): FrontendObservabilityResponse {
        val events = request.events.take(MAX_EVENTS)
        val mapped = mutableListOf<FrontendObservabilityEvent>()
        var dropped = 0
        for (reason in request.droppedReasons.orEmpty().take(MAX_DROPPED_REASONS)) {
            if (reason in allowedDroppedReasons) {
                dropped += 1
                recordFrontendObservability.recordDropped(reason)
            }
        }
        for (event in events) {
            val mappedEvent = event.toApplicationEvent()
            if (mappedEvent == null) {
                dropped += 1
                recordFrontendObservability.recordDropped(event.dropReason())
            } else {
                mapped += mappedEvent
            }
        }
        if (mapped.isEmpty()) {
            return FrontendObservabilityResponse(accepted = 0, dropped = dropped)
        }
        val result = recordFrontendObservability.record(mapped)
        return FrontendObservabilityResponse(
            accepted = result.accepted,
            dropped = result.dropped + dropped,
        )
    }

    private companion object {
        const val MAX_EVENTS = 20
        const val MAX_DROPPED_REASONS = 60
    }
}

data class FrontendObservabilityRequest(
    val events: List<FrontendObservabilityEventRequest> = emptyList(),
    val droppedReasons: List<String>? = null,
)

data class FrontendObservabilityEventRequest(
    val type: String? = null,
    val routePattern: String? = null,
    val durationMs: Long? = null,
    val navigationType: String? = null,
    val result: String? = null,
    val errorKind: String? = null,
    val errorCode: String? = null,
    val severity: String? = null,
    val apiGroup: String? = null,
    val statusClass: String? = null,
) {
    fun toApplicationEvent(): FrontendObservabilityEvent? {
        val safeRoute = routePattern?.takeIf(::isSafeRoutePattern) ?: return null
        return when (type) {
            "ROUTE_LOAD" -> routeLoadEvent(safeRoute)
            "RUNTIME_ERROR" -> runtimeErrorEvent(safeRoute)
            "API_FAILURE" -> apiFailureEvent(safeRoute)
            else -> null
        }
    }

    private fun routeLoadEvent(safeRoute: String): FrontendRouteLoadEvent? {
        val duration = durationMs?.takeIf { it in 0..60_000 } ?: return null
        val nav = navigationType?.takeIf { it in allowedNavigationTypes } ?: return null
        val outcome = result?.takeIf { it in allowedRouteLoadResults } ?: return null
        return FrontendRouteLoadEvent(safeRoute, Duration.ofMillis(duration), nav, outcome)
    }

    private fun runtimeErrorEvent(safeRoute: String): FrontendRuntimeErrorEvent? {
        val kind = errorKind?.takeIf { it in allowedRuntimeKinds } ?: return null
        val code = errorCode?.takeIf(::isSafeCode) ?: return null
        val level = severity?.takeIf { it in allowedSeverities } ?: return null
        return FrontendRuntimeErrorEvent(safeRoute, kind, code, level)
    }

    private fun apiFailureEvent(safeRoute: String): FrontendApiFailureEvent? {
        val group = apiGroup?.takeIf { it in allowedApiGroups } ?: return null
        val status = statusClass?.takeIf { it in allowedStatusClasses } ?: return null
        val code = errorCode?.takeIf(::isSafeCode) ?: return null
        return FrontendApiFailureEvent(safeRoute, group, status, code)
    }

    fun dropReason(): String =
        if (routePattern?.let(::isSafeRoutePattern) == false) {
            "invalid_route_pattern"
        } else {
            "invalid_event"
        }
}

data class FrontendObservabilityResponse(
    val accepted: Int,
    val dropped: Int,
)

private val allowedNavigationTypes = setOf("LOAD", "PUSH", "POP", "REPLACE")
private val allowedRouteLoadResults = setOf("success", "error")
private val allowedRuntimeKinds = setOf("render", "unhandled-rejection", "unknown")
private val allowedSeverities = setOf("warn", "error")
private val allowedStatusClasses = setOf("4xx", "5xx", "network", "unknown")
private val allowedDroppedReasons = setOf("invalid_route_pattern", "invalid_event", "batch_limit")
private val allowedApiGroups =
    setOf(
        "admin-ai",
        "admin-audit",
        "admin-club",
        "admin-health",
        "admin-notification",
        "admin-support",
        "auth",
        "feedback",
        "host-member",
        "host-notification",
        "host-session",
        "member",
        "notification",
        "public",
        "unknown",
    )

private fun isSafeCode(value: String): Boolean = Regex("^[A-Z][A-Z0-9_]{1,63}$").matches(value)

private fun isSafeRoutePattern(value: String): Boolean {
    if (value == "unknown") return true
    if (!value.startsWith("/") || value.contains("?") || value.contains("#")) return false
    if (Regex("[0-9a-f]{8}-[0-9a-f-]{27}", RegexOption.IGNORE_CASE).containsMatchIn(value)) return false
    if (Regex("/clubs/(?!:slug(?:/|$))[^/]+").containsMatchIn(value)) return false
    return true
}
