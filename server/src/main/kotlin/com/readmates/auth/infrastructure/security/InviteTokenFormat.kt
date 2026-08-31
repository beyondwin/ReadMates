package com.readmates.auth.infrastructure.security

enum class InviteTokenKind { EMAIL, NAMED_LINK }

data class ParsedInviteToken(
    val value: String,
    val kind: InviteTokenKind,
)

object InviteTokenFormat {
    private val legacyPattern = Regex("^[A-Za-z0-9_-]{43,128}$")
    private val namedPattern = Regex("^lnk_[A-Za-z0-9_-]{43}$")

    fun parse(rawToken: String?): ParsedInviteToken? {
        val value = rawToken?.trim() ?: return null
        return when {
            namedPattern.matches(value) -> ParsedInviteToken(value, InviteTokenKind.NAMED_LINK)
            legacyPattern.matches(value) && !value.startsWith("lnk_") -> ParsedInviteToken(value, InviteTokenKind.EMAIL)
            else -> null
        }
    }

    fun normalize(rawToken: String?): String? = parse(rawToken)?.value
}
