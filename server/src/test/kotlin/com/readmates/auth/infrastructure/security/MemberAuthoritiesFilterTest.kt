package com.readmates.auth.infrastructure.security

import com.readmates.auth.application.port.out.MemberIdentityLookupPort
import com.readmates.auth.application.port.out.MemberProfileStorePort
import com.readmates.auth.application.service.AuthenticatedMemberResolver
import com.readmates.auth.application.service.DefaultAuthoritySynthesisService
import com.readmates.auth.domain.MembershipStatus
import com.readmates.club.adapter.`in`.web.ClubContextHeader
import com.readmates.club.application.model.JoinedClubSummary
import com.readmates.club.application.model.ResolvedClubContext
import com.readmates.club.application.port.`in`.CheckSupportAccessGrantUseCase
import com.readmates.club.application.port.`in`.ResolveClubContextUseCase
import com.readmates.club.application.port.`in`.SupportMemberSynthesis
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.CurrentUser
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.mock.web.MockFilterChain
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.core.context.SecurityContextHolder
import java.util.UUID

/**
 * Unit tests for [MemberAuthoritiesFilter] that pin the intended behavior of the
 * null-context branch (`supplied=true && context==null`).
 *
 * These tests operate entirely in-process using fake collaborators: no Spring context
 * is loaded and no database is required.
 */
class MemberAuthoritiesFilterTest {

    private val userId = UUID.fromString("00000000-0000-0000-0000-000000000001")
    private val email = "admin@example.com"

    @AfterEach
    fun clearSecurityContext() {
        SecurityContextHolder.clearContext()
    }

    // ---------------------------------------------------------------------------
    // Scenario 1: SLUG supplied, unknown club (context=null), platform admin user
    // ---------------------------------------------------------------------------

    /**
     * When a slug is supplied but the club is not registered (context=null),
     * a platform admin's `ROLE_PLATFORM_ADMIN` authority must be preserved and
     * no member-role authority (`ROLE_HOST`, `ROLE_MEMBER`, `ROLE_VIEWER`) must be added.
     *
     * The synthesis path is guarded by `context != null`, so it cannot fire here.
     */
    @Test
    fun `slug supplied with unknown club assigns platform admin grant only`() {
        val filter = filterWith(resolveBySlug = { null }, synthesize = { null })

        val request = requestWithSlugHeader("unknown-club")
        setAuthentication(email, userId, authorities = listOf("ROLE_PLATFORM_ADMIN", "ROLE_USER"))

        filter.doFilter(request, MockHttpServletResponse(), MockFilterChain())

        val authorities = currentAuthorities()
        assertTrue(authorities.contains("ROLE_PLATFORM_ADMIN")) {
            "Expected ROLE_PLATFORM_ADMIN to be preserved; got $authorities"
        }
        assertTrue(authorities.contains("ROLE_USER")) {
            "Expected ROLE_USER baseline to be preserved; got $authorities"
        }
        assertFalse(authorities.contains("ROLE_HOST")) {
            "ROLE_HOST must not be added when club context is null; got $authorities"
        }
        assertFalse(authorities.contains("ROLE_MEMBER")) {
            "ROLE_MEMBER must not be added when club context is null; got $authorities"
        }
    }

    // ---------------------------------------------------------------------------
    // Scenario 2: SLUG supplied, unknown club (context=null), host-support grant preserved
    // ---------------------------------------------------------------------------

    /**
     * When `context=null` and the user already holds `ROLE_PLATFORM_ADMIN` (the authority
     * that underpins host-support access), that authority passes through the filter unchanged.
     *
     * The synthesis branch (`synthesizeHostCurrentMember`) is gated on `context != null` and
     * therefore cannot execute here; no `ROLE_HOST` is synthesised from a DB grant.
     * Instead, the pre-existing platform-admin authority survives untouched.
     */
    @Test
    fun `slug supplied with unknown club preserves platform admin host-support authority`() {
        val filter = filterWith(resolveBySlug = { null }, synthesize = { null })

        val request = requestWithSlugHeader("unknown-club")
        // The "host support grant" capability is signalled by ROLE_PLATFORM_ADMIN —
        // it is not in MEMBER_ROLE_AUTHORITIES, so it must survive the filter unmodified.
        setAuthentication(email, userId, authorities = listOf("ROLE_PLATFORM_ADMIN"))

        filter.doFilter(request, MockHttpServletResponse(), MockFilterChain())

        val authorities = currentAuthorities()
        assertTrue(authorities.contains("ROLE_PLATFORM_ADMIN")) {
            "Expected ROLE_PLATFORM_ADMIN (host-support grant authority) to be preserved; got $authorities"
        }
        assertFalse(authorities.contains("ROLE_HOST")) {
            "ROLE_HOST must not be synthesised when context is null; got $authorities"
        }
    }

    // ---------------------------------------------------------------------------
    // Scenario 3: SLUG supplied, unknown club (context=null), regular user
    // ---------------------------------------------------------------------------

    /**
     * A regular user (no grants, no admin role) hitting an unknown club slug gets no
     * club-specific authorities added. Their member-role authorities, if any exist,
     * are stripped by the filter; no new ones are synthesised.
     */
    @Test
    fun `slug supplied with unknown club assigns no club authorities for regular user`() {
        val filter = filterWith(resolveBySlug = { null }, synthesize = { null })

        val request = requestWithSlugHeader("unknown-club")
        // Regular user — has only ROLE_USER, no admin or member-role grants
        setAuthentication(email, userId, authorities = listOf("ROLE_USER"))

        filter.doFilter(request, MockHttpServletResponse(), MockFilterChain())

        val authorities = currentAuthorities()
        assertFalse(authorities.contains("ROLE_HOST")) {
            "ROLE_HOST must not be added for a regular user with null context; got $authorities"
        }
        assertFalse(authorities.contains("ROLE_MEMBER")) {
            "ROLE_MEMBER must not be added for a regular user with null context; got $authorities"
        }
        assertFalse(authorities.contains("ROLE_VIEWER")) {
            "ROLE_VIEWER must not be added for a regular user with null context; got $authorities"
        }
        assertTrue(authorities.contains("ROLE_USER")) {
            "Expected baseline ROLE_USER to be preserved; got $authorities"
        }
    }

    // ---------------------------------------------------------------------------
    // Scenario 4: HOST_FALLBACK source, unknown host → unscoped principal
    // ---------------------------------------------------------------------------

    /**
     * When the club context is supplied via the host header but the host is not registered
     * (`source=HOST_FALLBACK, context=null`), the filter must NOT add any club-specific
     * authority. `member` is resolved through the normal else-branch which calls
     * `resolveByEmail(email, null)` — returning null when no legacy membership exists —
     * and the synthesis branch is guarded by `context != null`.
     *
     * Result: authentication is "unscoped" — only baseline non-member-role authorities remain.
     */
    @Test
    fun `host fallback with unknown host yields unscoped principal`() {
        val filter = filterWith(resolveBySlug = { null }, synthesize = { null })

        val request = requestWithHostHeader("unknown.example.com")
        setAuthentication(email, userId, authorities = listOf("ROLE_USER"))

        filter.doFilter(request, MockHttpServletResponse(), MockFilterChain())

        val authorities = currentAuthorities()
        assertFalse(authorities.contains("ROLE_HOST")) {
            "ROLE_HOST must not be added when host is unknown; got $authorities"
        }
        assertFalse(authorities.contains("ROLE_MEMBER")) {
            "ROLE_MEMBER must not be added when host is unknown; got $authorities"
        }
        assertTrue(authorities.contains("ROLE_USER")) {
            "Expected baseline ROLE_USER to survive for host-fallback with unknown host; got $authorities"
        }
    }

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    private fun filterWith(
        resolveBySlug: (String) -> ResolvedClubContext?,
        synthesize: (UUID) -> SupportMemberSynthesis?,
    ): MemberAuthoritiesFilter {
        val fakeClubContextUseCase = object : ResolveClubContextUseCase {
            override fun resolveBySlug(slug: String): ResolvedClubContext? = resolveBySlug(slug)
            override fun resolveByHost(host: String?): ResolvedClubContext? = null
        }
        val fakeAuthenticatedMemberResolver = AuthenticatedMemberResolver(
            memberIdentityLookup = NoOpMemberIdentityLookupPort(),
            memberProfileStore = NoOpMemberProfileStorePort(),
        )
        val fakeSupportGrantUseCase = object : CheckSupportAccessGrantUseCase {
            override fun synthesizeHostCurrentMember(
                userId: UUID,
                email: String,
                clubId: UUID,
                clubSlug: String,
                clubName: String,
            ): SupportMemberSynthesis? = synthesize(userId)
        }
        return MemberAuthoritiesFilter(
            authoritySynthesisService = DefaultAuthoritySynthesisService(),
            authenticatedMemberResolver = fakeAuthenticatedMemberResolver,
            resolveClubContextUseCase = fakeClubContextUseCase,
            checkSupportAccessGrantUseCase = fakeSupportGrantUseCase,
        )
    }

    private fun requestWithSlugHeader(slug: String): MockHttpServletRequest =
        MockHttpServletRequest("GET", "/api/host/sessions").apply {
            addHeader(ClubContextHeader.CLUB_SLUG, slug)
        }

    private fun requestWithHostHeader(host: String): MockHttpServletRequest =
        MockHttpServletRequest("GET", "/api/host/sessions").apply {
            addHeader(ClubContextHeader.CLUB_HOST, host)
        }

    private fun setAuthentication(email: String, userId: UUID, authorities: List<String>) {
        val principal = CurrentUser(userId = userId, email = email)
        val grantedAuthorities = authorities.map { SimpleGrantedAuthority(it) }
        val authentication = UsernamePasswordAuthenticationToken(principal, null, grantedAuthorities)
        SecurityContextHolder.getContext().authentication = authentication
    }

    private fun currentAuthorities(): Set<String> =
        SecurityContextHolder.getContext().authentication
            ?.authorities
            ?.mapNotNull { it.authority }
            ?.toSet()
            ?: emptySet()

    /**
     * A no-op account store that never finds any membership.
     * Used to ensure the filter's member-lookup step returns null.
     */
    private class NoOpMemberIdentityLookupPort : MemberIdentityLookupPort {
        override fun findActiveMemberByEmail(email: String): CurrentMember? = null
        override fun findActiveMemberByUserId(userId: String): CurrentMember? = null
        override fun findMemberByUserIdAndClubId(userId: UUID, clubId: UUID): CurrentMember? = null
        override fun findMemberByEmailAndClubId(email: String, clubId: UUID): CurrentMember? = null
        override fun findMemberByUserIdIncludingViewer(userId: UUID): CurrentMember? = null
        override fun findAnyUserIdByEmail(email: String): UUID? = null
        override fun findUserById(userId: UUID): CurrentUser? = null
        override fun findMembershipStatusByUserId(userId: UUID): MembershipStatus? = null
        override fun listJoinedClubs(userId: UUID): List<JoinedClubSummary> = emptyList()
    }

    /**
     * A no-op profile store that never finds any profile.
     */
    private class NoOpMemberProfileStorePort : MemberProfileStorePort {
        override fun findProfileMemberByEmail(email: String) = null
        override fun findProfileMemberByUserId(userId: UUID) = null
        override fun findProfileMemberInClubForUpdate(clubId: UUID, membershipId: UUID) = null
        override fun lockClubProfileNames(clubId: UUID): Boolean = false
        override fun displayNameExistsInClub(clubId: UUID, displayName: String, excludingMembershipId: UUID): Boolean = false
        override fun updateOwnDisplayName(clubId: UUID, membershipId: UUID, displayName: String): Boolean = false
        override fun updateDisplayName(clubId: UUID, membershipId: UUID, displayName: String): Boolean = false
        override fun findHostMemberListItem(clubId: UUID, membershipId: UUID) = null
    }
}
