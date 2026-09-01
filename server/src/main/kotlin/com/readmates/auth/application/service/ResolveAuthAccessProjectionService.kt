package com.readmates.auth.application.service

import com.readmates.auth.application.model.AuthAccessProjection
import com.readmates.auth.application.model.AvailableClubSpace
import com.readmates.auth.application.model.AvailableSpacesV1
import com.readmates.auth.application.model.ClubPerspective
import com.readmates.auth.application.model.JoinedClubSummary
import com.readmates.auth.application.model.ProductSpaceKind
import com.readmates.auth.application.model.RecommendedSpace
import com.readmates.auth.application.port.`in`.ResolveAuthAccessProjectionUseCase
import com.readmates.auth.application.port.out.MemberIdentityLookupPort
import com.readmates.auth.application.port.out.PlatformAdminLookupPort
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class ResolveAuthAccessProjectionService(
    private val memberIdentityLookup: MemberIdentityLookupPort,
    private val platformAdminLookup: PlatformAdminLookupPort,
) : ResolveAuthAccessProjectionUseCase {
    override fun resolve(userId: UUID): AuthAccessProjection {
        val joinedClubs = memberIdentityLookup.listJoinedClubs(userId)
        val platformAdmin = platformAdminLookup.findPlatformAdmin(userId)
        val clubs = availableClubs(joinedClubs)
        val kinds =
            buildList {
                if (platformAdmin != null) {
                    add(ProductSpaceKind.PLATFORM)
                }
                if (clubs.isNotEmpty()) {
                    add(ProductSpaceKind.CLUBS)
                }
            }
        val recommendedSpace =
            when {
                platformAdmin != null -> RecommendedSpace(ProductSpaceKind.PLATFORM)
                clubs.size == 1 ->
                    RecommendedSpace(
                        kind = ProductSpaceKind.CLUBS,
                        clubId = clubs.single().clubId,
                        perspective = ClubPerspective.MEMBER,
                    )
                else -> null
            }

        return AuthAccessProjection(
            joinedClubs = joinedClubs,
            platformAdmin = platformAdmin,
            availableSpaces = AvailableSpacesV1(kinds = kinds, clubs = clubs),
            recommendedSpace = recommendedSpace,
        )
    }

    private fun availableClubs(joinedClubs: List<JoinedClubSummary>): List<AvailableClubSpace> {
        val clubsById = linkedMapOf<UUID, ClubSpaceAccumulator>()

        joinedClubs
            .filter { it.status in READABLE_MEMBERSHIP_STATUSES }
            .forEach { club ->
                val accumulator =
                    clubsById.getOrPut(club.clubId) {
                        ClubSpaceAccumulator(club.clubSlug, club.clubName)
                    }
                accumulator.perspectives += ClubPerspective.MEMBER
                if (club.role == MembershipRole.HOST && club.status == MembershipStatus.ACTIVE) {
                    accumulator.perspectives += ClubPerspective.HOST
                }
            }

        return clubsById.map { (clubId, club) ->
            AvailableClubSpace(
                clubId = clubId,
                clubSlug = club.slug,
                clubName = club.name,
                perspectives = PERSPECTIVE_WIRE_ORDER.filter { it in club.perspectives },
            )
        }
    }

    private class ClubSpaceAccumulator(
        val slug: String,
        val name: String,
        val perspectives: MutableSet<ClubPerspective> = linkedSetOf(),
    )

    private companion object {
        val READABLE_MEMBERSHIP_STATUSES =
            setOf(MembershipStatus.VIEWER, MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED)
        val PERSPECTIVE_WIRE_ORDER = listOf(ClubPerspective.MEMBER, ClubPerspective.HOST)
    }
}
