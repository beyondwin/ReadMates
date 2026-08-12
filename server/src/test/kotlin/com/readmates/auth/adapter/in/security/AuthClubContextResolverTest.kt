@file:Suppress("ktlint:standard:package-name")

package com.readmates.auth.adapter.`in`.security

import com.readmates.club.application.model.ResolvedClubContext
import com.readmates.club.application.port.`in`.ResolveClubContextUseCase
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.mock.web.MockHttpServletRequest
import java.util.UUID

class AuthClubContextResolverTest {
    @Test
    fun `slug header wins over host header`() {
        val slugContext = sampleResolvedContext(slug = "reading-sai")
        val hostContext = sampleResolvedContext(slug = "other-club", hostname = "other.example.test")
        val request =
            MockHttpServletRequest().apply {
                addHeader(AuthClubContextHeader.CLUB_SLUG, "reading-sai")
                addHeader(AuthClubContextHeader.CLUB_HOST, "other.example.test")
            }

        val result =
            request.resolveAuthClubContext(
                StubResolveClubContextUseCase(
                    bySlug = mapOf("reading-sai" to slugContext),
                    byHost = mapOf("other.example.test" to hostContext),
                ),
            )

        assertThat(result).isEqualTo(RequestedAuthClubContext(true, AuthClubContextSource.SLUG, slugContext))
    }

    @Test
    fun `blank slug falls through to host`() {
        val hostContext = sampleResolvedContext(slug = "reading-sai", hostname = "readmates.example.test")
        val request =
            MockHttpServletRequest().apply {
                addHeader(AuthClubContextHeader.CLUB_SLUG, "  ")
                addHeader(AuthClubContextHeader.CLUB_HOST, "readmates.example.test")
            }

        val result =
            request.resolveAuthClubContext(
                StubResolveClubContextUseCase(byHost = mapOf("readmates.example.test" to hostContext)),
            )

        assertThat(result).isEqualTo(RequestedAuthClubContext(true, AuthClubContextSource.HOST_FALLBACK, hostContext))
    }

    @Test
    fun `known slug yields slug context`() {
        val context = sampleResolvedContext(slug = "reading-sai")
        val request = MockHttpServletRequest().apply { addHeader(AuthClubContextHeader.CLUB_SLUG, "reading-sai") }

        val result =
            request.resolveAuthClubContext(
                StubResolveClubContextUseCase(bySlug = mapOf("reading-sai" to context)),
            )

        assertThat(result).isEqualTo(RequestedAuthClubContext(true, AuthClubContextSource.SLUG, context))
    }

    @Test
    fun `unknown slug remains supplied with null context`() {
        val request = MockHttpServletRequest().apply { addHeader(AuthClubContextHeader.CLUB_SLUG, "missing-club") }

        val result = request.resolveAuthClubContext(StubResolveClubContextUseCase())

        assertThat(result).isEqualTo(RequestedAuthClubContext(true, AuthClubContextSource.SLUG, null))
    }

    @Test
    fun `known host yields host fallback context`() {
        val context = sampleResolvedContext(slug = "reading-sai", hostname = "readmates.example.test")
        val request =
            MockHttpServletRequest().apply {
                addHeader(AuthClubContextHeader.CLUB_HOST, "readmates.example.test")
            }

        val result =
            request.resolveAuthClubContext(
                StubResolveClubContextUseCase(byHost = mapOf("readmates.example.test" to context)),
            )

        assertThat(result).isEqualTo(RequestedAuthClubContext(true, AuthClubContextSource.HOST_FALLBACK, context))
    }

    @Test
    fun `unknown host remains supplied with null context`() {
        val request =
            MockHttpServletRequest().apply {
                addHeader(AuthClubContextHeader.CLUB_HOST, "missing.example.test")
            }

        val result = request.resolveAuthClubContext(StubResolveClubContextUseCase())

        assertThat(result).isEqualTo(RequestedAuthClubContext(true, AuthClubContextSource.HOST_FALLBACK, null))
    }

    @Test
    fun `no headers remains unscoped`() {
        val result = MockHttpServletRequest().resolveAuthClubContext(StubResolveClubContextUseCase())

        assertThat(result).isEqualTo(RequestedAuthClubContext(false, AuthClubContextSource.NONE, null))
    }

    private fun sampleResolvedContext(
        slug: String,
        hostname: String? = null,
    ): ResolvedClubContext =
        ResolvedClubContext(
            clubId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
            slug = slug,
            name = "Sample Club",
            status = "ACTIVE",
            hostname = hostname,
        )

    private class StubResolveClubContextUseCase(
        private val bySlug: Map<String, ResolvedClubContext> = emptyMap(),
        private val byHost: Map<String, ResolvedClubContext> = emptyMap(),
    ) : ResolveClubContextUseCase {
        override fun resolveBySlug(slug: String): ResolvedClubContext? = bySlug[slug]

        override fun resolveByHost(host: String?): ResolvedClubContext? = host?.let(byHost::get)
    }
}
