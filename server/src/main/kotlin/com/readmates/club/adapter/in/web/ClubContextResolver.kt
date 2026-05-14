package com.readmates.club.adapter.`in`.web

import com.readmates.club.application.model.ResolvedClubContext
import com.readmates.club.application.port.`in`.ResolveClubContextUseCase
import jakarta.servlet.http.HttpServletRequest

enum class ClubContextSource {
    SLUG,
    HOST_FALLBACK,
    NONE,
}

data class RequestedClubContext(
    val supplied: Boolean,
    val source: ClubContextSource,
    val context: ResolvedClubContext?,
)

fun HttpServletRequest.resolveClubContext(resolveClubContextUseCase: ResolveClubContextUseCase): RequestedClubContext {
    val slug =
        getHeader(ClubContextHeader.CLUB_SLUG)
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
    if (slug != null) {
        return RequestedClubContext(
            supplied = true,
            source = ClubContextSource.SLUG,
            context = resolveClubContextUseCase.resolveBySlug(slug),
        )
    }

    val host =
        getHeader(ClubContextHeader.CLUB_HOST)
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
    if (host != null) {
        return RequestedClubContext(
            supplied = true,
            source = ClubContextSource.HOST_FALLBACK,
            context = resolveClubContextUseCase.resolveByHost(host),
        )
    }

    return RequestedClubContext(
        supplied = false,
        source = ClubContextSource.NONE,
        context = null,
    )
}
