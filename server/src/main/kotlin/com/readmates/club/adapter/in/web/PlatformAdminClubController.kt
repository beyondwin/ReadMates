@file:Suppress("ktlint:standard:package-name")

package com.readmates.club.adapter.`in`.web

import com.readmates.club.application.model.ClubLifecycleState
import com.readmates.club.application.model.ConfirmPlatformAdminClubVisibilityCommand
import com.readmates.club.application.model.ConfirmPlatformAdminOnboardingCommand
import com.readmates.club.application.model.FirstHostOnboardingState
import com.readmates.club.application.model.PLATFORM_ADMIN_CLUB_LIST_DEFAULT_LIMIT
import com.readmates.club.application.model.PlatformAdminClubCommandPreview
import com.readmates.club.application.model.PlatformAdminClubCommandReceipt
import com.readmates.club.application.model.PlatformAdminClubDetail
import com.readmates.club.application.model.PlatformAdminClubList
import com.readmates.club.application.model.PlatformAdminClubListItem
import com.readmates.club.application.model.PlatformAdminClubListQuery
import com.readmates.club.application.model.PlatformAdminDomainStatus
import com.readmates.club.application.model.PlatformAdminOnboardingClubInput
import com.readmates.club.application.model.PlatformAdminOnboardingCommand
import com.readmates.club.application.model.PlatformAdminOnboardingDomainInput
import com.readmates.club.application.model.PlatformAdminOnboardingHostInput
import com.readmates.club.application.model.PlatformAdminOnboardingPreview
import com.readmates.club.application.model.PlatformAdminOnboardingResult
import com.readmates.club.application.model.PreviewPlatformAdminClubVisibilityCommand
import com.readmates.club.application.model.PublicVisibility
import com.readmates.club.application.model.UpdatePlatformAdminClubCommand
import com.readmates.club.application.port.`in`.CommitPlatformAdminClubOnboardingUseCase
import com.readmates.club.application.port.`in`.ConfirmPlatformAdminClubVisibilityUseCase
import com.readmates.club.application.port.`in`.GetPlatformAdminClubUseCase
import com.readmates.club.application.port.`in`.ListPlatformAdminClubsUseCase
import com.readmates.club.application.port.`in`.PreviewPlatformAdminClubOnboardingUseCase
import com.readmates.club.application.port.`in`.PreviewPlatformAdminClubVisibilityUseCase
import com.readmates.club.application.port.`in`.UpdatePlatformAdminClubUseCase
import com.readmates.club.domain.ClubDomainKind
import com.readmates.club.domain.ClubPublicVisibility
import com.readmates.shared.security.CurrentPlatformAdmin
import com.readmates.shared.security.toPlatformActor
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
    private val getPlatformAdminClubUseCase: GetPlatformAdminClubUseCase,
    private val updatePlatformAdminClubUseCase: UpdatePlatformAdminClubUseCase,
    private val previewVisibilityUseCase: PreviewPlatformAdminClubVisibilityUseCase,
    private val confirmVisibilityUseCase: ConfirmPlatformAdminClubVisibilityUseCase,
    private val previewOnboardingUseCase: PreviewPlatformAdminClubOnboardingUseCase,
    private val commitOnboardingUseCase: CommitPlatformAdminClubOnboardingUseCase,
) {
    @GetMapping
    fun list(
        admin: CurrentPlatformAdmin,
        request: PlatformAdminClubListRequest,
    ): PlatformAdminClubListResponse =
        PlatformAdminClubListResponse.from(
            listPlatformAdminClubsUseCase.listClubs(admin.toPlatformActor(), request.toQuery()),
        )

    @GetMapping("/{clubId}")
    fun get(
        admin: CurrentPlatformAdmin,
        @PathVariable clubId: UUID,
    ): PlatformAdminClubDetailResponse =
        PlatformAdminClubDetailResponse.from(
            getPlatformAdminClubUseCase.getClub(admin.toPlatformActor(), clubId),
        )

    @PostMapping("/onboarding/preview")
    fun previewOnboarding(
        admin: CurrentPlatformAdmin,
        @RequestBody request: PlatformAdminOnboardingRequest,
    ): PlatformAdminOnboardingPreviewResponse =
        PlatformAdminOnboardingPreviewResponse.from(
            previewOnboardingUseCase.preview(admin.toPlatformActor(), request.toCommand()),
        )

    @PostMapping("/onboarding")
    fun commitOnboarding(
        admin: CurrentPlatformAdmin,
        @RequestBody request: ConfirmPlatformAdminOnboardingRequest,
    ): PlatformAdminOnboardingResultResponse =
        PlatformAdminOnboardingResultResponse.from(
            commitOnboardingUseCase.commit(admin.toPlatformActor(), request.toCommand()),
        )

    @PatchMapping("/{clubId}/metadata")
    fun update(
        admin: CurrentPlatformAdmin,
        @PathVariable clubId: UUID,
        @RequestBody request: UpdatePlatformAdminClubRequest,
    ): PlatformAdminClubDetailResponse =
        PlatformAdminClubDetailResponse.from(
            updatePlatformAdminClubUseCase.updateClub(
                admin = admin.toPlatformActor(),
                clubId = clubId,
                command = request.toCommand(),
            ),
        )

    @PostMapping("/{clubId}/visibility/preview")
    fun previewVisibility(
        admin: CurrentPlatformAdmin,
        @PathVariable clubId: UUID,
        @RequestBody request: PreviewPlatformAdminClubVisibilityRequest,
    ): PlatformAdminClubCommandPreviewResponse =
        PlatformAdminClubCommandPreviewResponse.from(
            previewVisibilityUseCase.previewVisibility(
                admin.toPlatformActor(),
                clubId,
                PreviewPlatformAdminClubVisibilityCommand(
                    expectedAdminRevision = request.expectedAdminRevision,
                    targetVisibility = request.targetVisibility,
                ),
            ),
        )

    @PostMapping("/{clubId}/visibility/confirm")
    fun confirmVisibility(
        admin: CurrentPlatformAdmin,
        @PathVariable clubId: UUID,
        @RequestBody request: ConfirmPlatformAdminClubVisibilityRequest,
    ): PlatformAdminClubCommandReceiptResponse =
        PlatformAdminClubCommandReceiptResponse.from(
            confirmVisibilityUseCase.confirmVisibility(
                admin.toPlatformActor(),
                clubId,
                ConfirmPlatformAdminClubVisibilityCommand(
                    previewId = request.previewId,
                    idempotencyKey = request.idempotencyKey,
                    expectedAdminRevision = request.expectedAdminRevision,
                    targetVisibility = request.targetVisibility,
                    confirmed = request.confirmed,
                ),
            ),
        )
}

data class PreviewPlatformAdminClubVisibilityRequest(
    val expectedAdminRevision: Long,
    val targetVisibility: ClubPublicVisibility,
)

data class ConfirmPlatformAdminClubVisibilityRequest(
    val previewId: UUID,
    val idempotencyKey: String,
    val expectedAdminRevision: Long,
    val targetVisibility: ClubPublicVisibility,
    val confirmed: Boolean,
)

data class PlatformAdminClubCommandPreviewResponse(
    val previewId: String,
    val expiresAt: java.time.Instant,
    val currentVisibility: String,
    val targetVisibility: String,
    val impactCodes: List<String>,
    val requestFingerprintPrefix: String,
) {
    companion object {
        fun from(preview: PlatformAdminClubCommandPreview) =
            PlatformAdminClubCommandPreviewResponse(
                previewId = preview.previewId.toString(),
                expiresAt = preview.expiresAt,
                currentVisibility = preview.currentVisibility.name,
                targetVisibility = preview.targetVisibility.name,
                impactCodes = preview.impactCodes,
                requestFingerprintPrefix = preview.requestFingerprintPrefix,
            )
    }
}

data class PlatformAdminClubCommandReceiptResponse(
    val receiptId: String,
    val commandType: String,
    val clubId: String,
    val beforeAdminRevision: Long?,
    val afterAdminRevision: Long,
    val outcome: String,
    val resultCode: String,
    val targetId: String?,
    val convergenceId: String?,
    val convergenceState: String?,
) {
    companion object {
        fun from(receipt: PlatformAdminClubCommandReceipt) =
            PlatformAdminClubCommandReceiptResponse(
                receiptId = receipt.receiptId.toString(),
                commandType = receipt.commandType,
                clubId = receipt.clubId.toString(),
                beforeAdminRevision = receipt.beforeAdminRevision,
                afterAdminRevision = receipt.afterAdminRevision,
                outcome = receipt.outcome,
                resultCode = receipt.resultCode,
                targetId = receipt.targetId?.toString(),
                convergenceId = receipt.convergenceId?.toString(),
                convergenceState = receipt.convergenceState,
            )
    }
}

data class PlatformAdminClubListRequest(
    val search: String? = null,
    val lifecycle: ClubLifecycleState? = null,
    val visibility: PublicVisibility? = null,
    val domainStatus: PlatformAdminDomainStatus? = null,
    val onboardingState: FirstHostOnboardingState? = null,
    val cursor: String? = null,
    val limit: Int? = null,
) {
    fun toQuery(): PlatformAdminClubListQuery =
        PlatformAdminClubListQuery(
            search = search,
            lifecycle = lifecycle,
            visibility = visibility,
            domainStatus = domainStatus,
            onboardingState = onboardingState,
            cursor = cursor,
            limit = limit ?: PLATFORM_ADMIN_CLUB_LIST_DEFAULT_LIMIT,
        )
}

data class PlatformAdminClubListResponse(
    val items: List<PlatformAdminClubResponse>,
    val nextCursor: String? = null,
) {
    companion object {
        fun from(list: PlatformAdminClubList): PlatformAdminClubListResponse =
            PlatformAdminClubListResponse(
                items = list.items.map(PlatformAdminClubResponse::from),
                nextCursor = list.nextCursor,
            )
    }
}

data class UpdatePlatformAdminClubRequest(
    val expectedAdminRevision: Long,
    val name: String? = null,
    val tagline: String? = null,
    val about: String? = null,
) {
    fun toCommand(): UpdatePlatformAdminClubCommand =
        UpdatePlatformAdminClubCommand(
            expectedAdminRevision = expectedAdminRevision,
            name = name,
            tagline = tagline,
            about = about,
        )
}

data class PlatformAdminClubDetailResponse(
    val clubId: String,
    val slug: String,
    val name: String,
    val tagline: String,
    val about: String,
    val adminRevision: Long,
    val status: String,
    val publicVisibility: String,
    val domains: List<PlatformAdminDomainResponse>,
    val firstHostOnboardingState: String,
    val domainCount: Int,
    val domainActionRequiredCount: Int,
    val notificationFailureCount: Int,
    val aiFailureCount: Int,
) {
    companion object {
        fun from(detail: PlatformAdminClubDetail): PlatformAdminClubDetailResponse =
            PlatformAdminClubDetailResponse(
                clubId = detail.clubId.toString(),
                slug = detail.slug,
                name = detail.name,
                tagline = detail.tagline,
                about = detail.about,
                adminRevision = detail.adminRevision,
                status = detail.status.name,
                publicVisibility = detail.publicVisibility.name,
                domains = detail.domains.map(PlatformAdminDomainResponse::from),
                firstHostOnboardingState = detail.firstHostOnboardingState.name,
                domainCount = detail.domainCount,
                domainActionRequiredCount = detail.domainActionRequiredCount,
                notificationFailureCount = detail.notificationFailureCount,
                aiFailureCount = detail.aiFailureCount,
            )
    }
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
    val notificationFailureCount: Int,
    val aiFailureCount: Int,
    val firstHostOnboardingState: String,
    val adminRevision: Long,
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
                notificationFailureCount = item.notificationFailureCount,
                aiFailureCount = item.aiFailureCount,
                firstHostOnboardingState = item.firstHostOnboardingState.name,
                adminRevision = item.adminRevision,
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

data class ConfirmPlatformAdminOnboardingRequest(
    val previewId: UUID,
    val idempotencyKey: String,
    val club: PlatformAdminOnboardingClubRequest,
    val firstHost: PlatformAdminOnboardingHostRequest,
    val domain: PlatformAdminOnboardingDomainRequest? = null,
    val existingUserConfirmation: String? = null,
    val confirmed: Boolean,
) {
    fun toCommand(): ConfirmPlatformAdminOnboardingCommand =
        ConfirmPlatformAdminOnboardingCommand(
            previewId = previewId,
            idempotencyKey = idempotencyKey,
            onboarding =
                PlatformAdminOnboardingCommand(
                    club = PlatformAdminOnboardingClubInput(club.name, club.slug, club.tagline, club.about),
                    firstHost = PlatformAdminOnboardingHostInput(firstHost.email, firstHost.name),
                    domain = domain?.let { PlatformAdminOnboardingDomainInput(it.hostname, it.kind) },
                    existingUserConfirmation = existingUserConfirmation,
                ),
            confirmed = confirmed,
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
    val previewId: String,
    val expiresAt: java.time.Instant,
    val clubSlug: String,
    val firstHostKind: String,
    val requiredConfirmation: String?,
    val impactCodes: List<String>,
    val prerequisiteCodes: List<String>,
    val requestFingerprintPrefix: String,
) {
    companion object {
        fun from(preview: PlatformAdminOnboardingPreview): PlatformAdminOnboardingPreviewResponse =
            PlatformAdminOnboardingPreviewResponse(
                previewId = preview.previewId.toString(),
                expiresAt = preview.expiresAt,
                clubSlug = preview.clubSlug,
                firstHostKind = preview.firstHostKind.name,
                requiredConfirmation = preview.requiredConfirmation,
                impactCodes = preview.impactCodes,
                prerequisiteCodes = preview.prerequisiteCodes,
                requestFingerprintPrefix = preview.requestFingerprintPrefix,
            )
    }
}

data class PlatformAdminOnboardingResultResponse(
    val receiptId: String,
    val club: PlatformAdminClubResponse,
    val originStatus: String,
    val firstHostKind: String,
    val invitationDelivery: String,
) {
    companion object {
        fun from(result: PlatformAdminOnboardingResult): PlatformAdminOnboardingResultResponse =
            PlatformAdminOnboardingResultResponse(
                receiptId = result.receiptId.toString(),
                club = PlatformAdminClubResponse.from(result.club),
                originStatus = result.originStatus.name,
                firstHostKind = result.firstHostKind.name,
                invitationDelivery = result.invitationDelivery.name,
            )
    }
}
