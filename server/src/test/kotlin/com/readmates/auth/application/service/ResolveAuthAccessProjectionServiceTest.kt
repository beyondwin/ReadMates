package com.readmates.auth.application.service

import com.readmates.auth.application.model.AvailableClubSpace
import com.readmates.auth.application.model.ClubPerspective
import com.readmates.auth.application.model.ProductSpaceKind
import com.readmates.auth.application.model.RecommendedSpace
import com.readmates.auth.application.port.out.MemberIdentityLookupPort
import com.readmates.auth.application.port.out.PlatformAdminLookupPort
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.CurrentPlatformAdmin
import com.readmates.shared.security.CurrentUser
import com.readmates.shared.security.PlatformAdminRole
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.util.UUID

private typealias TestJoinedClubSummary = com.readmates.auth.application.model.JoinedClubSummary

class ResolveAuthAccessProjectionServiceTest {
    private val userId = UUID.fromString("00000000-0000-0000-0000-000000000001")
    private val firstClubId = UUID.fromString("00000000-0000-0000-0000-000000000010")
    private val secondClubId = UUID.fromString("00000000-0000-0000-0000-000000000020")

    @Test
    fun `projects platform and readable club spaces from the membership matrix`() {
        projectionRows().forEach { row ->
            val projection = service(row.joinedClubs, row.platformAdmin).resolve(userId)

            assertEquals(row.joinedClubs, projection.joinedClubs, row.description)
            assertEquals(row.platformAdmin, projection.platformAdmin, row.description)
            assertEquals(row.expectedKinds, projection.availableSpaces.kinds, row.description)
            assertEquals(row.expectedClubs, projection.availableSpaces.clubs, row.description)
            assertEquals(row.recommendedSpace, projection.recommendedSpace, row.description)
        }
    }

    @Test
    fun `excludes inactive and invited clubs while deduplicating readable club perspectives`() {
        val activeMember = club(firstClubId, "first-club", MembershipRole.MEMBER, MembershipStatus.ACTIVE)
        val activeHost = club(firstClubId, "first-club", MembershipRole.HOST, MembershipStatus.ACTIVE)
        val inactiveHost = club(secondClubId, "inactive-club", MembershipRole.HOST, MembershipStatus.INACTIVE)
        val invitedMember = club(secondClubId, "inactive-club", MembershipRole.MEMBER, MembershipStatus.INVITED)

        val projection = service(listOf(activeMember, activeHost, inactiveHost, invitedMember), null).resolve(userId)

        assertEquals(listOf(ProductSpaceKind.CLUBS), projection.availableSpaces.kinds)
        assertEquals(
            listOf(
                AvailableClubSpace(
                    clubId = firstClubId,
                    clubSlug = "first-club",
                    clubName = "First Club",
                    perspectives = listOf(ClubPerspective.MEMBER, ClubPerspective.HOST),
                ),
            ),
            projection.availableSpaces.clubs,
        )
        assertEquals(
            RecommendedSpace(
                kind = ProductSpaceKind.CLUBS,
                clubId = firstClubId,
                perspective = ClubPerspective.MEMBER,
            ),
            projection.recommendedSpace,
        )
    }

    private fun projectionRows() =
        listOf(
            platformOnlyRow(),
            activeMemberRow(),
            viewerRow(),
            suspendedHostRow(),
            activeHostRow(),
            unreadableMembershipsRow(),
            mixedPlatformAndClubsRow(),
        )

    private fun platformOnlyRow() =
        ProjectionRow(
            description = "platform-only users receive the platform semantic destination",
            joinedClubs = emptyList(),
            platformAdmin = platformAdmin(),
            expectedKinds = listOf(ProductSpaceKind.PLATFORM),
            expectedClubs = emptyList(),
            recommendedSpace = RecommendedSpace(ProductSpaceKind.PLATFORM),
        )

    private fun activeMemberRow() =
        singleMemberClubRow(
            description = "an active member receives a single member club destination",
            role = MembershipRole.MEMBER,
            status = MembershipStatus.ACTIVE,
        )

    private fun viewerRow() =
        singleMemberClubRow(
            description = "a viewer receives the member perspective without host access",
            role = MembershipRole.HOST,
            status = MembershipStatus.VIEWER,
        )

    private fun suspendedHostRow() =
        singleMemberClubRow(
            description = "a suspended host remains readable as a member without host access",
            role = MembershipRole.HOST,
            status = MembershipStatus.SUSPENDED,
        )

    private fun singleMemberClubRow(
        description: String,
        role: MembershipRole,
        status: MembershipStatus,
    ) =
        ProjectionRow(
            description = description,
            joinedClubs = listOf(club(firstClubId, "first-club", role, status)),
            platformAdmin = null,
            expectedKinds = listOf(ProductSpaceKind.CLUBS),
            expectedClubs = listOf(availableMemberClub(firstClubId, "first-club")),
            recommendedSpace = RecommendedSpace(ProductSpaceKind.CLUBS, firstClubId, ClubPerspective.MEMBER),
        )

    private fun activeHostRow() =
        ProjectionRow(
            description = "an active host receives member and host perspectives in wire order",
            joinedClubs = listOf(club(firstClubId, "first-club", MembershipRole.HOST, MembershipStatus.ACTIVE)),
            platformAdmin = null,
            expectedKinds = listOf(ProductSpaceKind.CLUBS),
            expectedClubs = listOf(availableHostClub(firstClubId, "first-club")),
            recommendedSpace = RecommendedSpace(ProductSpaceKind.CLUBS, firstClubId, ClubPerspective.MEMBER),
        )

    private fun unreadableMembershipsRow() =
        ProjectionRow(
            description = "inactive and invited memberships do not create a product space",
            joinedClubs =
                listOf(
                    club(firstClubId, "first-club", MembershipRole.HOST, MembershipStatus.INACTIVE),
                    club(secondClubId, "second-club", MembershipRole.MEMBER, MembershipStatus.INVITED),
                ),
            platformAdmin = null,
            expectedKinds = emptyList(),
            expectedClubs = emptyList(),
            recommendedSpace = null,
        )

    private fun mixedPlatformAndClubsRow() =
        ProjectionRow(
            description = "platform authority wins the recommendation when multiple readable clubs exist",
            joinedClubs =
                listOf(
                    club(firstClubId, "first-club", MembershipRole.MEMBER, MembershipStatus.ACTIVE),
                    club(secondClubId, "second-club", MembershipRole.HOST, MembershipStatus.ACTIVE),
                ),
            platformAdmin = platformAdmin(),
            expectedKinds = listOf(ProductSpaceKind.PLATFORM, ProductSpaceKind.CLUBS),
            expectedClubs =
                listOf(
                    availableMemberClub(firstClubId, "first-club"),
                    availableHostClub(secondClubId, "second-club"),
                ),
            recommendedSpace = RecommendedSpace(ProductSpaceKind.PLATFORM),
        )

    private fun availableMemberClub(
        clubId: UUID,
        clubSlug: String,
    ) =
        AvailableClubSpace(
            clubId = clubId,
            clubSlug = clubSlug,
            clubName = clubSlug.split('-').joinToString(" ") { it.replaceFirstChar(Char::uppercase) },
            perspectives = listOf(ClubPerspective.MEMBER),
        )

    private fun availableHostClub(
        clubId: UUID,
        clubSlug: String,
    ) =
        AvailableClubSpace(
            clubId = clubId,
            clubSlug = clubSlug,
            clubName = clubSlug.split('-').joinToString(" ") { it.replaceFirstChar(Char::uppercase) },
            perspectives = listOf(ClubPerspective.MEMBER, ClubPerspective.HOST),
        )

    private fun service(
        joinedClubs: List<TestJoinedClubSummary>,
        platformAdmin: CurrentPlatformAdmin?,
    ) =
        ResolveAuthAccessProjectionService(
            memberIdentityLookup = StubMemberIdentityLookupPort(joinedClubs),
            platformAdminLookup = StubPlatformAdminLookupPort(platformAdmin),
        )

    private fun club(
        clubId: UUID,
        clubSlug: String,
        role: MembershipRole,
        status: MembershipStatus,
    ) =
        TestJoinedClubSummary(
            clubId = clubId,
            clubSlug = clubSlug,
            clubName = clubSlug.split('-').joinToString(" ") { it.replaceFirstChar(Char::uppercase) },
            membershipId = UUID.nameUUIDFromBytes("$clubId-$role-$status".toByteArray()),
            role = role,
            status = status,
            primaryHost = null,
        )

    private fun platformAdmin() =
        CurrentPlatformAdmin(
            userId = userId,
            email = "platform@example.com",
            role = PlatformAdminRole.OPERATOR,
        )

    private data class ProjectionRow(
        val description: String,
        val joinedClubs: List<TestJoinedClubSummary>,
        val platformAdmin: CurrentPlatformAdmin?,
        val expectedKinds: List<ProductSpaceKind>,
        val expectedClubs: List<AvailableClubSpace>,
        val recommendedSpace: RecommendedSpace?,
    )

    private class StubMemberIdentityLookupPort(
        private val joinedClubs: List<TestJoinedClubSummary>,
    ) : MemberIdentityLookupPort {
        override fun findActiveMemberByEmail(email: String): CurrentMember? = null

        override fun findActiveMemberByUserId(userId: String): CurrentMember? = null

        override fun findMemberByUserIdAndClubId(
            userId: UUID,
            clubId: UUID,
        ): CurrentMember? = null

        override fun findMemberByEmailAndClubId(
            email: String,
            clubId: UUID,
        ): CurrentMember? = null

        override fun findMemberByUserIdIncludingViewer(userId: UUID): CurrentMember? = null

        override fun findAnyUserIdByEmail(email: String): UUID? = null

        override fun findUserById(userId: UUID): CurrentUser? = null

        override fun findMembershipStatusByUserId(userId: UUID): MembershipStatus? = null

        override fun listJoinedClubs(userId: UUID): List<TestJoinedClubSummary> = joinedClubs
    }

    private class StubPlatformAdminLookupPort(
        private val platformAdmin: CurrentPlatformAdmin?,
    ) : PlatformAdminLookupPort {
        override fun findPlatformAdmin(userId: UUID): CurrentPlatformAdmin? = platformAdmin
    }
}
