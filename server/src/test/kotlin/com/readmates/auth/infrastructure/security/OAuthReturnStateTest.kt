package com.readmates.auth.infrastructure.security

import com.readmates.auth.application.port.out.TrustedReturnHostPort
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.Duration

class OAuthReturnStateTest {
    private val trustedReturnHostPort =
        object : TrustedReturnHostPort {
            override fun activeClubSlugForHost(host: String): String? = null
        }

    @Test
    fun `fails fast when return state secret is blank`() {
        assertThatThrownBy {
            OAuthReturnState(
                secret = "   ",
                appBaseUrl = "http://localhost:3000",
                ttl = Duration.ofMinutes(10),
                sessionCookieDomain = "",
                trustedReturnHostPort = trustedReturnHostPort,
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("readmates.auth.return-state-secret")
    }
}
