package com.readmates.club.adapter.`in`.web

import com.readmates.club.application.model.ResolvedClubContext
import com.readmates.club.application.port.`in`.ResolveClubContextUseCase
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.mock.web.MockHttpServletRequest
import java.util.UUID

/**
 * Pure-unit coverage for the `HttpServletRequest.resolveClubContext` extension function,
 * focused on the `source` field added to [RequestedClubContext]. Unlike
 * `ClubContextResolverTest`, this exercises the header-branching logic without booting
 * Spring or touching MySQL: the use case is a hand-rolled stub.
 */
class ResolveClubContextRequestExtensionTest {
    @Test
    fun `slug header with successful lookup yields SLUG source and non-null context`() {
        val resolved = sampleResolvedContext(slug = "reading-sai")
        val useCase = StubResolveClubContextUseCase(
            bySlug = mapOf("reading-sai" to resolved),
        )
        val request = MockHttpServletRequest().apply {
            addHeader(ClubContextHeader.CLUB_SLUG, "reading-sai")
        }

        val result = request.resolveClubContext(useCase)

        assertThat(result.supplied).isTrue()
        assertThat(result.source).isEqualTo(ClubContextSource.SLUG)
        assertThat(result.context).isEqualTo(resolved)
    }

    @Test
    fun `slug header with no matching club yields SLUG source and null context`() {
        val useCase = StubResolveClubContextUseCase()
        val request = MockHttpServletRequest().apply {
            addHeader(ClubContextHeader.CLUB_SLUG, "missing-club")
        }

        val result = request.resolveClubContext(useCase)

        assertThat(result.supplied).isTrue()
        assertThat(result.source).isEqualTo(ClubContextSource.SLUG)
        assertThat(result.context).isNull()
    }

    @Test
    fun `host header with successful lookup yields HOST_FALLBACK source and non-null context`() {
        val resolved = sampleResolvedContext(slug = "reading-sai", hostname = "readmates.example.test")
        val useCase = StubResolveClubContextUseCase(
            byHost = mapOf("readmates.example.test" to resolved),
        )
        val request = MockHttpServletRequest().apply {
            addHeader(ClubContextHeader.CLUB_HOST, "readmates.example.test")
        }

        val result = request.resolveClubContext(useCase)

        assertThat(result.supplied).isTrue()
        assertThat(result.source).isEqualTo(ClubContextSource.HOST_FALLBACK)
        assertThat(result.context).isEqualTo(resolved)
    }

    @Test
    fun `host header with no matching club yields HOST_FALLBACK source and null context`() {
        val useCase = StubResolveClubContextUseCase()
        val request = MockHttpServletRequest().apply {
            addHeader(ClubContextHeader.CLUB_HOST, "unregistered.example.test")
        }

        val result = request.resolveClubContext(useCase)

        assertThat(result.supplied).isTrue()
        assertThat(result.source).isEqualTo(ClubContextSource.HOST_FALLBACK)
        assertThat(result.context).isNull()
    }

    @Test
    fun `no club headers yields NONE source and not supplied`() {
        val useCase = StubResolveClubContextUseCase()
        val request = MockHttpServletRequest()

        val result = request.resolveClubContext(useCase)

        assertThat(result.supplied).isFalse()
        assertThat(result.source).isEqualTo(ClubContextSource.NONE)
        assertThat(result.context).isNull()
    }

    @Test
    fun `slug header wins over host header when both are present`() {
        val slugResolved = sampleResolvedContext(slug = "reading-sai")
        val hostResolved = sampleResolvedContext(slug = "other-club", hostname = "other.example.test")
        val useCase = StubResolveClubContextUseCase(
            bySlug = mapOf("reading-sai" to slugResolved),
            byHost = mapOf("other.example.test" to hostResolved),
        )
        val request = MockHttpServletRequest().apply {
            addHeader(ClubContextHeader.CLUB_SLUG, "reading-sai")
            addHeader(ClubContextHeader.CLUB_HOST, "other.example.test")
        }

        val result = request.resolveClubContext(useCase)

        assertThat(result.supplied).isTrue()
        assertThat(result.source).isEqualTo(ClubContextSource.SLUG)
        assertThat(result.context).isEqualTo(slugResolved)
        // Sanity: the host stub would have returned a different club; slug branch must short-circuit.
        assertThat(result.context?.slug).isEqualTo("reading-sai")
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

        override fun resolveByHost(host: String?): ResolvedClubContext? = host?.let { byHost[it] }
    }
}
