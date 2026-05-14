package com.readmates.club.application.port.`in`

import com.readmates.club.application.model.CreateSupportAccessGrantCommand
import com.readmates.club.application.model.SupportAccessGrant
import com.readmates.shared.security.CurrentPlatformAdmin
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
