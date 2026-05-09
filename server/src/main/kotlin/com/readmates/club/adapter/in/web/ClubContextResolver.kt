package com.readmates.club.adapter.`in`.web

import com.readmates.club.application.model.ResolvedClubContext
import com.readmates.club.application.port.`in`.ResolveClubContextUseCase
import jakarta.servlet.http.HttpServletRequest

data class RequestedClubContext(
    val supplied: Boolean,
    val context: ResolvedClubContext?,
)

fun HttpServletRequest.resolveClubContext(resolveClubContextUseCase: ResolveClubContextUseCase): RequestedClubContext {
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
