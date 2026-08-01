package com.readmates.auth.infrastructure.security

import com.readmates.club.application.model.ClubSlug
import java.util.Locale

object OAuthGuestJoinSession {
    const val CLUB_SLUG_ATTRIBUTE = "READMATES_OAUTH_GUEST_JOIN_CLUB_SLUG"

    fun normalize(rawValue: String?): String? =
        rawValue
            ?.trim()
            ?.lowercase(Locale.ROOT)
            ?.takeIf { it.isNotEmpty() }
            ?.let { runCatching { ClubSlug.parse(it).value }.getOrNull() }
}
