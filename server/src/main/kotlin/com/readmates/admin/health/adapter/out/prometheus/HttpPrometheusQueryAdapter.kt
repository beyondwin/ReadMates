package com.readmates.admin.health.adapter.out.prometheus

import tools.jackson.databind.JsonNode
import com.readmates.admin.health.application.port.out.PromInstantValue
import com.readmates.admin.health.application.port.out.PromQueryResult
import com.readmates.admin.health.application.port.out.PrometheusQueryPort
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestClientResponseException
import java.time.Duration

class PrometheusQueryException(message: String, cause: Throwable? = null) : RuntimeException(message, cause)

class HttpPrometheusQueryAdapter(
    private val restClient: RestClient,
    @Suppress("UnusedPrivateProperty", "unused") private val requestTimeout: Duration,
) : PrometheusQueryPort {
    override fun query(promql: String): PromQueryResult {
        return try {
            val body =
                restClient
                    .get()
                    .uri { builder -> builder.path("api/v1/query").queryParam("query", promql).build() }
                    .retrieve()
                    .body(JsonNode::class.java)
                    ?: throw PrometheusQueryException("empty body")
            val status = body.path("status").asText()
            if (status != "success") {
                throw PrometheusQueryException("prometheus status=$status")
            }
            val results = body.path("data").path("result")
            val values: List<PromInstantValue> =
                results.values().map { entry ->
                    val labels =
                        entry
                            .path("metric")
                            .properties()
                            .associate { it.key to it.value.asText() }
                    val valueArray = entry.path("value")
                    val raw = valueArray.path(1).asText()
                    PromInstantValue(labels = labels, value = raw.toDouble())
                }
            PromQueryResult(values = values)
        } catch (ex: RestClientResponseException) {
            throw PrometheusQueryException("prometheus http ${ex.statusCode.value()}", ex)
        }
    }
}
