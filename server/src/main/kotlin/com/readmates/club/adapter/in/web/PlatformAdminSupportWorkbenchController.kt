@file:Suppress("ktlint:standard:package-name")

package com.readmates.club.adapter.`in`.web

import com.readmates.club.application.model.AdminSupportGrantLedgerItem
import com.readmates.club.application.model.AdminSupportGrantLedgerPage
import com.readmates.club.application.model.AdminSupportSearchResult
import com.readmates.club.application.model.ConfirmSupportGrantCreateCommand
import com.readmates.club.application.model.ConfirmSupportGrantRevokeCommand
import com.readmates.club.application.model.PreviewSupportGrantCreateCommand
import com.readmates.club.application.model.PreviewSupportGrantRevokeCommand
import com.readmates.club.application.model.SupportGrantCommandPreview
import com.readmates.club.application.model.SupportGrantCommandReceipt
import com.readmates.club.application.model.SupportGrantReasonCategory
import com.readmates.club.application.port.`in`.AdminSupportWorkbenchUseCase
import com.readmates.club.application.port.`in`.ConfirmSupportGrantCommandUseCase
import com.readmates.club.application.port.`in`.PreviewSupportGrantCommandUseCase
import com.readmates.club.domain.SupportAccessGrantScope
import com.readmates.shared.security.CurrentPlatformAdmin
import com.readmates.shared.security.toPlatformActor
import org.springframework.http.CacheControl
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
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
    private val previewCommandUseCase: PreviewSupportGrantCommandUseCase,
    private val confirmCommandUseCase: ConfirmSupportGrantCommandUseCase,
) {
    @PostMapping("/search")
    fun search(
        admin: CurrentPlatformAdmin,
        @RequestBody request: AdminSupportSearchRequest,
    ): ResponseEntity<List<AdminSupportSearchResultResponse>> =
        ResponseEntity
            .ok()
            .cacheControl(CacheControl.noStore())
            .body(
                workbenchUseCase
                    .search(admin, request.query, request.clubId)
                    .map(AdminSupportSearchResultResponse::from),
            )

    @GetMapping("/grants")
    fun grants(
        admin: CurrentPlatformAdmin,
        @RequestParam(required = false) clubId: UUID?,
        @RequestParam(required = false) status: String?,
        @RequestParam(required = false) cursor: String?,
    ): AdminSupportGrantLedgerPageResponse =
        AdminSupportGrantLedgerPageResponse.from(workbenchUseCase.listGrantLedger(admin, clubId, status, cursor))

    @PostMapping("/grants/preview")
    fun previewCreate(
        admin: CurrentPlatformAdmin,
        @RequestBody request: AdminSupportGrantCreatePreviewRequest,
    ): SupportGrantCommandPreview = previewCommandUseCase.previewCreate(admin.toPlatformActor(), request.toCommand())

    @PostMapping("/grants/confirm")
    fun confirmCreate(
        admin: CurrentPlatformAdmin,
        @RequestBody request: AdminSupportGrantCreateConfirmRequest,
    ): SupportGrantCommandReceipt = confirmCommandUseCase.confirmCreate(admin.toPlatformActor(), request.toCommand())

    @PostMapping("/grants/{grantId}/revoke/preview")
    fun previewRevoke(
        admin: CurrentPlatformAdmin,
        @PathVariable grantId: UUID,
        @RequestBody request: AdminSupportGrantRevokePreviewRequest,
    ): SupportGrantCommandPreview =
        previewCommandUseCase.previewRevoke(
            admin.toPlatformActor(),
            grantId,
            request.toCommand(),
        )

    @PostMapping("/grants/{grantId}/revoke/confirm")
    fun confirmRevoke(
        admin: CurrentPlatformAdmin,
        @PathVariable grantId: UUID,
        @RequestBody request: AdminSupportGrantRevokeConfirmRequest,
    ): SupportGrantCommandReceipt =
        confirmCommandUseCase.confirmRevoke(
            admin.toPlatformActor(),
            grantId,
            request.toCommand(),
        )

    @PostMapping("/grants")
    fun create(
        admin: CurrentPlatformAdmin,
        @RequestBody ignored: AdminSupportGrantRequest,
    ): Nothing = requireSafeConfirmation(admin)

    @DeleteMapping("/grants/{grantId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun revoke(
        admin: CurrentPlatformAdmin,
        @PathVariable("grantId") ignored: UUID,
    ): Nothing = requireSafeConfirmation(admin)
}

data class AdminSupportSearchRequest(
    val query: String,
    val clubId: UUID?,
)

data class AdminSupportGrantCreatePreviewRequest(
    val clubId: UUID,
    val granteeSubjectId: UUID,
    val scope: SupportAccessGrantScope,
    val expiresAt: OffsetDateTime,
    val reasonCategory: SupportGrantReasonCategory,
    val note: String?,
) {
    fun toCommand() = PreviewSupportGrantCreateCommand(clubId, granteeSubjectId, scope, expiresAt, reasonCategory, note)
}

data class AdminSupportGrantCreateConfirmRequest(
    val previewId: UUID,
    val idempotencyKey: String,
    val clubId: UUID,
    val granteeSubjectId: UUID,
    val scope: SupportAccessGrantScope,
    val expiresAt: OffsetDateTime,
    val reasonCategory: SupportGrantReasonCategory,
    val note: String?,
    val confirmed: Boolean,
) {
    fun toCommand() =
        ConfirmSupportGrantCreateCommand(
            previewId,
            idempotencyKey,
            clubId,
            granteeSubjectId,
            scope,
            expiresAt,
            reasonCategory,
            note,
            confirmed,
        )
}

data class AdminSupportGrantRevokePreviewRequest(
    val reasonCategory: SupportGrantReasonCategory,
    val note: String?,
) {
    fun toCommand() = PreviewSupportGrantRevokeCommand(reasonCategory, note)
}

data class AdminSupportGrantRevokeConfirmRequest(
    val previewId: UUID,
    val idempotencyKey: String,
    val clubId: UUID,
    val scope: SupportAccessGrantScope,
    val expiresAt: OffsetDateTime,
    val reasonCategory: SupportGrantReasonCategory,
    val note: String?,
    val confirmed: Boolean,
) {
    fun toCommand() =
        ConfirmSupportGrantRevokeCommand(
            previewId,
            idempotencyKey,
            clubId,
            scope,
            expiresAt,
            reasonCategory,
            note,
            confirmed,
        )
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
    val granteeDisplayName: String,
    val granteeMaskedEmail: String,
    val scope: String,
    val reasonCategory: String,
    val notePresent: Boolean,
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
                granteeDisplayName = item.granteeDisplayName,
                granteeMaskedEmail = item.granteeMaskedEmail,
                scope = item.scope.name,
                reasonCategory = item.reasonCategory,
                notePresent = item.notePresent,
                expiresAt = item.expiresAt,
                createdAt = item.createdAt,
                revokedAt = item.revokedAt,
                status = item.status,
                createdByRole = item.createdByRole,
            )
    }
}

data class AdminSupportGrantLedgerPageResponse(
    val items: List<AdminSupportGrantLedgerItemResponse>,
    val nextCursor: String?,
) {
    companion object {
        fun from(page: AdminSupportGrantLedgerPage) =
            AdminSupportGrantLedgerPageResponse(
                page.items.map(AdminSupportGrantLedgerItemResponse::from),
                page.nextCursor,
            )
    }
}
