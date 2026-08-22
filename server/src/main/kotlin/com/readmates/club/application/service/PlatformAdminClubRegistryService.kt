package com.readmates.club.application.service

import com.readmates.club.application.PlatformAdminError
import com.readmates.club.application.PlatformAdminException
import com.readmates.club.application.model.ClubRegistrySearch
import com.readmates.club.application.model.PLATFORM_ADMIN_CLUB_LIST_MAX_LIMIT
import com.readmates.club.application.model.PlatformAdminClubDetail
import com.readmates.club.application.model.PlatformAdminClubList
import com.readmates.club.application.model.PlatformAdminClubListItem
import com.readmates.club.application.model.PlatformAdminClubListQuery
import com.readmates.club.application.model.UpdatePlatformAdminClubCommand
import com.readmates.club.application.port.`in`.GetPlatformAdminClubUseCase
import com.readmates.club.application.port.`in`.ListPlatformAdminClubsUseCase
import com.readmates.club.application.port.`in`.UpdatePlatformAdminClubUseCase
import com.readmates.club.application.port.out.LoadPlatformAdminClubsPort
import com.readmates.club.application.port.out.PlatformAdminClubRegistryQuery
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

@Service
class PlatformAdminClubRegistryService(
    private val loadClubsPort: LoadPlatformAdminClubsPort,
    private val updateClubPort: UpdatePlatformAdminClubPort,
    private val cursorSigner: PlatformAdminClubRegistryCursorSigner,
) : ListPlatformAdminClubsUseCase,
    GetPlatformAdminClubUseCase,
    UpdatePlatformAdminClubUseCase {
    override fun listClubs(
        admin: PlatformActor,
        query: PlatformAdminClubListQuery,
    ): PlatformAdminClubList {
        requireViewClubs(admin)
        val limit = validatedLimit(query.limit)
        val filter = normalizedFilter(query)
        val continuation = verifiedContinuation(query.cursor, filter)
        val rows =
            loadClubsPort.listClubs(
                PlatformAdminClubRegistryQuery(
                    search = filter.search,
                    lifecycle = filter.lifecycle,
                    visibility = filter.visibility,
                    domainStatus = filter.domainStatus,
                    onboardingState = filter.onboardingState,
                    afterNormalizedName = continuation?.lastNormalizedName,
                    afterClubId = continuation?.lastClubId,
                    limit = limit + 1,
                ),
            )
        val page = rows.take(limit)
        val nextCursor =
            if (rows.size > limit) {
                val last = page.last()
                cursorSigner.issue(
                    filter = filter,
                    lastNormalizedName = last.normalizedName,
                    lastClubId = last.item.clubId,
                )
            } else {
                null
            }
        return PlatformAdminClubList(
            items = page.map { row -> row.item },
            nextCursor = nextCursor,
        )
    }

    override fun getClub(
        admin: PlatformActor,
        clubId: UUID,
    ): PlatformAdminClubDetail {
        requireViewClubs(admin)
        return loadClubsPort.loadClubDetail(clubId)
            ?: throw PlatformAdminException(PlatformAdminError.CLUB_NOT_FOUND, "Club not found")
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

    private fun requireViewClubs(admin: PlatformActor) {
        if (!admin.can(PlatformCapability.VIEW_CLUBS)) {
            throw AccessDeniedException("Platform admin role cannot view clubs")
        }
    }

    private fun validatedLimit(limit: Int): Int {
        if (limit !in MIN_LIMIT..PLATFORM_ADMIN_CLUB_LIST_MAX_LIMIT) {
            throw PlatformAdminException(PlatformAdminError.INVALID_CLUB, "Invalid club list limit")
        }
        return limit
    }

    private fun normalizedFilter(query: PlatformAdminClubListQuery): PlatformAdminClubListCursorFilter =
        PlatformAdminClubListCursorFilter(
            search = ClubRegistrySearch.normalize(query.search),
            lifecycle = query.lifecycle,
            visibility = query.visibility,
            domainStatus = query.domainStatus,
            onboardingState = query.onboardingState,
        )

    private fun verifiedContinuation(
        rawCursor: String?,
        filter: PlatformAdminClubListCursorFilter,
    ): PlatformAdminClubListCursorClaims? {
        if (rawCursor.isNullOrBlank()) {
            return null
        }
        return cursorSigner.verify(rawCursor, filter)
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

    private companion object {
        private const val MIN_LIMIT = 1
    }
}
