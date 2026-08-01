package com.readmates.session.domain

enum class SessionAccessScope {
    HOST_ONLY,
    GUEST_READABLE,
}

enum class PublicSiteVisibility {
    HIDDEN,
    PUBLIC_RECORD,
}

data class SessionExposure(
    val accessScope: SessionAccessScope,
    val siteVisibility: PublicSiteVisibility,
) {
    companion object {
        fun fromCompatibility(
            state: String,
            sessionVisibility: String,
            publicationVisibility: String?,
            isPublic: Boolean,
        ): SessionExposure {
            val access =
                if (sessionVisibility in setOf("MEMBER", "PUBLIC")) {
                    SessionAccessScope.GUEST_READABLE
                } else {
                    SessionAccessScope.HOST_ONLY
                }
            val publicSite =
                if (
                    state in setOf("CLOSED", "PUBLISHED") &&
                    access == SessionAccessScope.GUEST_READABLE &&
                    (publicationVisibility == "PUBLIC" || isPublic)
                ) {
                    PublicSiteVisibility.PUBLIC_RECORD
                } else {
                    PublicSiteVisibility.HIDDEN
                }
            return SessionExposure(access, publicSite)
        }
    }
}

data class CompatibilityExposure(
    val sessionVisibility: String,
    val publicationVisibility: String,
    val isPublic: Boolean,
)

fun SessionExposure.toCompatibility(state: String): CompatibilityExposure {
    require(!(accessScope == SessionAccessScope.HOST_ONLY && siteVisibility == PublicSiteVisibility.PUBLIC_RECORD))
    require(siteVisibility != PublicSiteVisibility.PUBLIC_RECORD || state in setOf("CLOSED", "PUBLISHED"))
    return when {
        accessScope == SessionAccessScope.HOST_ONLY -> CompatibilityExposure("HOST_ONLY", "MEMBER", false)
        siteVisibility == PublicSiteVisibility.PUBLIC_RECORD -> CompatibilityExposure("PUBLIC", "PUBLIC", true)
        else -> CompatibilityExposure("MEMBER", "MEMBER", false)
    }
}
