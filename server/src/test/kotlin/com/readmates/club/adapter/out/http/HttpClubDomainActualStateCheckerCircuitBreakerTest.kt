package com.readmates.club.adapter.out.http

import com.readmates.club.domain.ClubDomainStatus
import com.readmates.shared.adapter.out.resilience.OutboundCircuitBreakers
import com.readmates.shared.adapter.out.resilience.OutboundResilienceProperties
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.ObjectProvider
import java.net.InetAddress
import java.time.Duration

class HttpClubDomainActualStateCheckerCircuitBreakerTest {
    @Test
    fun `opens circuit after repeated fetch failures and short-circuits with circuit-open error`() {
        var fetchCalls = 0
        val checker =
            HttpClubDomainActualStateChecker(
                timeout = Duration.ofSeconds(1),
                addressResolver = { arrayOf(InetAddress.getByName("93.184.216.34")) },
                markerFetcher = {
                    fetchCalls++
                    throw RuntimeException("connection refused")
                },
                circuitBreakers = breakers(),
            )

        val first = checker.check("club.example.com")
        val second = checker.check("club.example.com")
        assertThat(first.status).isEqualTo(ClubDomainStatus.FAILED)
        assertThat(first.errorCode).isEqualTo("DOMAIN_CHECK_UNREACHABLE")
        assertThat(second.errorCode).isEqualTo("DOMAIN_CHECK_UNREACHABLE")

        val third = checker.check("club.example.com")
        assertThat(third.status).isEqualTo(ClubDomainStatus.FAILED)
        assertThat(third.errorCode).isEqualTo("DOMAIN_CHECK_CIRCUIT_OPEN")
        assertThat(fetchCalls).isEqualTo(2)
    }

    @Test
    fun `successful fetch keeps returning the real result`() {
        val checker =
            HttpClubDomainActualStateChecker(
                timeout = Duration.ofSeconds(1),
                addressResolver = { arrayOf(InetAddress.getByName("93.184.216.34")) },
                markerFetcher = {
                    MarkerHttpResult(
                        statusCode = 200,
                        body = """{"service":"readmates","surface":"cloudflare-pages","version":1}""",
                    )
                },
                circuitBreakers = breakers(),
            )

        val result = checker.check("club.example.com")

        assertThat(result.status).isEqualTo(ClubDomainStatus.ACTIVE)
        assertThat(result.errorCode).isNull()
    }

    private fun breakers(): OutboundCircuitBreakers =
        OutboundCircuitBreakers(
            properties =
                OutboundResilienceProperties(
                    slidingWindowSize = 2,
                    minimumNumberOfCalls = 2,
                    failureRateThreshold = 50f,
                    waitDurationInOpenState = Duration.ofSeconds(60),
                ),
            meterRegistryProvider = noopProvider(),
        )

    private fun noopProvider(): ObjectProvider<MeterRegistry> =
        object : ObjectProvider<MeterRegistry> {
            private val registry = SimpleMeterRegistry()

            override fun getObject() = registry

            override fun getObject(vararg args: Any?) = registry

            override fun getIfAvailable() = registry

            override fun getIfUnique() = registry
        }
}
