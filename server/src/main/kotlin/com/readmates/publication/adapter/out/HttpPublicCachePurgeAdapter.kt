package com.readmates.publication.adapter.out

import com.readmates.publication.application.port.out.ProviderAttemptResult
import com.readmates.publication.application.port.out.ProviderFailureCategory
import com.readmates.publication.application.port.out.ProviderSuccessCategory
import com.readmates.publication.application.port.out.PublicCachePurgeCommand
import com.readmates.publication.application.port.out.PublicCachePurgePort
import com.readmates.publication.config.PublicConvergenceProperties
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component
import java.io.IOException
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.net.http.HttpTimeoutException

internal data class PublicPurgeHttpRequest(
    val uri: URI,
    val headers: Map<String, String>,
    val body: String,
)

internal fun interface PublicPurgeHttpExchange {
    fun execute(request: PublicPurgeHttpRequest): Int
}

@Component
@ConditionalOnProperty(prefix = "readmates.public-convergence", name = ["enabled"], havingValue = "true")
@ConditionalOnProperty(prefix = "readmates.public-convergence.provider", name = ["http-enabled"], havingValue = "true")
class HttpPublicCachePurgeAdapter private constructor(
    private val properties: PublicConvergenceProperties.Provider,
    private val exchange: PublicPurgeHttpExchange,
) : PublicCachePurgePort {
    @Autowired
    constructor(properties: PublicConvergenceProperties) :
        this(properties.provider, JdkPublicPurgeHttpExchange(properties.provider))

    internal constructor(
        properties: PublicConvergenceProperties.Provider,
        exchange: (PublicPurgeHttpRequest) -> Int,
    ) : this(properties, PublicPurgeHttpExchange(exchange))

    override fun requestPurge(command: PublicCachePurgeCommand): ProviderAttemptResult {
        val request =
            PublicPurgeHttpRequest(
                uri = requireNotNull(properties.endpoint),
                headers =
                    mapOf(
                        "Authorization" to "Bearer ${properties.credential}",
                        "Content-Type" to "application/json",
                        "Idempotency-Key" to command.idempotencyToken,
                    ),
                body = command.toJson(),
            )
        val outcome =
            try {
                HttpExchangeOutcome.Status(exchange.execute(request))
            } catch (_: HttpTimeoutException) {
                HttpExchangeOutcome.Timeout
            } catch (_: IOException) {
                HttpExchangeOutcome.Unavailable
            } catch (_: InterruptedException) {
                Thread.currentThread().interrupt()
                HttpExchangeOutcome.Unavailable
            }
        return when (outcome) {
            HttpExchangeOutcome.Timeout ->
                ProviderAttemptResult.Failed(ProviderFailureCategory.TIMEOUT, retryable = true)
            HttpExchangeOutcome.Unavailable ->
                ProviderAttemptResult.Failed(ProviderFailureCategory.UNAVAILABLE, retryable = true)
            is HttpExchangeOutcome.Status -> outcome.status.toProviderResult()
        }
    }

    private fun Int.toProviderResult(): ProviderAttemptResult =
        when {
            this in HTTP_SUCCESS_MIN..HTTP_SUCCESS_MAX ->
                ProviderAttemptResult.Succeeded(ProviderSuccessCategory.PURGED)
            this == HTTP_CONFLICT -> ProviderAttemptResult.Succeeded(ProviderSuccessCategory.ALREADY_CURRENT)
            this == HTTP_REQUEST_TIMEOUT ->
                ProviderAttemptResult.Failed(ProviderFailureCategory.TIMEOUT, retryable = true)
            this == HTTP_TOO_MANY_REQUESTS || this in HTTP_SERVER_ERROR_MIN..HTTP_SERVER_ERROR_MAX ->
                ProviderAttemptResult.Failed(ProviderFailureCategory.UNAVAILABLE, retryable = true)
            else -> ProviderAttemptResult.Failed(ProviderFailureCategory.REJECTED, retryable = false)
        }

    private fun PublicCachePurgeCommand.toJson(): String =
        """{"convergenceId":"$convergenceId","publicationId":"$publicationId","sessionId":"$sessionId","committedGeneration":$committedGeneration,"originReadable":$originReadable}"""
}

private sealed interface HttpExchangeOutcome {
    data class Status(
        val status: Int,
    ) : HttpExchangeOutcome

    data object Timeout : HttpExchangeOutcome

    data object Unavailable : HttpExchangeOutcome
}

private class JdkPublicPurgeHttpExchange(
    properties: PublicConvergenceProperties.Provider,
) : PublicPurgeHttpExchange {
    private val timeout = properties.readTimeout
    private val client =
        HttpClient
            .newBuilder()
            .connectTimeout(properties.connectTimeout)
            .followRedirects(HttpClient.Redirect.NEVER)
            .build()

    override fun execute(request: PublicPurgeHttpRequest): Int {
        val builder =
            HttpRequest
                .newBuilder(request.uri)
                .timeout(timeout)
                .POST(HttpRequest.BodyPublishers.ofString(request.body))
        request.headers.forEach(builder::header)
        return client.send(builder.build(), HttpResponse.BodyHandlers.discarding()).statusCode()
    }
}

private const val HTTP_SUCCESS_MIN = 200
private const val HTTP_SUCCESS_MAX = 299
private const val HTTP_REQUEST_TIMEOUT = 408
private const val HTTP_CONFLICT = 409
private const val HTTP_TOO_MANY_REQUESTS = 429
private const val HTTP_SERVER_ERROR_MIN = 500
private const val HTTP_SERVER_ERROR_MAX = 599
