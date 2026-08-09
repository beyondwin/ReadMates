package com.readmates.admin.health.application.port.out

data class PromInstantValue(
    val labels: Map<String, String>,
    val value: Double,
)

data class PromQueryResult(
    val values: List<PromInstantValue>,
)

enum class PrometheusQueryFailureKind {
    TIMEOUT,
    HTTP_ERROR,
    INVALID_RESPONSE,
    CONNECTION,
}

class PrometheusQueryException(
    val kind: PrometheusQueryFailureKind,
    cause: Throwable? = null,
) : RuntimeException(kind.safeMessage, cause)

private val PrometheusQueryFailureKind.safeMessage: String
    get() =
        when (this) {
            PrometheusQueryFailureKind.TIMEOUT -> "prometheus request timed out"
            PrometheusQueryFailureKind.HTTP_ERROR -> "prometheus returned an HTTP error"
            PrometheusQueryFailureKind.INVALID_RESPONSE -> "prometheus returned an invalid response"
            PrometheusQueryFailureKind.CONNECTION -> "prometheus connection failed"
        }

interface PrometheusQueryPort {
    fun query(promql: String): PromQueryResult
}
