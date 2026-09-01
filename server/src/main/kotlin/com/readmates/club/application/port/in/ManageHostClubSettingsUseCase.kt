@file:Suppress("ktlint:standard:package-name")

package com.readmates.club.application.port.`in`

import com.readmates.club.application.model.HostClubClosePreview
import com.readmates.club.application.model.HostClubCloseResult
import com.readmates.club.application.model.HostClubSettings
import com.readmates.club.application.model.HostClubSettingsHistoryItem
import com.readmates.club.application.model.HostClubSettingsMutationResult
import com.readmates.club.application.model.HostCoHostMutationResult
import com.readmates.club.application.model.UpdateHostClubSettingsCommand
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.ClubActor
import java.util.UUID

interface ManageHostClubSettingsUseCase {
    fun get(actor: ClubActor): HostClubSettings

    fun update(
        actor: ClubActor,
        command: UpdateHostClubSettingsCommand,
    ): HostClubSettingsMutationResult

    fun promoteCoHost(
        actor: ClubActor,
        membershipId: UUID,
        expectedRevision: Long,
        idempotencyKey: String,
    ): HostCoHostMutationResult

    fun demoteCoHost(
        actor: ClubActor,
        membershipId: UUID,
        expectedRevision: Long,
        idempotencyKey: String,
    ): HostCoHostMutationResult

    fun history(
        actor: ClubActor,
        pageRequest: PageRequest,
    ): CursorPage<HostClubSettingsHistoryItem>

    fun previewClubEnd(actor: ClubActor): HostClubClosePreview

    fun confirmClubEnd(
        actor: ClubActor,
        previewId: UUID,
        effectHash: String,
        idempotencyKey: String,
    ): HostClubCloseResult
}
