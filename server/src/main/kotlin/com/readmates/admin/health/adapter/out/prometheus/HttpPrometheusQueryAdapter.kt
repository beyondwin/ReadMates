package com.readmates.admin.health.adapter.out.prometheus

import com.readmates.admin.health.application.port.out.PromInstantValue
import com.readmates.admin.health.application.port.out.PromQueryResult
import com.readmates.admin.health.application.port.out.PrometheusQueryException
import com.readmates.admin.health.application.port.out.PrometheusQueryFailureKind
import com.readmates.admin.health.application.port.out.PrometheusQueryPort
import org.springframework.web.client.ResourceAccessException
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestClientException
import org.springframework.web.client.RestClientResponseException
import tools.jackson.databind.JsonNode
import java.net.SocketTimeoutException
import java.util.concurrent.TimeoutException

class HttpPrometheusQueryAdapter(
    private val restClient: RestClient,
) : PrometheusQueryPort {
    override fun query(promql: String): PromQueryResult =
        try {
            val body =
                restClient
                    .get()
                    .uri { builder -> builder.path("api/v1/query").queryParam("query", "{promql}").build(promql) }
                    .retrieve()
                    .body(JsonNode::class.java)
                    ?: throw PrometheusQueryException(PrometheusQueryFailureKind.INVALID_RESPONSE)
            val status = body.path("status").asString()
            if (status != "success") {
                throw PrometheusQueryException(PrometheusQueryFailureKind.INVALID_RESPONSE)
            }
            val data = body.path("data")
            val results = data.path("result")
            if (data.path("resultType").asString() != "vector" || !results.isArray) {
                throw PrometheusQueryException(PrometheusQueryFailureKind.INVALID_RESPONSE)
            }
            val values: List<PromInstantValue> =
                results.values().map { entry ->
                    val labels =
                        entry
                            .path("metric")
                            .properties()
                            .associate { it.key to it.value.asString() }
                    val valueArray = entry.path("value")
                    val raw = valueArray.path(1).asString()
                    PromInstantValue(labels = labels, value = raw.toDouble())
                }
            PromQueryResult(values = values)
        } catch (ex: PrometheusQueryException) {
            throw ex
        } catch (ex: RestClientResponseException) {
            throw PrometheusQueryException(PrometheusQueryFailureKind.HTTP_ERROR, cause = ex)
        } catch (ex: ResourceAccessException) {
            val kind =
                if (ex.hasTimeoutCause()) {
                    PrometheusQueryFailureKind.TIMEOUT
                } else {
                    PrometheusQueryFailureKind.CONNECTION
                }
            throw PrometheusQueryException(kind, cause = ex)
        } catch (ex: RestClientException) {
            throw PrometheusQueryException(PrometheusQueryFailureKind.INVALID_RESPONSE, cause = ex)
        } catch (ex: NumberFormatException) {
            throw PrometheusQueryException(PrometheusQueryFailureKind.INVALID_RESPONSE, cause = ex)
        }

    private fun Throwable.hasTimeoutCause(): Boolean =
        generateSequence(this) { it.cause }
            .any { cause ->
                cause is SocketTimeoutException ||
                    cause is TimeoutException ||
                    cause.javaClass.simpleName.endsWith("TimeoutException")
            }
}
