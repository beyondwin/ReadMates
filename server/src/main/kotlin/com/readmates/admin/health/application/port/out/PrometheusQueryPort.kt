package com.readmates.admin.health.application.port.out

data class PromInstantValue(
    val labels: Map<String, String>,
    val value: Double,
)

data class PromQueryResult(
    val values: List<PromInstantValue>,
)

interface PrometheusQueryPort {
    fun query(promql: String): PromQueryResult
}
