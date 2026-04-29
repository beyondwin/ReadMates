package com.readmates.club.adapter.out.http

import com.readmates.club.domain.ClubDomainStatus
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.net.InetAddress
import java.time.Duration

class HttpClubDomainActualStateCheckerTest {
    private val checker = HttpClubDomainActualStateChecker(timeout = Duration.ofMillis(100))

    @Test
    fun `rejects private or loopback addresses before fetching marker`() {
        val result = checker.check("127.0.0.1")

        assertEquals(ClubDomainStatus.FAILED, result.status)
        assertEquals("DOMAIN_CHECK_PRIVATE_ADDRESS", result.errorCode)
    }

    @Test
    fun `rejects redirects instead of following them to a marker elsewhere`() {
        val result = checkerWithFetcher(MarkerHttpResult(statusCode = 302)).check("club.example.test")

        assertEquals(ClubDomainStatus.FAILED, result.status)
        assertEquals("DOMAIN_CHECK_REDIRECT", result.errorCode)
    }

    @Test
    fun `rejects oversized marker responses`() {
        val result = checkerWithFetcher(MarkerHttpResult(statusCode = 200, bodyTooLarge = true)).check("club.example.test")

        assertEquals(ClubDomainStatus.FAILED, result.status)
        assertEquals("DOMAIN_CHECK_RESPONSE_TOO_LARGE", result.errorCode)
    }

    @Test
    fun `accepts the ReadMates Cloudflare Pages marker`() {
        val result = checkerWithFetcher(
            MarkerHttpResult(
                statusCode = 200,
                body = """{"service":"readmates","surface":"cloudflare-pages","version":1}""",
            ),
        ).check("club.example.test")

        assertEquals(ClubDomainStatus.ACTIVE, result.status)
        assertEquals(null, result.errorCode)
    }

    private fun checkerWithFetcher(result: MarkerHttpResult): HttpClubDomainActualStateChecker =
        HttpClubDomainActualStateChecker(
            timeout = Duration.ofMillis(100),
            addressResolver = { arrayOf(InetAddress.getByName("93.184.216.34")) },
            markerFetcher = { result },
        )
}
