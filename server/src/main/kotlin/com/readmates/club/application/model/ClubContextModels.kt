package com.readmates.club.application.model

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.club.domain.PlatformAdminRole
import java.util.UUID

@JvmInline
value class ClubSlug private constructor(val value: String) {
    companion object {
        private val pattern = Regex("^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$")
        private val reserved = setOf(
            "admin",
            "api",
            "app",
            "auth",
            "login",
            "logout",
            "oauth2",
            "www",
            "mail",
            "support",
            "static",
            "assets",
            "pages",
            "readmates",
        )

        fun parse(raw: String): ClubSlug {
            val normalized = raw.trim()
            require(pattern.matches(normalized)) { "Invalid club slug" }
            require("--" !in normalized) { "Invalid club slug" }
            require(normalized !in reserved) { "Club slug is reserved" }
            return ClubSlug(normalized)
        }
    }
}

data class ResolvedClubContext(
    val clubId: UUID,
    val slug: String,
    val name: String,
    val status: String,
    val hostname: String?,
)

data class JoinedClubSummary(
    val clubId: UUID,
    val clubSlug: String,
    val clubName: String,
    val membershipId: UUID,
    val role: MembershipRole,
    val status: MembershipStatus,
    val primaryHost: String?,
)

data class PlatformAdminSummary(
    val userId: UUID,
    val role: PlatformAdminRole,
)
