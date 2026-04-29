package com.readmates.auth.adapter.`in`.security

import com.readmates.auth.application.port.`in`.ResolveCurrentMemberUseCase
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.club.application.model.JoinedClubSummary
import com.readmates.club.application.model.ResolvedClubContext
import com.readmates.club.application.port.`in`.ResolveClubContextUseCase
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.CurrentPlatformAdmin
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.core.MethodParameter
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.web.context.request.ServletWebRequest
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

class CurrentMemberArgumentResolverTest {
    private val legacyMember = CurrentMember(
        userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
        membershipId = UUID.fromString("00000000-0000-0000-0000-000000000201"),
        clubId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
        clubSlug = "reading-sai",
        email = "member@example.com",
        displayName = "멤버",
        accountName = "김멤버",
        role = MembershipRole.MEMBER,
        membershipStatus = MembershipStatus.ACTIVE,
    )
    private val sampleClubMember = legacyMember.copy(
        membershipId = UUID.fromString("00000000-0000-0000-0000-000000000202"),
        clubId = UUID.fromString("00000000-0000-0000-0000-000000000002"),
        clubSlug = "sample-book-club",
        displayName = "샘플멤버",
    )

    @Test
    fun `supports CurrentMember parameters`() {
        val resolver = CurrentMemberArgumentResolver(FakeResolveCurrentMemberUseCase(legacyMember), FakeResolveClubContextUseCase())
        val parameter = sampleMethodParameter("currentMemberEndpoint")

        assertTrue(resolver.supportsParameter(parameter))
    }

    @Test
    fun `does not support non CurrentMember parameters`() {
        val resolver = CurrentMemberArgumentResolver(FakeResolveCurrentMemberUseCase(legacyMember), FakeResolveClubContextUseCase())
        val parameter = sampleMethodParameter("stringEndpoint")

        assertFalse(resolver.supportsParameter(parameter))
    }

    @Test
    fun `resolves authenticated member from principal email`() {
        val resolveMembers = FakeResolveCurrentMemberUseCase(legacyMember)
        val resolver = CurrentMemberArgumentResolver(resolveMembers, FakeResolveClubContextUseCase())
        val request = MockHttpServletRequest()
        val authentication = UsernamePasswordAuthenticationToken("member@example.com", "password", emptyList())
        request.userPrincipal = authentication

        val resolved = resolver.resolveArgument(
            sampleMethodParameter("currentMemberEndpoint"),
            null,
            ServletWebRequest(request),
            null,
        )

        assertEquals(legacyMember, resolved)
        assertEquals(1, resolveMembers.legacyEmailLookups)
    }

    @Test
    fun `resolves by club slug header before legacy email lookup`() {
        val resolveMembers = FakeResolveCurrentMemberUseCase(legacyMember, sampleClubMember)
        val resolver = CurrentMemberArgumentResolver(resolveMembers, FakeResolveClubContextUseCase())
        val request = MockHttpServletRequest()
        val authentication = UsernamePasswordAuthenticationToken("member@example.com", "password", emptyList())
        request.userPrincipal = authentication
        request.addHeader("X-Readmates-Club-Slug", "sample-book-club")

        val resolved = resolver.resolveArgument(
            sampleMethodParameter("currentMemberEndpoint"),
            null,
            ServletWebRequest(request),
            null,
        )

        assertEquals(sampleClubMember, resolved)
        assertEquals(0, resolveMembers.legacyEmailLookups)
    }

    @Test
    fun `rejects unresolved club slug without legacy email fallback`() {
        val resolveMembers = FakeResolveCurrentMemberUseCase(legacyMember, sampleClubMember)
        val resolver = CurrentMemberArgumentResolver(resolveMembers, FakeResolveClubContextUseCase())
        val request = MockHttpServletRequest()
        val authentication = UsernamePasswordAuthenticationToken("member@example.com", "password", emptyList())
        request.userPrincipal = authentication
        request.addHeader("X-Readmates-Club-Slug", "missing-club")

        assertThrows<ResponseStatusException> {
            resolver.resolveArgument(
                sampleMethodParameter("currentMemberEndpoint"),
                null,
                ServletWebRequest(request),
                null,
            )
        }
        assertEquals(0, resolveMembers.legacyEmailLookups)
    }

    private fun currentMemberEndpoint(member: CurrentMember) = member

    private fun stringEndpoint(value: String) = value

    private fun sampleMethodParameter(methodName: String): MethodParameter {
        val method = this::class.java.declaredMethods.first { it.name == methodName }
        return MethodParameter(method, 0)
    }

    private class FakeResolveCurrentMemberUseCase(
        private val member: CurrentMember?,
        private val clubMember: CurrentMember? = null,
    ) : ResolveCurrentMemberUseCase {
        var legacyEmailLookups = 0
            private set

        override fun resolveByEmail(email: String): CurrentMember? {
            legacyEmailLookups += 1
            return member
        }

        override fun findUserIdByEmail(email: String): UUID? = member?.userId

        override fun resolveByUserAndClub(userId: UUID, clubId: UUID): CurrentMember? = clubMember

        override fun resolveByEmailAndClub(email: String, clubId: UUID): CurrentMember? = clubMember

        override fun listJoinedClubs(userId: UUID): List<JoinedClubSummary> = emptyList()

        override fun findPlatformAdmin(userId: UUID): CurrentPlatformAdmin? = null
    }

    private class FakeResolveClubContextUseCase : ResolveClubContextUseCase {
        override fun resolveBySlug(slug: String): ResolvedClubContext? =
            if (slug == "sample-book-club") {
                ResolvedClubContext(
                    clubId = UUID.fromString("00000000-0000-0000-0000-000000000002"),
                    slug = "sample-book-club",
                    name = "Sample Book Club",
                    status = "ACTIVE",
                    hostname = null,
                )
            } else {
                null
            }

        override fun resolveByHost(host: String?): ResolvedClubContext? = null
    }
}
