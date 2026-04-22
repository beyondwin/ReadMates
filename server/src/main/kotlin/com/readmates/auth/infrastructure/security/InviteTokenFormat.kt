package com.readmates.auth.infrastructure.security

object InviteTokenFormat {
    private val pattern = Regex("^[A-Za-z0-9_-]{43,}$")

    fun normalize(rawToken: String?): String? =
        rawToken
            ?.trim()
            ?.takeIf { pattern.matches(it) }
}
