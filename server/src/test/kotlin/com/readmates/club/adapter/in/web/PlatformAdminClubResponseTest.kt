@file:Suppress("ktlint:standard:package-name")

package com.readmates.club.adapter.`in`.web

import com.readmates.club.application.model.FirstHostOnboardingState
import com.readmates.club.application.model.PlatformAdminClubListItem
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
}
