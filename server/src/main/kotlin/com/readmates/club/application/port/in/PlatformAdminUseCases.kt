package com.readmates.club.application.port.`in`

import com.readmates.club.application.model.AdminClubOperationsSnapshot
import com.readmates.club.application.model.AdminTodayClosingRiskSnapshot
import com.readmates.club.application.model.CreateClubDomainCommand
import com.readmates.club.application.model.PlatformAdminClubDomain
import com.readmates.club.application.model.PlatformAdminClubList
import com.readmates.club.application.model.PlatformAdminClubListItem
import com.readmates.club.application.model.PlatformAdminDashboardSummary
import com.readmates.club.application.model.PlatformAdminOnboardingCommand
import com.readmates.club.application.model.PlatformAdminOnboardingPreview
import com.readmates.club.application.model.PlatformAdminOnboardingResult
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
        command: CreateClubDomainCommand,
    ): PlatformAdminClubDomain
}

interface CheckClubDomainProvisioningUseCase {
    fun checkClubDomainProvisioning(
        admin: PlatformActor,
        domainId: UUID,
    ): PlatformAdminClubDomain
}

interface ListPlatformAdminClubsUseCase {
    fun listClubs(admin: PlatformActor): PlatformAdminClubList
}

interface UpdatePlatformAdminClubUseCase {
    fun updateClub(
        admin: PlatformActor,
        clubId: UUID,
        command: UpdatePlatformAdminClubCommand,
    ): PlatformAdminClubListItem
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
