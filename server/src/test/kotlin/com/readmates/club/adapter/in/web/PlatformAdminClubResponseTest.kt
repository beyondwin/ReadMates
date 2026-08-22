@file:Suppress("ktlint:standard:package-name")

package com.readmates.club.adapter.`in`.web

import com.readmates.club.application.model.FirstHostOnboardingState
import com.readmates.club.application.model.PLATFORM_ADMIN_CLUB_ADMIN_REVISION
import com.readmates.club.application.model.PlatformAdminClubDetail
import com.readmates.club.application.model.PlatformAdminClubDomain
import com.readmates.club.application.model.PlatformAdminClubList
import com.readmates.club.application.model.PlatformAdminClubListItem
import com.readmates.club.domain.ClubDomainKind
import com.readmates.club.domain.ClubDomainStatus
import com.readmates.club.domain.ClubPublicVisibility
import com.readmates.club.domain.ClubStatus
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.util.UUID

class PlatformAdminClubResponseTest {
    @Test
    fun `maps notification and ai failure counts`() {
        val item =
            PlatformAdminClubListItem(
                clubId = UUID.fromString("00000000-0000-0000-0000-0000000fc001"),
                slug = "failure-count-club",
                name = "Failure Count Club",
                tagline = "",
                about = "",
                status = ClubStatus.ACTIVE,
                publicVisibility = ClubPublicVisibility.PRIVATE,
                domainCount = 1,
                domainActionRequiredCount = 0,
                notificationFailureCount = 2,
                aiFailureCount = 1,
                firstHostOnboardingState = FirstHostOnboardingState.ASSIGNED,
            )

        val response = PlatformAdminClubResponse.from(item)

        assertThat(response.notificationFailureCount).isEqualTo(2)
        assertThat(response.aiFailureCount).isEqualTo(1)
    }

    @Test
    fun `list response includes next cursor`() {
        val item =
            PlatformAdminClubListItem(
                clubId = UUID.fromString("00000000-0000-0000-0000-0000000fc001"),
                slug = "failure-count-club",
                name = "Failure Count Club",
                tagline = "",
                about = "",
                status = ClubStatus.ACTIVE,
                publicVisibility = ClubPublicVisibility.PRIVATE,
                domainCount = 1,
                domainActionRequiredCount = 0,
                notificationFailureCount = 0,
                aiFailureCount = 0,
                firstHostOnboardingState = FirstHostOnboardingState.ASSIGNED,
            )

        val response =
            PlatformAdminClubListResponse.from(
                PlatformAdminClubList(items = listOf(item), nextCursor = "opaque-cursor"),
            )

        assertThat(response.nextCursor).isEqualTo("opaque-cursor")
        assertThat(response.items).hasSize(1)
    }

    @Test
    fun `detail response maps identity public state domains and onboarding`() {
        val clubId = UUID.fromString("00000000-0000-0000-0000-0000000fc001")
        val response =
            PlatformAdminClubDetailResponse.from(
                PlatformAdminClubDetail(
                    clubId = clubId,
                    slug = "failure-count-club",
                    name = "Failure Count Club",
                    tagline = "tag",
                    about = "about",
                    adminRevision = PLATFORM_ADMIN_CLUB_ADMIN_REVISION,
                    status = ClubStatus.ACTIVE,
                    publicVisibility = ClubPublicVisibility.PRIVATE,
                    domains =
                        listOf(
                            PlatformAdminClubDomain(
                                id = UUID.fromString("00000000-0000-0000-0000-0000000fc010"),
                                clubId = clubId,
                                hostname = "club.example.test",
                                kind = ClubDomainKind.SUBDOMAIN,
                                status = ClubDomainStatus.ACTION_REQUIRED,
                                isPrimary = false,
                                verifiedAt = null,
                                lastCheckedAt = null,
                                errorCode = null,
                            ),
                        ),
                    firstHostOnboardingState = FirstHostOnboardingState.INVITED,
                    domainCount = 1,
                    domainActionRequiredCount = 1,
                    notificationFailureCount = 0,
                    aiFailureCount = 0,
                ),
            )

        assertThat(response.adminRevision).isZero()
        assertThat(response.slug).isEqualTo("failure-count-club")
        assertThat(response.publicVisibility).isEqualTo("PRIVATE")
        assertThat(response.domains).hasSize(1)
        assertThat(response.domains[0].hostname).isEqualTo("club.example.test")
        assertThat(response.firstHostOnboardingState).isEqualTo("INVITED")
    }
}
