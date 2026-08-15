@file:Suppress("ktlint:standard:package-name")

package com.readmates.auth.adapter.`in`.security

import com.readmates.club.application.model.ResolvedClubContext
import jakarta.servlet.http.HttpServletRequest
import com.readmates.club.application.port.`in`.ResolveClubContextUseCase as ClubContextUseCase

object AuthClubContextHeader {
    const val CLUB_HOST = "X-Readmates-Club-Host"
    const val CLUB_SLUG = "X-Readmates-Club-Slug"
}

enum class AuthClubContextSource {
    SLUG,
    HOST_FALLBACK,
    NONE,
}

data class RequestedAuthClubContext(
    val supplied: Boolean,
    val source: AuthClubContextSource,
    val context: ResolvedClubContext?,
)

fun HttpServletRequest.resolveAuthClubContext(resolveClubContextUseCase: ClubContextUseCase): RequestedAuthClubContext {
    val slug = getHeader(AuthClubContextHeader.CLUB_SLUG)?.trim()?.takeIf { it.isNotEmpty() }
    if (slug != null) {
        return RequestedAuthClubContext(
            supplied = true,
            source = AuthClubContextSource.SLUG,
            context = resolveClubContextUseCase.resolveBySlug(slug),
        )
    }

    val host = getHeader(AuthClubContextHeader.CLUB_HOST)?.trim()?.takeIf { it.isNotEmpty() }
    return if (host != null) {
        RequestedAuthClubContext(
            supplied = true,
            source = AuthClubContextSource.HOST_FALLBACK,
            context = resolveClubContextUseCase.resolveByHost(host),
        )
    } else {
        RequestedAuthClubContext(
            supplied = false,
            source = AuthClubContextSource.NONE,
            context = null,
        )
    }
}
