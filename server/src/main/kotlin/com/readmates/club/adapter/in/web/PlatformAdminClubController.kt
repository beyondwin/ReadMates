package com.readmates.club.adapter.`in`.web

import com.readmates.club.application.model.PlatformAdminClubList
import com.readmates.club.application.model.PlatformAdminClubListItem
import com.readmates.club.application.model.UpdatePlatformAdminClubCommand
import com.readmates.club.application.port.`in`.ListPlatformAdminClubsUseCase
import com.readmates.club.application.port.`in`.UpdatePlatformAdminClubUseCase
import com.readmates.club.domain.ClubPublicVisibility
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api/admin/clubs")
class PlatformAdminClubController(
    private val listPlatformAdminClubsUseCase: ListPlatformAdminClubsUseCase,
    private val updatePlatformAdminClubUseCase: UpdatePlatformAdminClubUseCase,
) {
    @GetMapping
    fun list(admin: CurrentPlatformAdmin): PlatformAdminClubListResponse =
        PlatformAdminClubListResponse.from(listPlatformAdminClubsUseCase.listClubs(admin))

    @PatchMapping("/{clubId}")
    fun update(
        admin: CurrentPlatformAdmin,
        @PathVariable clubId: UUID,
        @RequestBody request: UpdatePlatformAdminClubRequest,
    ): PlatformAdminClubResponse =
        PlatformAdminClubResponse.from(
            updatePlatformAdminClubUseCase.updateClub(
                admin = admin,
                clubId = clubId,
                command = request.toCommand(),
            ),
        )
}

data class PlatformAdminClubListResponse(
    val items: List<PlatformAdminClubResponse>,
) {
    companion object {
        fun from(list: PlatformAdminClubList): PlatformAdminClubListResponse =
            PlatformAdminClubListResponse(list.items.map(PlatformAdminClubResponse::from))
    }
}

data class UpdatePlatformAdminClubRequest(
    val name: String? = null,
    val tagline: String? = null,
    val about: String? = null,
    val publicVisibility: ClubPublicVisibility? = null,
) {
    fun toCommand(): UpdatePlatformAdminClubCommand =
        UpdatePlatformAdminClubCommand(
            name = name,
            tagline = tagline,
            about = about,
            publicVisibility = publicVisibility,
        )
}

data class PlatformAdminClubResponse(
    val clubId: String,
    val slug: String,
    val name: String,
    val tagline: String,
    val about: String,
    val status: String,
    val publicVisibility: String,
    val domainCount: Int,
    val domainActionRequiredCount: Int,
    val firstHostOnboardingState: String,
) {
    companion object {
        fun from(item: PlatformAdminClubListItem): PlatformAdminClubResponse =
            PlatformAdminClubResponse(
                clubId = item.clubId.toString(),
                slug = item.slug,
                name = item.name,
                tagline = item.tagline,
                about = item.about,
                status = item.status.name,
                publicVisibility = item.publicVisibility.name,
                domainCount = item.domainCount,
                domainActionRequiredCount = item.domainActionRequiredCount,
                firstHostOnboardingState = item.firstHostOnboardingState.name,
            )
    }
}
