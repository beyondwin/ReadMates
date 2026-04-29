package com.readmates.auth.adapter.`in`.web

import com.readmates.auth.application.port.`in`.ResolveCurrentMemberUseCase
import com.readmates.club.adapter.`in`.web.ClubContextHeader
import com.readmates.club.application.model.ResolvedClubContext
import com.readmates.club.application.port.`in`.ResolveClubContextUseCase
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.CurrentUser
import com.readmates.shared.security.emailOrNull
import jakarta.servlet.http.HttpServletRequest
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api/auth/me")
class AuthMeController(
    private val resolveCurrentMemberUseCase: ResolveCurrentMemberUseCase,
    private val resolveClubContextUseCase: ResolveClubContextUseCase,
) {
    @GetMapping
    fun me(authentication: Authentication?, request: HttpServletRequest): AuthMemberResponse {
        val sessionProfileMember = authentication?.principal as? CurrentMember
        val sessionUser = authentication?.principal as? CurrentUser
        val requestedClubContext = request.resolveRequestedClubContext()
        if (sessionProfileMember != null) {
            val joinedClubs = resolveCurrentMemberUseCase.listJoinedClubs(sessionProfileMember.userId)
            val platformAdmin = resolveCurrentMemberUseCase.findPlatformAdmin(sessionProfileMember.userId)
            val requestedMember = requestedClubContext.context
                ?.let { context -> resolveCurrentMemberUseCase.resolveByUserAndClub(sessionProfileMember.userId, context.clubId) }
            if (requestedClubContext.supplied && requestedMember == null) {
                return AuthMemberResponse.authenticatedUser(
                    userId = sessionProfileMember.userId,
                    email = sessionProfileMember.email,
                    joinedClubs = joinedClubs,
                    platformAdmin = platformAdmin,
                )
            }
            return AuthMemberResponse.from(
                requestedMember ?: sessionProfileMember,
                joinedClubs = joinedClubs,
                platformAdmin = platformAdmin,
            )
        }
        if (sessionUser != null) {
            return AuthMemberResponse.authenticatedUser(
                userId = sessionUser.userId,
                email = sessionUser.email,
                joinedClubs = resolveCurrentMemberUseCase.listJoinedClubs(sessionUser.userId),
                platformAdmin = resolveCurrentMemberUseCase.findPlatformAdmin(sessionUser.userId),
            )
        }

        val email = authentication.emailOrNull()
        if (email != null && requestedClubContext.supplied) {
            val userId = resolveCurrentMemberUseCase.findUserIdByEmail(email)
                ?: return AuthMemberResponse.anonymous(email)
            val requestedMember = requestedClubContext.context
                ?.let { context -> resolveCurrentMemberUseCase.resolveByEmailAndClub(email, context.clubId) }
            if (requestedMember == null) {
                return authenticatedWithoutMembership(email, userId)
            }
            return AuthMemberResponse.from(
                requestedMember,
                joinedClubs = resolveCurrentMemberUseCase.listJoinedClubs(userId),
                platformAdmin = resolveCurrentMemberUseCase.findPlatformAdmin(userId),
            )
        }

        val member = email?.let(resolveCurrentMemberUseCase::resolveByEmail)
            ?: return authenticatedWithoutMembership(email)
        return AuthMemberResponse.from(
            member,
            joinedClubs = resolveCurrentMemberUseCase.listJoinedClubs(member.userId),
            platformAdmin = resolveCurrentMemberUseCase.findPlatformAdmin(member.userId),
        )
    }

    private fun authenticatedWithoutMembership(email: String?, knownUserId: UUID? = null): AuthMemberResponse {
        val resolvedEmail = email ?: return AuthMemberResponse.anonymous(null)
        val userId = knownUserId ?: email?.let(resolveCurrentMemberUseCase::findUserIdByEmail)
            ?: return AuthMemberResponse.anonymous(email)
        return AuthMemberResponse.authenticatedUser(
            userId = userId,
            email = resolvedEmail,
            joinedClubs = resolveCurrentMemberUseCase.listJoinedClubs(userId),
            platformAdmin = resolveCurrentMemberUseCase.findPlatformAdmin(userId),
        )
    }

    private fun HttpServletRequest.resolveRequestedClubContext(): RequestedClubContext {
        val slug = getHeader(ClubContextHeader.CLUB_SLUG)
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
        if (slug != null) {
            return RequestedClubContext(supplied = true, context = resolveClubContextUseCase.resolveBySlug(slug))
        }

        val host = getHeader(ClubContextHeader.CLUB_HOST)
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
        if (host != null) {
            return RequestedClubContext(supplied = true, context = resolveClubContextUseCase.resolveByHost(host))
        }

        return RequestedClubContext(supplied = false, context = null)
    }

    private data class RequestedClubContext(
        val supplied: Boolean,
        val context: ResolvedClubContext?,
    )
}
