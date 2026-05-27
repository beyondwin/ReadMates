@file:Suppress("ktlint:standard:package-name")

package com.readmates.club.adapter.`in`.web

import com.readmates.club.application.model.AdminSupportGrantLedgerItem
import com.readmates.club.application.model.AdminSupportSearchResult
import com.readmates.club.application.model.CreateSupportAccessGrantCommand
import com.readmates.club.application.port.`in`.AdminSupportWorkbenchUseCase
import com.readmates.club.application.port.`in`.CreateSupportAccessGrantUseCase
import com.readmates.club.application.port.`in`.RevokeSupportAccessGrantUseCase
import com.readmates.club.domain.SupportAccessGrantScope
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.time.OffsetDateTime
import java.util.UUID

@RestController
@RequestMapping("/api/admin/support")
class PlatformAdminSupportWorkbenchController(
    private val workbenchUseCase: AdminSupportWorkbenchUseCase,
    private val createUseCase: CreateSupportAccessGrantUseCase,
    private val revokeUseCase: RevokeSupportAccessGrantUseCase,
) {
    @GetMapping("/search")
    fun search(
        admin: CurrentPlatformAdmin,
        @RequestParam query: String,
        @RequestParam(required = false) clubId: UUID?,
    ): List<AdminSupportSearchResultResponse> =
        workbenchUseCase
            .search(admin, query, clubId)
            .map(AdminSupportSearchResultResponse::from)

    @GetMapping("/grants")
    fun grants(
        admin: CurrentPlatformAdmin,
        @RequestParam(required = false) clubId: UUID?,
        @RequestParam(required = false) granteeUserId: UUID?,
    ): List<AdminSupportGrantLedgerItemResponse> =
        workbenchUseCase.listGrantLedger(admin, clubId, granteeUserId).map(AdminSupportGrantLedgerItemResponse::from)

    @PostMapping("/grants")
    fun create(
        admin: CurrentPlatformAdmin,
        @RequestBody request: AdminSupportGrantRequest,
    ): SupportAccessGrantResponse =
        SupportAccessGrantResponse.from(
            createUseCase.createSupportAccessGrant(
                admin,
                CreateSupportAccessGrantCommand(
                    clubId = request.clubId,
                    granteeUserId = request.granteeSubjectId,
                    scope = request.scope,
                    reason = request.reason,
                    expiresAt = request.expiresAt,
                ),
            ),
        )

    @DeleteMapping("/grants/{grantId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun revoke(
        admin: CurrentPlatformAdmin,
        @PathVariable grantId: UUID,
    ) {
        revokeUseCase.revokeSupportAccessGrant(admin, grantId)
    }
}

data class AdminSupportGrantRequest(
    val clubId: UUID,
    val granteeSubjectId: UUID,
    val scope: SupportAccessGrantScope,
    val reason: String,
    val expiresAt: OffsetDateTime,
)

data class AdminSupportSearchResultResponse(
    val subjectId: String,
    val displayName: String,
    val maskedEmail: String,
    val kind: String,
    val platformAdminRole: String?,
    val platformAdminStatus: String?,
    val clubMembershipSummary: Any,
    val grantEligible: Boolean,
    val grantBlockedReason: String?,
) {
    companion object {
        fun from(result: AdminSupportSearchResult): AdminSupportSearchResultResponse =
            AdminSupportSearchResultResponse(
                subjectId = result.subjectId.toString(),
                displayName = result.displayName,
                maskedEmail = result.maskedEmail,
                kind = result.kind,
                platformAdminRole = result.platformAdminRole?.name,
                platformAdminStatus = result.platformAdminStatus,
                clubMembershipSummary = result.clubMembershipSummary,
                grantEligible = result.grantEligible,
                grantBlockedReason = result.grantBlockedReason,
            )
    }
}

data class AdminSupportGrantLedgerItemResponse(
    val grantId: String,
    val clubId: String,
    val clubName: String,
    val granteeUserId: String,
    val granteeDisplayName: String,
    val granteeMaskedEmail: String,
    val scope: String,
    val reason: String,
    val expiresAt: OffsetDateTime,
    val createdAt: OffsetDateTime,
    val revokedAt: OffsetDateTime?,
    val status: String,
    val createdByRole: String,
) {
    companion object {
        fun from(item: AdminSupportGrantLedgerItem): AdminSupportGrantLedgerItemResponse =
            AdminSupportGrantLedgerItemResponse(
                grantId = item.grantId.toString(),
                clubId = item.clubId.toString(),
                clubName = item.clubName,
                granteeUserId = item.granteeUserId.toString(),
                granteeDisplayName = item.granteeDisplayName,
                granteeMaskedEmail = item.granteeMaskedEmail,
                scope = item.scope.name,
                reason = item.reason,
                expiresAt = item.expiresAt,
                createdAt = item.createdAt,
                revokedAt = item.revokedAt,
                status = item.status,
                createdByRole = item.createdByRole,
            )
    }
}
