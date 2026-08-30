package com.readmates.auth.application.model

import com.readmates.shared.security.CurrentPlatformAdmin
import java.util.UUID

enum class ProductSpaceKind {
    PLATFORM,
    CLUBS,
}

enum class ClubPerspective {
    MEMBER,
    HOST,
}

data class AvailableClubSpace(
    val clubId: UUID,
    val clubSlug: String,
    val clubName: String,
    val perspectives: List<ClubPerspective>,
)

data class AvailableSpacesV1(
    val version: Int = 1,
    val kinds: List<ProductSpaceKind>,
    val clubs: List<AvailableClubSpace>,
)

data class RecommendedSpace(
    val kind: ProductSpaceKind,
    val clubId: UUID? = null,
    val perspective: ClubPerspective? = null,
)

data class AuthAccessProjection(
    val joinedClubs: List<JoinedClubSummary>,
    val platformAdmin: CurrentPlatformAdmin?,
    val availableSpaces: AvailableSpacesV1,
    val recommendedSpace: RecommendedSpace?,
)
