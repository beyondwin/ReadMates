package com.readmates.club.application.service

import com.readmates.club.application.PlatformAdminError
import com.readmates.club.application.PlatformAdminException
import com.readmates.club.application.model.PlatformAdminClubList
import com.readmates.club.application.model.PlatformAdminClubListItem
import com.readmates.club.application.model.UpdatePlatformAdminClubCommand
import com.readmates.club.application.port.`in`.ListPlatformAdminClubsUseCase
import com.readmates.club.application.port.`in`.UpdatePlatformAdminClubUseCase
import com.readmates.club.application.port.out.ClubPublicProjectionLock
import com.readmates.club.application.port.out.ClubPublicProjectionMutation
import com.readmates.club.application.port.out.ClubPublicProjectionMutationPort
import com.readmates.club.application.port.out.LoadPlatformAdminClubsPort
import com.readmates.club.application.port.out.UpdatePlatformAdminClubPatch
import com.readmates.club.application.port.out.UpdatePlatformAdminClubPort
import com.readmates.club.domain.ClubPublicVisibility
import com.readmates.club.domain.ClubStatus
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.PlatformActor
import com.readmates.shared.security.PlatformCapability
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

private const val PLATFORM_ADMIN_CLUB_LIST_LIMIT = 100

@Service
class PlatformAdminClubRegistryService(
    private val loadClubsPort: LoadPlatformAdminClubsPort,
    private val updateClubPort: UpdatePlatformAdminClubPort,
    private val publicProjection: ClubPublicProjectionMutationPort = ClubPublicProjectionMutationPort.Noop(),
) : ListPlatformAdminClubsUseCase,
    UpdatePlatformAdminClubUseCase {
    override fun listClubs(admin: PlatformActor): PlatformAdminClubList {
        if (!admin.can(PlatformCapability.VIEW_CLUBS)) {
            throw AccessDeniedException("Platform admin role cannot view clubs")
        }
        return PlatformAdminClubList(
            loadClubsPort.listClubs(limit = PLATFORM_ADMIN_CLUB_LIST_LIMIT),
        )
    }

    @Transactional
    override fun updateClub(
        admin: PlatformActor,
        clubId: UUID,
        command: UpdatePlatformAdminClubCommand,
    ): PlatformAdminClubListItem {
        if (!admin.can(PlatformCapability.MANAGE_CLUBS)) {
            throw AccessDeniedException("Platform admin role cannot update clubs")
        }

        val exposureLock =
            command.publicVisibility?.let { publicProjection.lockForExposure(clubId) }
        val current =
            loadClubsPort.loadClubForUpdate(clubId)
                ?: throw PlatformAdminException(PlatformAdminError.CLUB_NOT_FOUND, "Club not found")
        validatePublicInfo(
            name = command.name ?: current.name,
            tagline = command.tagline ?: current.tagline,
            about = command.about ?: current.about,
        )
        validatePublishTransition(command.publicVisibility, current.status)
        val nextStatus = activationStatus(clubId, command.publicVisibility, current.status)
        val updated =
            updateClubPort.updateClub(
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
        recordPublicChange(admin, current, updated, exposureLock)
        return updated
    }

    private fun recordPublicChange(
        admin: PlatformActor,
        current: PlatformAdminClubListItem,
        updated: PlatformAdminClubListItem,
        exposureLock: ClubPublicProjectionLock?,
    ) {
        val exposureChanged =
            current.status != updated.status || current.publicVisibility != updated.publicVisibility
        val metadataChanged =
            current.name != updated.name || current.tagline != updated.tagline || current.about != updated.about
        if (!exposureChanged && !metadataChanged) return
        publicProjection.record(
            ClubPublicProjectionMutation(
                clubId = updated.clubId,
                actorUserId = admin.adminId,
                operation =
                    if (exposureChanged) {
                        "PLATFORM_CLUB_EXPOSURE_UPDATED"
                    } else {
                        "PLATFORM_CLUB_METADATA_UPDATED"
                    },
                exposureChanged = exposureChanged,
                exposureLock = exposureLock,
            ),
        )
    }

    private fun validatePublishTransition(
        publicVisibility: ClubPublicVisibility?,
        currentStatus: ClubStatus,
    ) {
        if (
            publicVisibility == ClubPublicVisibility.PUBLIC &&
            currentStatus in setOf(ClubStatus.SUSPENDED, ClubStatus.ARCHIVED)
        ) {
            throw PlatformAdminException(
                PlatformAdminError.CLUB_PUBLISH_NOT_ALLOWED,
                "Club cannot be made public",
            )
        }
    }

    private fun activationStatus(
        clubId: UUID,
        publicVisibility: ClubPublicVisibility?,
        currentStatus: ClubStatus,
    ): ClubStatus? =
        if (
            publicVisibility == ClubPublicVisibility.PUBLIC &&
            currentStatus == ClubStatus.SETUP_REQUIRED
        ) {
            requireActiveHost(clubId)
            ClubStatus.ACTIVE
        } else {
            null
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
