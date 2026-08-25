package com.readmates.publication.adapter.out.http

import com.readmates.publication.application.model.ProviderAttemptResult
import com.readmates.publication.application.model.ProviderAttemptStatus
import com.readmates.publication.application.model.ProviderResultCategory
import com.readmates.publication.application.port.out.PublicCachePurgeCommand
import com.readmates.publication.application.port.out.PublicCachePurgePort
import com.readmates.publication.config.PublicConvergenceProperties
import org.springframework.stereotype.Component
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse

@Component
class HttpPublicCachePurgeAdapter(
    private val properties: PublicConvergenceProperties,
) : PublicCachePurgePort {
    private val client =
        HttpClient
            .newBuilder()
            .connectTimeout(properties.requestTimeout)
            .followRedirects(HttpClient.Redirect.NEVER)
            .build()

    override fun requestPurge(command: PublicCachePurgeCommand): ProviderAttemptResult {
        val uri = trustedEndpoint() ?: return permanent(ProviderResultCategory.NOT_CONFIGURED)
        val requestBuilder =
            HttpRequest
                .newBuilder(uri)
                .timeout(properties.requestTimeout)
                .header("Accept", "application/json")
                .header("Content-Type", "application/json")
                .header("Idempotency-Key", command.idempotencyToken)
                .POST(HttpRequest.BodyPublishers.ofString(command.toJson()))
        if (properties.bearerToken.isNotBlank()) {
            requestBuilder.header("Authorization", "Bearer ${properties.bearerToken}")
        }
        return try {
            val status = client.send(requestBuilder.build(), HttpResponse.BodyHandlers.discarding()).statusCode()
            when (status) {
                in 200..299 -> success()
                408, 425, 429, in 500..599 -> temporary()
                else -> permanent(ProviderResultCategory.PERMANENT_FAILURE)
            }
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
            temporary()
        } catch (_: Exception) {
            temporary()
        }
    }

    private fun trustedEndpoint(): URI? =
        runCatching { URI.create(properties.endpoint) }
            .getOrNull()
            ?.takeIf { uri -> uri.scheme in setOf("http", "https") && uri.host != null && uri.userInfo == null }

    private fun PublicCachePurgeCommand.toJson(): String =
        """{"idempotencyToken":"$idempotencyToken","convergenceId":"$convergenceId","attemptNo":$attemptNo,"clubId":"$clubIdSnapshot","sessionId":${sessionIdSnapshot.jsonString()},"publicationId":${publicationIdSnapshot.jsonString()}}"""

    private fun Any?.jsonString(): String = this?.let { "\"$it\"" } ?: "null"

    private fun success() = ProviderAttemptResult(ProviderAttemptStatus.SUCCEEDED, ProviderResultCategory.PURGED, retryable = false)

    private fun temporary() =
        ProviderAttemptResult(ProviderAttemptStatus.FAILED, ProviderResultCategory.TEMPORARY_FAILURE, retryable = true)

    private fun permanent(category: ProviderResultCategory) =
        ProviderAttemptResult(ProviderAttemptStatus.FAILED, category, retryable = false)
}
