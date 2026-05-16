@file:Suppress("ktlint:standard:package-name")

package com.readmates.club.adapter.`in`.web

import com.readmates.club.application.model.PlatformAdminClubList
import com.readmates.club.application.model.PlatformAdminClubListItem
import com.readmates.club.application.model.PlatformAdminDomainPreview
import com.readmates.club.application.model.PlatformAdminEmailDeliveryResult
import com.readmates.club.application.model.PlatformAdminFirstHostPreview
import com.readmates.club.application.model.PlatformAdminHostOnboardingResult
import com.readmates.club.application.model.PlatformAdminOnboardingClubInput
import com.readmates.club.application.model.PlatformAdminOnboardingClubPreview
import com.readmates.club.application.model.PlatformAdminOnboardingCommand
import com.readmates.club.application.model.PlatformAdminOnboardingDomainInput
import com.readmates.club.application.model.PlatformAdminOnboardingHostInput
import com.readmates.club.application.model.PlatformAdminOnboardingPreview
import com.readmates.club.application.model.PlatformAdminOnboardingResult
import com.readmates.club.application.model.UpdatePlatformAdminClubCommand
import com.readmates.club.application.port.`in`.CommitPlatformAdminClubOnboardingUseCase
import com.readmates.club.application.port.`in`.ListPlatformAdminClubsUseCase
import com.readmates.club.application.port.`in`.PreviewPlatformAdminClubOnboardingUseCase
import com.readmates.club.application.port.`in`.UpdatePlatformAdminClubUseCase
import com.readmates.club.domain.ClubDomainKind
import com.readmates.club.domain.ClubPublicVisibility
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api/admin/clubs")
class PlatformAdminClubController(
    private val listPlatformAdminClubsUseCase: ListPlatformAdminClubsUseCase,
    private val updatePlatformAdminClubUseCase: UpdatePlatformAdminClubUseCase,
    private val previewOnboardingUseCase: PreviewPlatformAdminClubOnboardingUseCase,
    private val commitOnboardingUseCase: CommitPlatformAdminClubOnboardingUseCase,
) {
    @GetMapping
    fun list(admin: CurrentPlatformAdmin): PlatformAdminClubListResponse =
        PlatformAdminClubListResponse.from(listPlatformAdminClubsUseCase.listClubs(admin))

    @PostMapping("/onboarding/preview")
    fun previewOnboarding(
        admin: CurrentPlatformAdmin,
        @RequestBody request: PlatformAdminOnboardingRequest,
    ): PlatformAdminOnboardingPreviewResponse =
        PlatformAdminOnboardingPreviewResponse.from(previewOnboardingUseCase.preview(admin, request.toCommand()))

    @PostMapping("/onboarding")
    fun commitOnboarding(
        admin: CurrentPlatformAdmin,
        @RequestBody request: PlatformAdminOnboardingRequest,
    ): PlatformAdminOnboardingResultResponse =
        PlatformAdminOnboardingResultResponse.from(commitOnboardingUseCase.commit(admin, request.toCommand()))

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

data class PlatformAdminOnboardingRequest(
    val club: PlatformAdminOnboardingClubRequest,
    val firstHost: PlatformAdminOnboardingHostRequest,
    val domain: PlatformAdminOnboardingDomainRequest? = null,
    val existingUserConfirmation: String? = null,
) {
    fun toCommand(): PlatformAdminOnboardingCommand =
        PlatformAdminOnboardingCommand(
            club = PlatformAdminOnboardingClubInput(club.name, club.slug, club.tagline, club.about),
            firstHost = PlatformAdminOnboardingHostInput(firstHost.email, firstHost.name),
            domain = domain?.let { PlatformAdminOnboardingDomainInput(it.hostname, it.kind) },
            existingUserConfirmation = existingUserConfirmation,
        )
}

data class PlatformAdminOnboardingClubRequest(
    val name: String,
    val slug: String,
    val tagline: String,
    val about: String,
)

data class PlatformAdminOnboardingHostRequest(
    val email: String,
    val name: String,
)

data class PlatformAdminOnboardingDomainRequest(
    val hostname: String,
    val kind: ClubDomainKind,
)

data class PlatformAdminOnboardingPreviewResponse(
    val club: PlatformAdminOnboardingClubPreviewResponse,
    val firstHost: PlatformAdminFirstHostPreviewResponse,
    val domain: PlatformAdminDomainPreviewResponse?,
) {
    companion object {
        fun from(preview: PlatformAdminOnboardingPreview): PlatformAdminOnboardingPreviewResponse =
            PlatformAdminOnboardingPreviewResponse(
                club = PlatformAdminOnboardingClubPreviewResponse.from(preview.club),
                firstHost = PlatformAdminFirstHostPreviewResponse.from(preview.firstHost),
                domain = preview.domain?.let(PlatformAdminDomainPreviewResponse::from),
            )
    }
}

data class PlatformAdminOnboardingClubPreviewResponse(
    val slug: String,
    val available: Boolean,
) {
    companion object {
        fun from(preview: PlatformAdminOnboardingClubPreview): PlatformAdminOnboardingClubPreviewResponse =
            PlatformAdminOnboardingClubPreviewResponse(preview.slug, preview.available)
    }
}

data class PlatformAdminFirstHostPreviewResponse(
    val kind: String,
    val email: String,
    val existingUserId: String?,
    val existingUserName: String?,
    val requiredConfirmation: String?,
) {
    companion object {
        fun from(preview: PlatformAdminFirstHostPreview): PlatformAdminFirstHostPreviewResponse =
            PlatformAdminFirstHostPreviewResponse(
                kind = preview.kind.name,
                email = preview.email,
                existingUserId = preview.existingUserId?.toString(),
                existingUserName = preview.existingUserName,
                requiredConfirmation = preview.requiredConfirmation,
            )
    }
}

data class PlatformAdminDomainPreviewResponse(
    val hostname: String,
    val available: Boolean,
) {
    companion object {
        fun from(preview: PlatformAdminDomainPreview): PlatformAdminDomainPreviewResponse =
            PlatformAdminDomainPreviewResponse(preview.hostname, preview.available)
    }
}

data class PlatformAdminOnboardingResultResponse(
    val club: PlatformAdminClubResponse,
    val hostOnboarding: PlatformAdminHostOnboardingResultResponse,
    val domain: PlatformAdminDomainResponse?,
) {
    companion object {
        fun from(result: PlatformAdminOnboardingResult): PlatformAdminOnboardingResultResponse =
            PlatformAdminOnboardingResultResponse(
                club = PlatformAdminClubResponse.from(result.club),
                hostOnboarding = PlatformAdminHostOnboardingResultResponse.from(result.hostOnboarding),
                domain = result.domain?.let(PlatformAdminDomainResponse::from),
            )
    }
}

data class PlatformAdminHostOnboardingResultResponse(
    val kind: String,
    val email: String,
    val userId: String?,
    val invitationId: String?,
    val acceptUrl: String?,
    val emailDelivery: PlatformAdminEmailDeliveryResponse,
) {
    companion object {
        fun from(result: PlatformAdminHostOnboardingResult): PlatformAdminHostOnboardingResultResponse =
            PlatformAdminHostOnboardingResultResponse(
                kind = result.kind.name,
                email = result.email,
                userId = result.userId?.toString(),
                invitationId = result.invitationId?.toString(),
                acceptUrl = result.acceptUrl,
                emailDelivery = PlatformAdminEmailDeliveryResponse.from(result.emailDelivery),
            )
    }
}

data class PlatformAdminEmailDeliveryResponse(
    val status: String,
) {
    companion object {
        fun from(result: PlatformAdminEmailDeliveryResult): PlatformAdminEmailDeliveryResponse =
            PlatformAdminEmailDeliveryResponse(result.status.name)
    }
}
