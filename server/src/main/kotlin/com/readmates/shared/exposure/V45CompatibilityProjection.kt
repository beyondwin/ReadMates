package com.readmates.shared.exposure

data class V45CompatibilityProjection(
    val sessionVisibility: String,
    val publicationVisibility: String,
    val isPublic: Boolean,
)

fun v45CompatibilityProjection(
    state: String,
    accessScope: String,
    siteVisibility: String,
): V45CompatibilityProjection {
    require(accessScope in setOf("HOST_ONLY", "GUEST_READABLE"))
    require(siteVisibility in setOf("HIDDEN", "PUBLIC_RECORD"))
    require(!(accessScope == "HOST_ONLY" && siteVisibility == "PUBLIC_RECORD"))
    require(siteVisibility != "PUBLIC_RECORD" || state in setOf("CLOSED", "PUBLISHED"))
    return when {
        accessScope == "HOST_ONLY" ->
            V45CompatibilityProjection(
                sessionVisibility = if (state == "PUBLISHED") "MEMBER" else "HOST_ONLY",
                publicationVisibility = "MEMBER",
                isPublic = false,
            )
        siteVisibility == "PUBLIC_RECORD" -> V45CompatibilityProjection("PUBLIC", "PUBLIC", true)
        else -> V45CompatibilityProjection("MEMBER", "MEMBER", false)
    }
}
