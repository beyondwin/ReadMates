package com.readmates.publication.config

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.boot.test.context.runner.ApplicationContextRunner

class PublicConvergencePropertiesTest {
    @Test
    fun `maintenance retention shorter than operational window fails startup`() {
        contextRunner
            .withPropertyValues("readmates.public-convergence.maintenance.retention=59m")
            .run { context ->
                assertThat(context).hasFailed()
                assertThat(context.startupFailure)
                    .hasRootCauseMessage("Public convergence work retention must be between 1h and 30d")
            }
    }

    @Test
    fun `http provider rejects lease shorter than full call budget plus terminal margin`() {
        assertInvalidLease("9s")
    }

    @Test
    fun `http provider rejects lease equal to full call budget plus terminal margin`() {
        assertInvalidLease("10s")
    }

    @Test
    fun `http provider accepts lease strictly greater than full call budget plus terminal margin`() {
        contextRunner
            .withPropertyValues(
                *httpProviderProperties(),
                "readmates.public-convergence.lease-duration=10001ms",
                "readmates.public-convergence.provider.connect-timeout=2s",
                "readmates.public-convergence.provider.read-timeout=3s",
                "readmates.public-convergence.terminal-write-safety-margin=5s",
            ).run { context ->
                assertThat(context).hasNotFailed()
            }
    }

    private fun assertInvalidLease(leaseDuration: String) {
        contextRunner
            .withPropertyValues(
                *httpProviderProperties(),
                "readmates.public-convergence.lease-duration=$leaseDuration",
                "readmates.public-convergence.provider.connect-timeout=2s",
                "readmates.public-convergence.provider.read-timeout=3s",
                "readmates.public-convergence.terminal-write-safety-margin=5s",
            ).run { context ->
                assertThat(context).hasFailed()
                assertThat(context.startupFailure).hasRootCauseMessage(LEASE_BUDGET_ERROR)
                assertThat(context.startupFailure?.stackTraceToString()).doesNotContain(TEST_CREDENTIAL)
            }
    }

    private fun httpProviderProperties(): Array<String> =
        arrayOf(
            "readmates.public-convergence.provider.http-enabled=true",
            "readmates.public-convergence.provider.endpoint=https://cache-provider.invalid/purge",
            "readmates.public-convergence.provider.credential=$TEST_CREDENTIAL",
        )

    private val contextRunner =
        ApplicationContextRunner()
            .withUserConfiguration(PublicConvergenceConfiguration::class.java)

    private companion object {
        const val TEST_CREDENTIAL = "test-only-sensitive-credential"
        const val LEASE_BUDGET_ERROR =
            "Public convergence lease duration must exceed " +
                "provider call budget plus terminal write safety margin"
    }
}
