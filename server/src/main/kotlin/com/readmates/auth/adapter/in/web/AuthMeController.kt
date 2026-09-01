package com.readmates.auth.adapter.`in`.web

import com.readmates.auth.adapter.`in`.security.AuthClubContextSource
import com.readmates.auth.adapter.`in`.security.resolveAuthClubContext
import com.readmates.auth.application.AuthApplicationError
import com.readmates.auth.application.AuthApplicationException
import com.readmates.auth.application.port.`in`.ResolveAuthAccessProjectionUseCase
import com.readmates.auth.application.port.`in`.ResolveCurrentMemberUseCase
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
    private val resolveAuthAccessProjectionUseCase: ResolveAuthAccessProjectionUseCase,
    private val resolveClubContextUseCase: ResolveClubContextUseCase,
) {
    @GetMapping
    fun me(
        authentication: Authentication?,
        request: HttpServletRequest,
    ): AuthMemberResponse {
        val sessionProfileMember = authentication?.principal as? CurrentMember
        val sessionUser = authentication?.principal as? CurrentUser
        val requestedClubContext = request.resolveAuthClubContext(resolveClubContextUseCase)
        if (sessionProfileMember != null) {
            val accessProjection = resolveAuthAccessProjectionUseCase.resolve(sessionProfileMember.userId)

            // Explicit slug supplied but the club is not registered → 404.
            if (
                requestedClubContext.source ==
                AuthClubContextSource.SLUG &&
                requestedClubContext.context == null
            ) {
                throw AuthApplicationException(
                    error = AuthApplicationError.CLUB_NOT_FOUND,
                    message = "Requested club slug is not registered",
                )
            }

            // BFF host header supplied but the host is not a registered club domain.
            // Treat as unscoped (matches dev where the host header is stripped).
            if (
                requestedClubContext.source ==
                AuthClubContextSource.HOST_FALLBACK &&
                requestedClubContext.context == null
            ) {
                return AuthMemberResponse.from(
                    sessionProfileMember,
                    accessProjection = accessProjection,
                )
            }

            val requestedMember =
                requestedClubContext.context
                    ?.let { context -> resolveCurrentMemberUseCase.resolveByUserAndClub(sessionProfileMember.userId, context.clubId) }
            if (requestedClubContext.supplied && requestedMember == null) {
                return AuthMemberResponse.authenticatedUser(
                    userId = sessionProfileMember.userId,
                    email = sessionProfileMember.email,
                    accessProjection = accessProjection,
                )
            }
            return AuthMemberResponse.from(
                requestedMember ?: sessionProfileMember,
                accessProjection = accessProjection,
            )
        }
        if (sessionUser != null) {
            return AuthMemberResponse.authenticatedUser(
                userId = sessionUser.userId,
                email = sessionUser.email,
                accessProjection = resolveAuthAccessProjectionUseCase.resolve(sessionUser.userId),
            )
        }

        val email = authentication.emailOrNull()
        if (email != null && requestedClubContext.supplied) {
            val userId =
                resolveCurrentMemberUseCase.findUserIdByEmail(email)
                    ?: return AuthMemberResponse.anonymous(email)
            val requestedMember =
                requestedClubContext.context
                    ?.let { context -> resolveCurrentMemberUseCase.resolveByEmailAndClub(email, context.clubId) }
            if (requestedMember == null) {
                return authenticatedWithoutMembership(email, userId)
            }
            return AuthMemberResponse.from(
                requestedMember,
                accessProjection = resolveAuthAccessProjectionUseCase.resolve(userId),
            )
        }

        val member =
            email?.let(resolveCurrentMemberUseCase::resolveByEmail)
                ?: return authenticatedWithoutMembership(email)
        return AuthMemberResponse.from(
            member,
            accessProjection = resolveAuthAccessProjectionUseCase.resolve(member.userId),
        )
    }

    private fun authenticatedWithoutMembership(
        email: String?,
        knownUserId: UUID? = null,
    ): AuthMemberResponse {
        val resolvedEmail = email ?: return AuthMemberResponse.anonymous(null)
        val userId =
            knownUserId ?: resolveCurrentMemberUseCase.findUserIdByEmail(resolvedEmail)
                ?: return AuthMemberResponse.anonymous(email)
        return AuthMemberResponse.authenticatedUser(
            userId = userId,
            email = resolvedEmail,
            accessProjection = resolveAuthAccessProjectionUseCase.resolve(userId),
        )
    }
}
