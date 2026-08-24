package com.readmates.publication.adapter.out

import com.readmates.publication.application.port.out.ProviderAttemptResult
import com.readmates.publication.application.port.out.ProviderFailureCategory
import com.readmates.publication.application.port.out.ProviderSuccessCategory
import com.readmates.publication.application.port.out.PublicCachePurgeCommand
import com.readmates.publication.config.PublicConvergenceProperties
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.net.URI
import java.time.Duration
import java.util.UUID

class HttpPublicCachePurgeAdapterTest {
    @Test
    fun `request sends deterministic idempotency and maps status without response detail`() {
        var captured: PublicPurgeHttpRequest? = null
        val adapter =
            HttpPublicCachePurgeAdapter(properties()) { request ->
                captured = request
                202
            }

        val result = adapter.requestPurge(command())

        assertThat(result).isEqualTo(ProviderAttemptResult.Succeeded(ProviderSuccessCategory.PURGED))
        assertThat(captured?.uri).isEqualTo(URI("https://cache-provider.example/purge"))
        assertThat(captured?.headers).containsEntry(
            "Idempotency-Key",
            "public-convergence:00000000-0000-0000-0000-000000000901:2",
        )
        assertThat(captured?.headers).containsEntry("Authorization", "Bearer test-credential")
        assertThat(captured?.body).contains("\"committedGeneration\":42")
        assertThat(captured?.body).doesNotContain("test-credential")
    }

    @Test
    fun `http failures map to bounded retry decisions`() {
        assertThat(adapterReturning(429).requestPurge(command()))
            .isEqualTo(ProviderAttemptResult.Failed(ProviderFailureCategory.UNAVAILABLE, retryable = true))
        assertThat(adapterReturning(503).requestPurge(command()))
            .isEqualTo(ProviderAttemptResult.Failed(ProviderFailureCategory.UNAVAILABLE, retryable = true))
        assertThat(adapterReturning(400).requestPurge(command()))
            .isEqualTo(ProviderAttemptResult.Failed(ProviderFailureCategory.REJECTED, retryable = false))
    }

    @Test
    fun `http conflict is rejected until the provider documents idempotent duplicate success`() {
        assertThat(adapterReturning(409).requestPurge(command()))
            .isEqualTo(ProviderAttemptResult.Failed(ProviderFailureCategory.REJECTED, retryable = false))
    }

    private fun adapterReturning(status: Int) = HttpPublicCachePurgeAdapter(properties()) { status }

    private fun properties() =
        PublicConvergenceProperties.Provider(
            httpEnabled = true,
            endpoint = URI("https://cache-provider.example/purge"),
            credential = "test-credential",
            connectTimeout = Duration.ofSeconds(1),
            readTimeout = Duration.ofSeconds(2),
        )

    private fun command() =
        PublicCachePurgeCommand(
            convergenceId = UUID.fromString("00000000-0000-0000-0000-000000000901"),
            publicationId = UUID.fromString("00000000-0000-0000-0000-000000000902"),
            sessionId = UUID.fromString("00000000-0000-0000-0000-000000000903"),
            committedGeneration = 42,
            originReadable = true,
            idempotencyToken = "public-convergence:00000000-0000-0000-0000-000000000901:2",
        )
}
