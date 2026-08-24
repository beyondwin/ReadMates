package com.readmates.club.application.port.`in`

import com.readmates.club.application.model.AdminClubOperationsSnapshot
import com.readmates.club.application.model.AdminTodayClosingRiskSnapshot
import com.readmates.club.application.model.ConfirmCreateClubDomainCommand
import com.readmates.club.application.model.ConfirmPlatformAdminClubVisibilityCommand
import com.readmates.club.application.model.PlatformAdminClubCommandPreview
import com.readmates.club.application.model.PlatformAdminClubCommandReceipt
import com.readmates.club.application.model.PlatformAdminClubDetail
import com.readmates.club.application.model.PlatformAdminClubDomain
import com.readmates.club.application.model.PlatformAdminClubList
import com.readmates.club.application.model.PlatformAdminClubListItem
import com.readmates.club.application.model.PlatformAdminClubListQuery
import com.readmates.club.application.model.PlatformAdminDashboardSummary
import com.readmates.club.application.model.PlatformAdminDomainCommandPreview
import com.readmates.club.application.model.PlatformAdminOnboardingCommand
import com.readmates.club.application.model.PlatformAdminOnboardingPreview
import com.readmates.club.application.model.PlatformAdminOnboardingResult
import com.readmates.club.application.model.PreviewCreateClubDomainCommand
import com.readmates.club.application.model.PreviewPlatformAdminClubVisibilityCommand
import com.readmates.club.application.model.RecheckClubDomainCommand
import com.readmates.club.application.model.UpdatePlatformAdminClubCommand
import com.readmates.shared.security.CurrentPlatformAdmin
import com.readmates.shared.security.PlatformActor
import java.util.UUID

interface PlatformAdminSummaryUseCase {
    fun summary(admin: CurrentPlatformAdmin): PlatformAdminDashboardSummary
}

interface CreateClubDomainUseCase {
    fun createClubDomain(
        admin: PlatformActor,
        clubId: UUID,
        command: ConfirmCreateClubDomainCommand,
    ): PlatformAdminClubCommandReceipt
}

interface PreviewClubDomainUseCase {
    fun previewClubDomain(
        admin: PlatformActor,
        clubId: UUID,
        command: PreviewCreateClubDomainCommand,
    ): PlatformAdminDomainCommandPreview
}

interface CheckClubDomainProvisioningUseCase {
    fun checkClubDomainProvisioning(
        admin: PlatformActor,
        domainId: UUID,
        command: RecheckClubDomainCommand,
    ): PlatformAdminClubCommandReceipt
}

interface ListPlatformAdminClubsUseCase {
    fun listClubs(
        admin: PlatformActor,
        query: PlatformAdminClubListQuery = PlatformAdminClubListQuery(),
    ): PlatformAdminClubList
}

interface GetPlatformAdminClubUseCase {
    fun getClub(
        admin: PlatformActor,
        clubId: UUID,
    ): PlatformAdminClubDetail
}

interface UpdatePlatformAdminClubUseCase {
    fun updateClub(
        admin: PlatformActor,
        clubId: UUID,
        command: UpdatePlatformAdminClubCommand,
    ): PlatformAdminClubDetail
}

interface PreviewPlatformAdminClubVisibilityUseCase {
    fun previewVisibility(
        admin: PlatformActor,
        clubId: UUID,
        command: PreviewPlatformAdminClubVisibilityCommand,
    ): PlatformAdminClubCommandPreview
}

interface ConfirmPlatformAdminClubVisibilityUseCase {
    fun confirmVisibility(
        admin: PlatformActor,
        clubId: UUID,
        command: ConfirmPlatformAdminClubVisibilityCommand,
    ): PlatformAdminClubCommandReceipt
}

interface PreviewPlatformAdminClubOnboardingUseCase {
    fun preview(
        admin: PlatformActor,
        command: PlatformAdminOnboardingCommand,
    ): PlatformAdminOnboardingPreview
}

interface CommitPlatformAdminClubOnboardingUseCase {
    fun commit(
        admin: PlatformActor,
        command: PlatformAdminOnboardingCommand,
    ): PlatformAdminOnboardingResult
}

interface GetAdminClubOperationsUseCase {
    fun operationsSnapshot(
        admin: PlatformActor,
        clubId: UUID,
    ): AdminClubOperationsSnapshot
}

interface ListAdminTodayClosingRisksUseCase {
    fun todayClosingRisks(admin: PlatformActor): AdminTodayClosingRiskSnapshot
}
