package com.readmates.club.application.service

import com.readmates.club.application.PlatformAdminError
import com.readmates.club.application.PlatformAdminException
import com.readmates.club.application.model.PlatformAdminClubList
import com.readmates.club.application.model.PlatformAdminClubListItem
import com.readmates.club.application.model.UpdatePlatformAdminClubCommand
import com.readmates.club.application.port.`in`.ListPlatformAdminClubsUseCase
import com.readmates.club.application.port.`in`.UpdatePlatformAdminClubUseCase
import com.readmates.club.application.port.out.LoadPlatformAdminClubsPort
import com.readmates.club.application.port.out.UpdatePlatformAdminClubPatch
import com.readmates.club.application.port.out.UpdatePlatformAdminClubPort
import com.readmates.club.domain.ClubPublicVisibility
import com.readmates.club.domain.ClubStatus
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

private const val PLATFORM_ADMIN_CLUB_LIST_LIMIT = 100

@Service
class PlatformAdminClubRegistryService(
    private val loadClubsPort: LoadPlatformAdminClubsPort,
    private val updateClubPort: UpdatePlatformAdminClubPort,
) : ListPlatformAdminClubsUseCase,
    UpdatePlatformAdminClubUseCase {
    override fun listClubs(admin: CurrentPlatformAdmin): PlatformAdminClubList =
        PlatformAdminClubList(
            loadClubsPort.listClubs(limit = PLATFORM_ADMIN_CLUB_LIST_LIMIT),
        )

    @Transactional
    override fun updateClub(
        admin: CurrentPlatformAdmin,
        clubId: UUID,
        command: UpdatePlatformAdminClubCommand,
    ): PlatformAdminClubListItem {
        if (!admin.canManageClubDomains) {
            throw AccessDeniedException("Platform admin role cannot update clubs")
        }

        val current =
            loadClubsPort.loadClub(clubId)
                ?: throw PlatformAdminException(PlatformAdminError.CLUB_NOT_FOUND, "Club not found")
        validatePublicInfo(
            name = command.name ?: current.name,
            tagline = command.tagline ?: current.tagline,
            about = command.about ?: current.about,
        )

        if (
            command.publicVisibility == ClubPublicVisibility.PUBLIC &&
            current.status in setOf(ClubStatus.SUSPENDED, ClubStatus.ARCHIVED)
        ) {
            throw PlatformAdminException(
                PlatformAdminError.CLUB_PUBLISH_NOT_ALLOWED,
                "Club cannot be made public",
            )
        }

        val shouldActivateClub =
            command.publicVisibility == ClubPublicVisibility.PUBLIC &&
                current.status == ClubStatus.SETUP_REQUIRED
        val nextStatus =
            if (shouldActivateClub) {
                requireActiveHost(clubId)
                ClubStatus.ACTIVE
            } else {
                null
            }

        return updateClubPort.updateClub(
            clubId = clubId,
            patch =
                UpdatePlatformAdminClubPatch(
                    name = command.name?.trim(),
                    tagline = command.tagline?.trim(),
                    about = command.about?.trim(),
                    status = nextStatus,
                    publicVisibility = command.publicVisibility,
                ),
        ) ?: throw PlatformAdminException(PlatformAdminError.CLUB_NOT_FOUND, "Club not found")
    }

    private fun requireActiveHost(clubId: UUID) {
        if (loadClubsPort.activeHostCount(clubId) == 0) {
            throw PlatformAdminException(PlatformAdminError.CLUB_HOST_REQUIRED, "Active host required")
        }
    }

    private fun validatePublicInfo(
        name: String,
        tagline: String,
        about: String,
    ) {
        if (name.isBlank() || tagline.isBlank() || about.isBlank()) {
            throw PlatformAdminException(PlatformAdminError.INVALID_CLUB, "Club public info is required")
        }
    }
}
