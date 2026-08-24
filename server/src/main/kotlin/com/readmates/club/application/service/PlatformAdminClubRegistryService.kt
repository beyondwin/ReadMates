package com.readmates.club.application.service

import com.readmates.club.application.PlatformAdminError
import com.readmates.club.application.PlatformAdminException
import com.readmates.club.application.model.ClubRegistrySearch
import com.readmates.club.application.model.PLATFORM_ADMIN_CLUB_LIST_MAX_LIMIT
import com.readmates.club.application.model.PlatformAdminClubDetail
import com.readmates.club.application.model.PlatformAdminClubList
import com.readmates.club.application.model.PlatformAdminClubListQuery
import com.readmates.club.application.model.UpdatePlatformAdminClubCommand
import com.readmates.club.application.port.`in`.GetPlatformAdminClubUseCase
import com.readmates.club.application.port.`in`.ListPlatformAdminClubsUseCase
import com.readmates.club.application.port.`in`.UpdatePlatformAdminClubUseCase
import com.readmates.club.application.port.out.ClubPublicProjectionMutation
import com.readmates.club.application.port.out.ClubPublicProjectionMutationPort
import com.readmates.club.application.port.out.LoadPlatformAdminClubsPort
import com.readmates.club.application.port.out.PlatformAdminClubRegistryQuery
import com.readmates.club.application.port.out.UpdatePlatformAdminClubPatch
import com.readmates.club.application.port.out.UpdatePlatformAdminClubPort
import com.readmates.club.application.port.out.UpdatePlatformAdminClubResult
import com.readmates.club.application.port.out.WritePlatformAuditEventPort
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
    private val auditEventPort: WritePlatformAuditEventPort,
    private val publicProjection: ClubPublicProjectionMutationPort = ClubPublicProjectionMutationPort.Noop(),
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
            rows.takeIf { it.size > limit }?.let {
                val last = page.last()
                cursorSigner.issue(filter, last.normalizedName, last.item.clubId)
            }
        return PlatformAdminClubList(page.map { row -> row.item }, nextCursor)
    }

    override fun getClub(
        admin: PlatformActor,
        clubId: UUID,
    ): PlatformAdminClubDetail {
        requireViewClubs(admin)
        return requireClub(clubId)
    }

    @Transactional
    override fun updateClub(
        admin: PlatformActor,
        clubId: UUID,
        command: UpdatePlatformAdminClubCommand,
    ): PlatformAdminClubDetail {
        requireManageClubs(admin)
        val current = requireClub(clubId)
        PlatformAdminClubPublicInfoPolicy.validate(
            command.name ?: current.name,
            command.tagline ?: current.tagline,
            command.about ?: current.about,
        )
        val updated =
            updatedDetail(
                updateClubPort.updateClubMetadata(
                    clubId,
                    command.expectedAdminRevision,
                    UpdatePlatformAdminClubPatch(
                        command.name?.trim(),
                        command.tagline?.trim(),
                        command.about?.trim(),
                    ),
                ),
            )
        auditEventPort.writeEvent(
            actorUserId = admin.adminId,
            actorPlatformRole = admin.role.name,
            targetUserId = null,
            eventType = "ADMIN_CLUB_METADATA_UPDATED",
            metadataJson =
                """{"clubId":"$clubId","beforeAdminRevision":${command.expectedAdminRevision},""" +
                    """"afterAdminRevision":${updated.adminRevision}}""",
        )
        publicProjection.record(
            ClubPublicProjectionMutation(
                clubId = updated.clubId,
                actorUserId = admin.adminId,
                operation = "PLATFORM_CLUB_METADATA_UPDATED",
                exposureChanged = false,
                exposureLock = null,
            ),
        )
        return updated
    }

    private fun requireViewClubs(admin: PlatformActor) {
        if (!admin.can(PlatformCapability.VIEW_CLUBS)) {
            throw AccessDeniedException("Platform admin role cannot view clubs")
        }
    }

    private fun requireManageClubs(admin: PlatformActor) {
        if (!admin.can(PlatformCapability.MANAGE_CLUBS)) {
            throw AccessDeniedException("Platform admin role cannot update clubs")
        }
    }

    private fun requireClub(clubId: UUID): PlatformAdminClubDetail =
        loadClubsPort.loadClubDetail(clubId)
            ?: throw PlatformAdminException(PlatformAdminError.CLUB_NOT_FOUND, "Club not found")

    private fun updatedDetail(result: UpdatePlatformAdminClubResult): PlatformAdminClubDetail =
        when (result) {
            is UpdatePlatformAdminClubResult.Updated -> result.detail
            UpdatePlatformAdminClubResult.NotFound ->
                throw PlatformAdminException(PlatformAdminError.CLUB_NOT_FOUND, "Club not found")
            UpdatePlatformAdminClubResult.RevisionConflict ->
                throw PlatformAdminException(PlatformAdminError.REVISION_CONFLICT, "Club revision conflict")
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
        val cursor = rawCursor?.takeUnless(String::isBlank)
        return cursor?.let { cursorSigner.verify(it, filter) }
    }

    private companion object {
        private const val MIN_LIMIT = 1
    }
}
