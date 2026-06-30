package com.readmates.observability.application.model

import java.time.Duration

sealed interface FrontendObservabilityEvent {
    val routePattern: String
}

data class FrontendRouteLoadEvent(
    override val routePattern: String,
    val duration: Duration,
    val navigationType: String,
    val result: String,
) : FrontendObservabilityEvent

data class FrontendRuntimeErrorEvent(
    override val routePattern: String,
    val errorKind: String,
    val errorCode: String,
    val severity: String,
) : FrontendObservabilityEvent

data class FrontendApiFailureEvent(
    override val routePattern: String,
    val apiGroup: String,
    val statusClass: String,
    val errorCode: String,
) : FrontendObservabilityEvent

data class FrontendObservabilityResult(
    val accepted: Int,
    val dropped: Int,
)
