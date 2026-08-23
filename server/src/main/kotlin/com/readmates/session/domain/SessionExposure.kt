package com.readmates.session.domain

import com.readmates.shared.exposure.v45CompatibilityProjection

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
    val projection = v45CompatibilityProjection(state, accessScope.name, siteVisibility.name)
    return CompatibilityExposure(
        projection.sessionVisibility,
        projection.publicationVisibility,
        projection.isPublic,
    )
}
