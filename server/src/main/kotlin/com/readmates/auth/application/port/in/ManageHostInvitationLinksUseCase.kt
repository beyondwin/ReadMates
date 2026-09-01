@file:Suppress("ktlint:standard:package-name")

package com.readmates.auth.application.port.`in`

import com.readmates.auth.application.model.CreateHostInvitationLinkCommand
import com.readmates.auth.application.model.CreateHostInvitationLinkResult
import com.readmates.auth.application.model.HostInvitationLink
import com.readmates.auth.application.model.HostInvitationLinkHistoryItem
import com.readmates.auth.application.model.UpdateHostInvitationLinkCommand
import com.readmates.auth.application.model.UpdateHostInvitationLinkResult
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.ClubActor
import java.util.UUID

interface ManageHostInvitationLinksUseCase {
    fun create(
        actor: ClubActor,
        command: CreateHostInvitationLinkCommand,
    ): CreateHostInvitationLinkResult

    fun update(
        actor: ClubActor,
        linkId: UUID,
        command: UpdateHostInvitationLinkCommand,
    ): UpdateHostInvitationLinkResult

    fun list(
        actor: ClubActor,
        pageRequest: PageRequest,
    ): CursorPage<HostInvitationLink>

    fun history(
        actor: ClubActor,
        linkId: UUID,
        pageRequest: PageRequest,
    ): CursorPage<HostInvitationLinkHistoryItem>
}
