package com.readmates.auth.infrastructure.security

import com.readmates.auth.adapter.`in`.security.AuthClubContextHeader
import com.readmates.auth.adapter.`in`.security.CurrentMemberArgumentResolver
import com.readmates.auth.application.model.AuthenticatedMemberSnapshot
import com.readmates.auth.application.model.JoinedClubSummary
import com.readmates.auth.application.port.`in`.ResolveAuthenticatedPrincipalUseCase
import com.readmates.auth.application.port.`in`.ResolveCurrentMemberUseCase
import com.readmates.auth.application.port.`in`.SynthesizeAuthoritiesUseCase
import com.readmates.auth.application.service.DefaultAuthoritySynthesisService
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.club.application.model.ResolvedClubContext
import com.readmates.club.application.port.`in`.CheckSupportAccessGrantUseCase
import com.readmates.club.application.port.`in`.ResolveClubContextUseCase
import com.readmates.club.application.port.`in`.SupportMemberSynthesis
import com.readmates.shared.security.ClubActor
import com.readmates.shared.security.ClubCapability
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.CurrentPlatformAdmin
import com.readmates.shared.security.CurrentUser
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Test
import org.springframework.core.MethodParameter
import org.springframework.mock.web.MockFilterChain
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.web.context.request.ServletWebRequest
import java.util.UUID

private typealias SupportSynthesisLookup = (UUID) -> SupportMemberSynthesis?

class MemberAuthoritiesFilterTest {
    private val userId = UUID.fromString("00000000-0000-0000-0000-000000000001")
    private val clubId = UUID.fromString("00000000-0000-0000-0000-000000000002")
    private val email = "member@example.com"
    private val knownClub =
        ResolvedClubContext(
            clubId = clubId,
            slug = "my-club",
            name = "My Club",
            status = "ACTIVE",
            hostname = null,
        )

    @AfterEach
    fun clearSecurityContext() {
        SecurityContextHolder.clearContext()
    }

    @Test
    fun `anonymous and no-email requests preserve their exact authorities`() {
        val filter = filterWith()

        filter.doFilter(MockHttpServletRequest(), MockHttpServletResponse(), MockFilterChain())

        assertEquals(emptySet<String>(), currentAuthorities())

        setAuthentication(" ", userId, setOf("ROLE_HOST", "ROLE_USER"))
        filter.doFilter(MockHttpServletRequest(), MockHttpServletResponse(), MockFilterChain())

        assertEquals(setOf("ROLE_HOST", "ROLE_USER"), currentAuthorities())
    }

    @Test
    fun `unknown supplied club removes stale member authorities`() {
        val filter = filterWith(resolveBySlug = { null })
        setAuthentication(email, userId, setOf("ROLE_USER", "ROLE_HOST"))

        filter.doFilter(requestWithSlug("unknown-club"), MockHttpServletResponse(), MockFilterChain())

        assertEquals(setOf("ROLE_USER"), currentAuthorities())
    }

    @Test
    fun `different-club membership does not receive a member authority`() {
        val filter =
            filterWith(
                resolveBySlug = { knownClub },
                resolveMember = { _, context ->
                    if (context?.clubId == clubId) null else activeMemberSnapshot()
                },
            )
        setAuthentication(email, userId, setOf("ROLE_MEMBER", "ROLE_USER"))

        filter.doFilter(requestWithSlug("my-club"), MockHttpServletResponse(), MockFilterChain())

        assertEquals(setOf("ROLE_USER"), currentAuthorities())
    }

    @Test
    fun `platform admin without support grant has no synthesized host authority`() {
        val filter = filterWith(resolveBySlug = { knownClub }, supportSynthesis = { null })
        setAuthentication(email, userId, setOf("ROLE_PLATFORM_ADMIN", "ROLE_HOST"))

        filter.doFilter(requestWithSlug("my-club"), MockHttpServletResponse(), MockFilterChain())

        assertEquals(setOf("ROLE_PLATFORM_ADMIN"), currentAuthorities())
    }

    @Test
    fun `platform admin with valid support grant gets exact host authority and request attribute`() {
        val supportSynthesis =
            SupportMemberSynthesis(
                membershipProxyId = UUID.fromString("00000000-0000-0000-0000-000000000003"),
                displayName = "Support Admin",
                accountName = "support-admin",
            )
        var supportLookups = 0
        val supportLookup: (UUID) -> SupportMemberSynthesis? = {
            supportLookups += 1
            supportSynthesis
        }
        val filter = filterWith(resolveBySlug = { knownClub }, supportSynthesis = supportLookup)
        val request = requestWithSlug("my-club")
        setAuthentication(email, userId, setOf("ROLE_PLATFORM_ADMIN"))

        filter.doFilter(request, MockHttpServletResponse(), MockFilterChain())

        assertEquals(setOf("ROLE_PLATFORM_ADMIN", "ROLE_HOST"), currentAuthorities())
        assertEquals(
            setOf("ROLE_HOST"),
            currentAuthorities().filterTo(mutableSetOf(), MEMBER_ROLE_AUTHORITIES::contains),
        )
        assertSame(
            supportSynthesis,
            request.getAttribute(CheckSupportAccessGrantUseCase.SUPPORT_SYNTHESIS_REQUEST_ATTR),
        )
        request.userPrincipal = SecurityContextHolder.getContext().authentication

        val resolved =
            supportCurrentMemberResolver(supportLookup).resolveArgument(
                sampleMethodParameter(),
                null,
                ServletWebRequest(request),
                null,
            )

        assertSame(
            supportSynthesis,
            request.getAttribute(CheckSupportAccessGrantUseCase.SUPPORT_SYNTHESIS_REQUEST_ATTR),
        )
        assertEquals(1, supportLookups)
        assertEquals(MembershipRole.HOST, resolved.role)
        assertEquals(MembershipStatus.ACTIVE, resolved.membershipStatus)
        assertEquals("ROLE_HOST", currentAuthorities().single(MEMBER_ROLE_AUTHORITIES::contains))
    }

    @Test
    fun `resolved member replaces stale incoming member role authority`() {
        val filter =
            filterWith(
                resolveBySlug = { knownClub },
                resolveMember = { _, _ -> activeMemberSnapshot(role = MembershipRole.MEMBER) },
            )
        setAuthentication(email, userId, setOf("ROLE_HOST", "ROLE_USER"))

        filter.doFilter(requestWithSlug("my-club"), MockHttpServletResponse(), MockFilterChain())

        assertEquals(setOf("ROLE_MEMBER", "ROLE_USER"), currentAuthorities())
    }

    private fun filterWith(
        resolveBySlug: (String) -> ResolvedClubContext? = { null },
        resolveMember: (String, ResolvedClubContext?) -> AuthenticatedMemberSnapshot? = { _, _ -> null },
        supportSynthesis: (UUID) -> SupportMemberSynthesis? = { null },
    ): MemberAuthoritiesFilter {
        val resolveAuthenticatedPrincipalUseCase =
            object : ResolveAuthenticatedPrincipalUseCase {
                override fun resolveByEmail(
                    email: String?,
                    clubContext: ResolvedClubContext?,
                ): AuthenticatedMemberSnapshot? = resolveMember(email.orEmpty(), clubContext)

                override fun resolveByUserId(
                    userId: String,
                    clubContext: ResolvedClubContext?,
                ): AuthenticatedMemberSnapshot? = null

                override fun resolveProfileByUserId(userId: String): AuthenticatedMemberSnapshot? = null

                override fun resolveUserById(userId: String): CurrentUser? = null
            }
        val synthesizeAuthoritiesUseCase: SynthesizeAuthoritiesUseCase = DefaultAuthoritySynthesisService()
        val resolveClubContextUseCase =
            object : ResolveClubContextUseCase {
                override fun resolveBySlug(slug: String): ResolvedClubContext? = resolveBySlug(slug)

                override fun resolveByHost(host: String?): ResolvedClubContext? = null
            }
        val checkSupportAccessGrantUseCase =
            object : CheckSupportAccessGrantUseCase {
                override fun synthesizeHostCurrentMember(
                    userId: UUID,
                    email: String,
                    clubId: UUID,
                    clubSlug: String,
                    clubName: String,
                ): SupportMemberSynthesis? = supportSynthesis(userId)
            }

        return MemberAuthoritiesFilter(
            synthesizeAuthoritiesUseCase,
            resolveAuthenticatedPrincipalUseCase,
            resolveClubContextUseCase,
            checkSupportAccessGrantUseCase,
        )
    }

    private fun activeMemberSnapshot(role: MembershipRole = MembershipRole.HOST) =
        AuthenticatedMemberSnapshot(
            actor =
                ClubActor(
                    userId = userId,
                    membershipId = UUID.fromString("00000000-0000-0000-0000-000000000004"),
                    clubId = clubId,
                    clubSlug = knownClub.slug,
                    capabilities =
                        if (role == MembershipRole.HOST) {
                            setOf(
                                ClubCapability.BROWSE_MEMBER_CONTENT,
                                ClubCapability.EDIT_OWN_PROFILE,
                                ClubCapability.MANAGE_INVITATIONS,
                                ClubCapability.MANAGE_MEMBERS,
                            )
                        } else {
                            setOf(ClubCapability.BROWSE_MEMBER_CONTENT, ClubCapability.EDIT_OWN_PROFILE)
                        },
                ),
            email = email,
            displayName = "Member",
            accountName = "member",
            clubName = knownClub.name,
            avatarKey = "mushroom-green-book",
            role = role,
            membershipStatus = MembershipStatus.ACTIVE,
        )

    private fun supportCurrentMemberResolver(supportSynthesis: SupportSynthesisLookup): CurrentMemberArgumentResolver {
        val resolveCurrentMemberUseCase =
            object : ResolveCurrentMemberUseCase {
                override fun resolveByEmail(email: String): CurrentMember? = null

                override fun findUserIdByEmail(email: String): UUID? = userId

                override fun resolveByUserAndClub(
                    userId: UUID,
                    clubId: UUID,
                ): CurrentMember? = null

                override fun resolveByEmailAndClub(
                    email: String,
                    clubId: UUID,
                ): CurrentMember? = null

                override fun listJoinedClubs(userId: UUID): List<JoinedClubSummary> = emptyList()

                override fun findPlatformAdmin(userId: UUID): CurrentPlatformAdmin? = null
            }
        val supportAccess =
            object : CheckSupportAccessGrantUseCase {
                override fun synthesizeHostCurrentMember(
                    userId: UUID,
                    email: String,
                    clubId: UUID,
                    clubSlug: String,
                    clubName: String,
                ): SupportMemberSynthesis? = supportSynthesis(userId)
            }
        return CurrentMemberArgumentResolver(
            resolveCurrentMemberUseCase,
            knownClubContextUseCase(),
            supportAccess,
        )
    }

    private fun knownClubContextUseCase(): ResolveClubContextUseCase =
        object : ResolveClubContextUseCase {
            override fun resolveBySlug(slug: String): ResolvedClubContext? = knownClub.takeIf { slug == it.slug }

            override fun resolveByHost(host: String?): ResolvedClubContext? = null
        }

    private fun currentMemberEndpoint(member: CurrentMember) = member

    private fun sampleMethodParameter(): MethodParameter {
        val method = this::class.java.declaredMethods.first { it.name == "currentMemberEndpoint" }
        return MethodParameter(method, 0)
    }

    private fun requestWithSlug(slug: String) =
        MockHttpServletRequest("GET", "/api/host/sessions").apply {
            addHeader(AuthClubContextHeader.CLUB_SLUG, slug)
        }

    private fun setAuthentication(
        email: String,
        userId: UUID,
        authorities: Set<String>,
    ) {
        SecurityContextHolder.getContext().authentication =
            UsernamePasswordAuthenticationToken(
                CurrentUser(userId = userId, email = email),
                null,
                authorities.map(::SimpleGrantedAuthority),
            )
    }

    private fun currentAuthorities(): Set<String> =
        SecurityContextHolder
            .getContext()
            .authentication
            ?.authorities
            ?.mapNotNull { it.authority }
            ?.toSet()
            ?: emptySet()

    private companion object {
        val MEMBER_ROLE_AUTHORITIES = setOf("ROLE_HOST", "ROLE_MEMBER", "ROLE_VIEWER")
    }
}
