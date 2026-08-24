package com.readmates.club.application.port.`in`

import com.readmates.club.application.model.AdminSupportGrantLedgerPage
import com.readmates.club.application.model.AdminSupportSearchResult
import com.readmates.club.application.model.ConfirmSupportGrantCreateCommand
import com.readmates.club.application.model.ConfirmSupportGrantRevokeCommand
import com.readmates.club.application.model.CreateSupportAccessGrantCommand
import com.readmates.club.application.model.PreviewSupportGrantCreateCommand
import com.readmates.club.application.model.PreviewSupportGrantRevokeCommand
import com.readmates.club.application.model.SupportAccessGrant
import com.readmates.club.application.model.SupportGrantCommandPreview
import com.readmates.club.application.model.SupportGrantCommandReceipt
import com.readmates.shared.security.CurrentPlatformAdmin
import com.readmates.shared.security.PlatformActor
import java.util.UUID

interface CreateSupportAccessGrantUseCase {
    fun createSupportAccessGrant(
        admin: CurrentPlatformAdmin,
        command: CreateSupportAccessGrantCommand,
    ): SupportAccessGrant
}

interface RevokeSupportAccessGrantUseCase {
    fun revokeSupportAccessGrant(
        admin: CurrentPlatformAdmin,
        grantId: UUID,
    )
}

interface PreviewSupportGrantCommandUseCase {
    fun previewCreate(
        admin: PlatformActor,
        command: PreviewSupportGrantCreateCommand,
    ): SupportGrantCommandPreview

    fun previewRevoke(
        admin: PlatformActor,
        grantId: UUID,
        command: PreviewSupportGrantRevokeCommand,
    ): SupportGrantCommandPreview
}

interface ConfirmSupportGrantCommandUseCase {
    fun confirmCreate(
        admin: PlatformActor,
        command: ConfirmSupportGrantCreateCommand,
    ): SupportGrantCommandReceipt

    fun confirmRevoke(
        admin: PlatformActor,
        grantId: UUID,
        command: ConfirmSupportGrantRevokeCommand,
    ): SupportGrantCommandReceipt
}

interface ListSupportAccessGrantsUseCase {
    fun listByClub(
        admin: CurrentPlatformAdmin,
        clubId: UUID,
    ): List<SupportAccessGrant>

    fun listByGrantee(
        admin: CurrentPlatformAdmin,
        granteeUserId: UUID,
    ): List<SupportAccessGrant>
}

interface AdminSupportWorkbenchUseCase {
    fun search(
        admin: CurrentPlatformAdmin,
        query: String,
        clubId: UUID?,
    ): List<AdminSupportSearchResult>

    fun listGrantLedger(
        admin: CurrentPlatformAdmin,
        clubId: UUID?,
        status: String?,
        cursor: String?,
    ): AdminSupportGrantLedgerPage
}
