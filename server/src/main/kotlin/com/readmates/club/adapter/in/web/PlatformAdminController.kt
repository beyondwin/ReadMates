package com.readmates.club.adapter.`in`.web

import com.fasterxml.jackson.annotation.JsonProperty
import com.readmates.club.application.model.ConfirmCreateClubDomainCommand
import com.readmates.club.application.model.PlatformAdminClubCommandReceipt
import com.readmates.club.application.model.PlatformAdminClubDomain
import com.readmates.club.application.model.PlatformAdminDashboardSummary
import com.readmates.club.application.model.PlatformAdminDomainCommandPreview
import com.readmates.club.application.model.PreviewCreateClubDomainCommand
import com.readmates.club.application.model.RecheckClubDomainCommand
import com.readmates.club.application.model.desiredState
import com.readmates.club.application.model.manualAction
import com.readmates.club.application.port.`in`.CheckClubDomainProvisioningUseCase
import com.readmates.club.application.port.`in`.CreateClubDomainUseCase
import com.readmates.club.application.port.`in`.PlatformAdminSummaryUseCase
import com.readmates.club.application.port.`in`.PreviewClubDomainUseCase
import com.readmates.club.domain.ClubDomainKind
import com.readmates.shared.security.CurrentPlatformAdmin
import com.readmates.shared.security.toPlatformActor
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.time.OffsetDateTime
import java.util.UUID

@RestController
@RequestMapping("/api/admin")
class PlatformAdminController(
    private val platformAdminSummaryUseCase: PlatformAdminSummaryUseCase,
    private val previewClubDomainUseCase: PreviewClubDomainUseCase,
    private val createClubDomainUseCase: CreateClubDomainUseCase,
    private val checkClubDomainProvisioningUseCase: CheckClubDomainProvisioningUseCase,
) {
    @GetMapping("/summary")
    fun summary(admin: CurrentPlatformAdmin): PlatformAdminSummaryResponse =
        PlatformAdminSummaryResponse.from(platformAdminSummaryUseCase.summary(admin))

    @PostMapping("/clubs/{clubId}/domains")
    fun createClubDomain(
        admin: CurrentPlatformAdmin,
        @PathVariable clubId: UUID,
        @RequestBody request: CreateClubDomainRequest,
    ): PlatformAdminClubCommandReceiptResponse =
        PlatformAdminClubCommandReceiptResponse.from(
            createClubDomainUseCase.createClubDomain(
                admin = admin.toPlatformActor(),
                clubId = clubId,
                command =
                    ConfirmCreateClubDomainCommand(
                        previewId = request.previewId,
                        idempotencyKey = request.idempotencyKey,
                        expectedAdminRevision = request.expectedAdminRevision,
                        hostname = request.hostname,
                        kind = request.kind,
                        isPrimary = request.isPrimary ?: false,
                        confirmed = request.confirmed,
                    ),
            ),
        )

    @PostMapping("/clubs/{clubId}/domains/preview")
    fun previewClubDomain(
        admin: CurrentPlatformAdmin,
        @PathVariable clubId: UUID,
        @RequestBody request: PreviewClubDomainRequest,
    ): PlatformAdminDomainCommandPreviewResponse =
        PlatformAdminDomainCommandPreviewResponse.from(
            previewClubDomainUseCase.previewClubDomain(
                admin = admin.toPlatformActor(),
                clubId = clubId,
                command =
                    PreviewCreateClubDomainCommand(
                        expectedAdminRevision = request.expectedAdminRevision,
                        hostname = request.hostname,
                        kind = request.kind,
                        isPrimary = request.isPrimary ?: false,
                    ),
            ),
        )

    @PostMapping("/domains/{domainId}/check")
    fun checkClubDomainProvisioning(
        admin: CurrentPlatformAdmin,
        @PathVariable domainId: UUID,
        @RequestBody request: RecheckClubDomainRequest,
    ): PlatformAdminClubCommandReceiptResponse =
        PlatformAdminClubCommandReceiptResponse.from(
            checkClubDomainProvisioningUseCase.checkClubDomainProvisioning(
                admin = admin.toPlatformActor(),
                domainId = domainId,
                command = RecheckClubDomainCommand(request.idempotencyKey, request.expectedStatus),
            ),
        )
}

data class CreateClubDomainRequest(
    val previewId: UUID,
    val idempotencyKey: String,
    val expectedAdminRevision: Long,
    val hostname: String,
    val kind: ClubDomainKind,
    val isPrimary: Boolean? = null,
    val confirmed: Boolean,
)

data class PreviewClubDomainRequest(
    val expectedAdminRevision: Long,
    val hostname: String,
    val kind: ClubDomainKind,
    val isPrimary: Boolean? = null,
)

data class RecheckClubDomainRequest(
    val idempotencyKey: String,
    val expectedStatus: com.readmates.club.domain.ClubDomainStatus,
)

data class PlatformAdminDomainCommandPreviewResponse(
    val previewId: String,
    val expiresAt: java.time.Instant,
    val kind: String,
    val isPrimary: Boolean,
    val impactCodes: List<String>,
    val requestFingerprintPrefix: String,
) {
    companion object {
        fun from(preview: PlatformAdminDomainCommandPreview) =
            PlatformAdminDomainCommandPreviewResponse(
                previewId = preview.previewId.toString(),
                expiresAt = preview.expiresAt,
                kind = preview.kind.name,
                isPrimary = preview.isPrimary,
                impactCodes = preview.impactCodes,
                requestFingerprintPrefix = preview.requestFingerprintPrefix,
            )
    }
}

data class PlatformAdminSummaryResponse(
    val platformRole: String,
    val activeClubCount: Long,
    val domainActionRequiredCount: Long,
    val domains: List<PlatformAdminDomainResponse>,
    val domainsRequiringAction: List<PlatformAdminDomainResponse>,
) {
    companion object {
        fun from(summary: PlatformAdminDashboardSummary): PlatformAdminSummaryResponse {
            val domains = summary.domains.map(PlatformAdminDomainResponse::from)
            return PlatformAdminSummaryResponse(
                platformRole = summary.platformRole.name,
                activeClubCount = summary.activeClubCount,
                domainActionRequiredCount = summary.domainActionRequiredCount,
                domains = domains,
                domainsRequiringAction = summary.domainsRequiringAction.map(PlatformAdminDomainResponse::from),
            )
        }
    }
}

data class PlatformAdminDomainResponse(
    val id: String,
    val clubId: String,
    val hostname: String,
    val kind: String,
    val status: String,
    val desiredState: String,
    val manualAction: String,
    val errorCode: String?,
    @get:JsonProperty("isPrimary")
    val isPrimary: Boolean,
    val verifiedAt: OffsetDateTime?,
    val lastCheckedAt: OffsetDateTime?,
) {
    companion object {
        fun from(domain: PlatformAdminClubDomain): PlatformAdminDomainResponse =
            PlatformAdminDomainResponse(
                id = domain.id.toString(),
                clubId = domain.clubId.toString(),
                hostname = domain.hostname,
                kind = domain.kind.name,
                status = domain.status.name,
                desiredState = domain.desiredState.name,
                manualAction = domain.manualAction.name,
                errorCode = domain.errorCode,
                isPrimary = domain.isPrimary,
                verifiedAt = domain.verifiedAt,
                lastCheckedAt = domain.lastCheckedAt,
            )
    }
}
