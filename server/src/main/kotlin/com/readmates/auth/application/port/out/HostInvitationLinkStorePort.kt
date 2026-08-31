package com.readmates.auth.application.port.out

import com.readmates.auth.application.model.HostInvitationLinkStatus
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import java.time.OffsetDateTime
import java.util.UUID

data class StoredHostInvitationLink(
    val id: UUID,
    val clubId: UUID,
    val createdByMembershipId: UUID,
    val clubSlug: String,
    val clubName: String,
    val name: String,
    val tokenHash: String,
    val status: HostInvitationLinkStatus,
    val maxUses: Int,
    val usedCount: Int,
    val expiresAt: OffsetDateTime,
    val revision: Long,
    val createdAt: OffsetDateTime,
    val updatedAt: OffsetDateTime,
)

data class StoredHostInvitationLinkCommand(
    val receiptId: UUID,
    val clubId: UUID,
    val actorMembershipId: UUID?,
    val linkId: UUID,
    val action: String,
    val idempotencyKeyHash: String,
    val requestHash: String,
    val resultRevision: Long,
)

data class StoredHostInvitationLinkEvent(
    val receiptId: UUID,
    val linkId: UUID,
    val clubId: UUID,
    val revision: Long,
    val action: String,
    val beforeSettings: Map<String, String?>,
    val afterSettings: Map<String, String?>,
    val actorMembershipId: UUID?,
    val idempotencyKeyHash: String,
    val requestHash: String,
    val occurredAt: OffsetDateTime,
)

interface HostInvitationLinkStorePort {
    fun lockClub(clubId: UUID)

    fun findCommand(
        clubId: UUID,
        actorMembershipId: UUID,
        idempotencyKeyHash: String,
    ): StoredHostInvitationLinkCommand?

    fun insertLink(
        link: StoredHostInvitationLink,
        command: StoredHostInvitationLinkCommand,
        event: StoredHostInvitationLinkEvent,
    )

    fun list(
        clubId: UUID,
        pageRequest: PageRequest,
    ): CursorPage<StoredHostInvitationLink>

    fun findForUpdate(
        clubId: UUID,
        linkId: UUID,
    ): StoredHostInvitationLink?

    fun update(
        link: StoredHostInvitationLink,
        command: StoredHostInvitationLinkCommand,
        event: StoredHostInvitationLinkEvent,
    )

    fun history(
        clubId: UUID,
        linkId: UUID,
        pageRequest: PageRequest,
    ): CursorPage<StoredHostInvitationLinkEvent>

    fun findByTokenHash(
        tokenHash: String,
        forUpdate: Boolean,
    ): StoredHostInvitationLink?

    fun consume(
        linkId: UUID,
        expectedRevision: Long,
        event: StoredHostInvitationLinkEvent,
    ): StoredHostInvitationLink
}
