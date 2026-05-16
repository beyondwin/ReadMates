package com.readmates.shared.observability.slo

data class SloCatalog(
    val version: Int,
    val slos: List<SloDefinition>,
)

data class SloDefinition(
    val id: String,
    val description: String,
    val objective: Double?,
    val objectiveMs: Long?,
    val window: String,
    val sli: SloIndicator,
)

data class SloIndicator(
    val type: String,
    val queryGood: String?,
    val queryTotal: String?,
    val queryLatencyP95: String?,
)
