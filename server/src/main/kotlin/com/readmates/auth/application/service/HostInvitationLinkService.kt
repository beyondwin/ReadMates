package com.readmates.auth.application.service

import com.readmates.auth.application.InvitationDomainError
import com.readmates.auth.application.InvitationDomainException
import com.readmates.auth.application.model.CreateHostInvitationLinkCommand
import com.readmates.auth.application.model.CreateHostInvitationLinkResult
import com.readmates.auth.application.model.HostInvitationLink
import com.readmates.auth.application.model.HostInvitationLinkHistoryItem
import com.readmates.auth.application.model.HostInvitationLinkReceipt
import com.readmates.auth.application.model.HostInvitationLinkStatus
import com.readmates.auth.application.model.UpdateHostInvitationLinkCommand
import com.readmates.auth.application.model.UpdateHostInvitationLinkResult
import com.readmates.auth.application.port.`in`.ManageHostInvitationLinksUseCase
import com.readmates.auth.application.port.out.HostInvitationLinkStorePort
import com.readmates.auth.application.port.out.StoredHostInvitationLink
import com.readmates.auth.application.port.out.StoredHostInvitationLinkCommand
import com.readmates.auth.application.port.out.StoredHostInvitationLinkEvent
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.ClubActor
import com.readmates.shared.security.ClubCapability
import com.readmates.shared.security.TokenHashing
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.OffsetDateTime
import java.util.UUID

@Service
class HostInvitationLinkService(
    private val store: HostInvitationLinkStorePort,
    private val tokenService: InvitationTokenService,
    private val clock: Clock = Clock.systemUTC(),
) : ManageHostInvitationLinksUseCase {
    private val normalizer = HostInvitationLinkNormalizer(clock)
    private val guards = HostInvitationLinkGuards(clock)
    private val mapping = HostInvitationLinkMapping()

    @Transactional
    override fun create(
        actor: ClubActor,
        command: CreateHostInvitationLinkCommand,
    ): CreateHostInvitationLinkResult {
        guards.requireManager(actor)
        val normalized = normalizer.normalize(command)
        val keyHash = mapping.hashKey(normalized.idempotencyKey)
        val requestHash = mapping.createRequestHash(normalized)
        store.lockClub(actor.clubId)
        store.findCommand(actor.clubId, actor.membershipId, keyHash)?.let { replay ->
            guards.requireMatchingReplay(replay.requestHash, requestHash)
            val link = store.findForUpdate(actor.clubId, replay.linkId) ?: guards.notFound()
            return CreateHostInvitationLinkResult(
                link = mapping.toPublic(link, guards.now()),
                oneTimeSharePath = null,
                receipt = mapping.toReceipt(replay, replayed = true),
            )
        }

        val now = guards.now()
        val rawToken = "lnk_${tokenService.generateToken()}"
        val linkId = UUID.randomUUID()
        val receiptId = UUID.randomUUID()
        val link =
            StoredHostInvitationLink(
                id = linkId,
                clubId = actor.clubId,
                createdByMembershipId = actor.membershipId,
                clubSlug = actor.clubSlug,
                clubName = actor.clubSlug,
                name = normalized.name,
                tokenHash = tokenService.hashToken(rawToken),
                status = HostInvitationLinkStatus.ACTIVE,
                maxUses = normalized.maxUses,
                usedCount = 0,
                expiresAt = normalized.expiresAt,
                revision = 0,
                createdAt = now,
                updatedAt = now,
            )
        val event =
            mapping.event(
                receiptId,
                link,
                "CREATED",
                emptyMap(),
                mapping.settings(link),
                actor.membershipId,
                keyHash,
                requestHash,
                now,
            )
        store.insertLink(link, mapping.toCommand(event), event)
        return CreateHostInvitationLinkResult(
            link = mapping.toPublic(link, now),
            oneTimeSharePath = "/clubs/${actor.clubSlug}/invite/$rawToken",
            receipt = mapping.toReceipt(mapping.toCommand(event), replayed = false),
        )
    }

    @Transactional
    override fun update(
        actor: ClubActor,
        linkId: UUID,
        command: UpdateHostInvitationLinkCommand,
    ): UpdateHostInvitationLinkResult {
        guards.requireManager(actor)
        val normalized = normalizer.normalize(command)
        val keyHash = mapping.hashKey(normalized.idempotencyKey)
        val requestHash = mapping.updateRequestHash(linkId, normalized)
        store.lockClub(actor.clubId)
        store.findCommand(actor.clubId, actor.membershipId, keyHash)?.let { replay ->
            guards.requireMatchingReplay(replay.requestHash, requestHash)
            val link = store.findForUpdate(actor.clubId, replay.linkId) ?: guards.notFound()
            return UpdateHostInvitationLinkResult(
                mapping.toPublic(link, guards.now()),
                mapping.toReceipt(replay, replayed = true),
            )
        }
        val current = store.findForUpdate(actor.clubId, linkId) ?: guards.notFound()
        if (current.revision != normalized.expectedRevision) {
            guards.conflict("INVITATION_LINK_STALE", "Invitation link changed")
        }
        guards.validateTransition(current, normalized.status, normalized.maxUses, normalized.expiresAt)
        val now = guards.now()
        val next =
            current.copy(
                name = normalized.name,
                maxUses = normalized.maxUses,
                expiresAt = normalized.expiresAt,
                status = normalized.status,
                revision = current.revision + 1,
                updatedAt = now,
            )
        val event =
            mapping.event(
                UUID.randomUUID(),
                next,
                "UPDATED",
                mapping.settings(current),
                mapping.settings(next),
                actor.membershipId,
                keyHash,
                requestHash,
                now,
            )
        store.update(next, mapping.toCommand(event), event)
        return UpdateHostInvitationLinkResult(
            mapping.toPublic(next, now),
            mapping.toReceipt(mapping.toCommand(event), replayed = false),
        )
    }

    override fun list(
        actor: ClubActor,
        pageRequest: PageRequest,
    ): CursorPage<HostInvitationLink> {
        guards.requireManager(actor)
        val page = store.list(actor.clubId, pageRequest)
        return CursorPage(page.items.map { mapping.toPublic(it, guards.now()) }, page.nextCursor)
    }

    override fun history(
        actor: ClubActor,
        linkId: UUID,
        pageRequest: PageRequest,
    ): CursorPage<HostInvitationLinkHistoryItem> {
        guards.requireManager(actor)
        store.findForUpdate(actor.clubId, linkId) ?: guards.notFound()
        val page = store.history(actor.clubId, linkId, pageRequest)
        return CursorPage(
            page.items.map {
                HostInvitationLinkHistoryItem(
                    it.receiptId,
                    it.revision,
                    it.action,
                    it.beforeSettings,
                    it.afterSettings,
                    it.occurredAt,
                )
            },
            page.nextCursor,
        )
    }
}

private class HostInvitationLinkNormalizer(
    private val clock: Clock,
) {
    fun normalize(command: CreateHostInvitationLinkCommand): CreateHostInvitationLinkCommand =
        command
            .copy(
                name = normalizeName(command.name),
                idempotencyKey = normalizeKey(command.idempotencyKey),
            ).also { validateUsesAndExpiry(it.maxUses, it.expiresAt) }

    fun normalize(command: UpdateHostInvitationLinkCommand): UpdateHostInvitationLinkCommand =
        command
            .copy(
                name = normalizeName(command.name),
                idempotencyKey = normalizeKey(command.idempotencyKey),
            ).also {
                if (it.expectedRevision < 0) {
                    invalid("INVALID_INVITATION_LINK_REVISION", "Revision must be non-negative")
                }
                validateUsesAndExpiry(it.maxUses, it.expiresAt)
            }

    private fun normalizeName(value: String): String =
        value.trim().takeIf { it.isNotEmpty() && it.length <= MAX_NAME_LENGTH }
            ?: invalid("INVALID_INVITATION_LINK_NAME", "Name must be 1 to 120 characters")

    private fun normalizeKey(value: String): String =
        value.trim().takeIf { it.length in 1..MAX_IDEMPOTENCY_KEY_LENGTH }
            ?: invalid("INVALID_IDEMPOTENCY_KEY", "Idempotency key must be 1 to 200 characters")

    private fun validateUsesAndExpiry(
        maxUses: Int,
        expiresAt: OffsetDateTime,
    ) {
        if (maxUses !in 1..MAX_LINK_USES) {
            invalid("INVALID_INVITATION_LINK_MAX_USES", "Max uses must be 1 to 10000")
        }
        if (!expiresAt.isAfter(OffsetDateTime.now(clock))) {
            invalid("INVALID_INVITATION_LINK_EXPIRY", "Expiry must be in the future")
        }
    }

    private fun invalid(
        code: String,
        message: String,
    ): Nothing = throw InvitationDomainException(code, InvitationDomainError.BAD_REQUEST, message)

    private companion object {
        const val MAX_NAME_LENGTH = 120
        const val MAX_IDEMPOTENCY_KEY_LENGTH = 200
        const val MAX_LINK_USES = 10_000
    }
}

private class HostInvitationLinkGuards(
    private val clock: Clock,
) {
    fun validateTransition(
        current: StoredHostInvitationLink,
        desired: HostInvitationLinkStatus,
        maxUses: Int,
        expiresAt: OffsetDateTime,
    ) {
        if (maxUses < current.usedCount) {
            invalid("INVALID_INVITATION_LINK_MAX_USES", "Max uses cannot be below used count")
        }
        if (desired == HostInvitationLinkStatus.ACTIVE) {
            if (current.usedCount >= maxUses) conflict("INVITATION_LINK_EXHAUSTED", "Invitation link is exhausted")
            if (!expiresAt.isAfter(now())) conflict("INVITATION_LINK_EXPIRED", "Invitation link is expired")
        }
        if (desired == HostInvitationLinkStatus.EXHAUSTED || desired == HostInvitationLinkStatus.EXPIRED) {
            invalid("INVALID_INVITATION_LINK_STATUS", "Derived invitation link status cannot be set directly")
        }
    }

    fun requireManager(actor: ClubActor) {
        if (!actor.can(ClubCapability.MANAGE_INVITATIONS)) {
            throw InvitationDomainException(
                "HOST_REQUIRED",
                InvitationDomainError.FORBIDDEN,
                "Host role required",
            )
        }
    }

    fun requireMatchingReplay(
        stored: String,
        requested: String,
    ) {
        if (stored != requested) {
            conflict(
                "INVITATION_LINK_IDEMPOTENCY_CONFLICT",
                "Idempotency key was used for a different command",
            )
        }
    }

    fun now() = OffsetDateTime.now(clock)

    fun notFound(): Nothing =
        throw InvitationDomainException(
            "INVITATION_LINK_NOT_FOUND",
            InvitationDomainError.NOT_FOUND,
            "Invitation link not found",
        )

    private fun invalid(
        code: String,
        message: String,
    ): Nothing = throw InvitationDomainException(code, InvitationDomainError.BAD_REQUEST, message)

    fun conflict(
        code: String,
        message: String,
    ): Nothing = throw InvitationDomainException(code, InvitationDomainError.CONFLICT, message)
}

private class HostInvitationLinkMapping {
    private fun effectiveStatus(
        link: StoredHostInvitationLink,
        at: OffsetDateTime,
    ): HostInvitationLinkStatus =
        when {
            link.status == HostInvitationLinkStatus.PAUSED -> HostInvitationLinkStatus.PAUSED
            !link.expiresAt.isAfter(at) -> HostInvitationLinkStatus.EXPIRED
            link.usedCount >= link.maxUses -> HostInvitationLinkStatus.EXHAUSTED
            else -> HostInvitationLinkStatus.ACTIVE
        }

    fun toPublic(
        link: StoredHostInvitationLink,
        at: OffsetDateTime,
    ) = HostInvitationLink(
        link.id,
        link.name,
        effectiveStatus(link, at),
        link.maxUses,
        link.usedCount,
        link.expiresAt,
        link.revision,
        link.createdAt,
        link.updatedAt,
    )

    fun event(
        receiptId: UUID,
        link: StoredHostInvitationLink,
        action: String,
        before: Map<String, String?>,
        after: Map<String, String?>,
        actorMembershipId: UUID?,
        keyHash: String,
        requestHash: String,
        occurredAt: OffsetDateTime,
    ) = StoredHostInvitationLinkEvent(
        receiptId,
        link.id,
        link.clubId,
        link.revision,
        action,
        before,
        after,
        actorMembershipId,
        keyHash,
        requestHash,
        occurredAt,
    )

    fun settings(link: StoredHostInvitationLink): Map<String, String?> =
        linkedMapOf(
            "name" to link.name,
            "maxUses" to link.maxUses.toString(),
            "expiresAt" to link.expiresAt.toString(),
            "status" to link.status.name,
        )

    fun toCommand(event: StoredHostInvitationLinkEvent) =
        StoredHostInvitationLinkCommand(
            event.receiptId,
            event.clubId,
            event.actorMembershipId,
            event.linkId,
            event.action,
            event.idempotencyKeyHash,
            event.requestHash,
            event.revision,
        )

    fun toReceipt(
        command: StoredHostInvitationLinkCommand,
        replayed: Boolean,
    ) = HostInvitationLinkReceipt(
        command.receiptId,
        command.action,
        command.linkId,
        command.resultRevision,
        replayed,
    )

    fun createRequestHash(command: CreateHostInvitationLinkCommand) =
        TokenHashing.sha256("create\u0000${command.name}\u0000${command.maxUses}\u0000${command.expiresAt}")

    fun updateRequestHash(
        linkId: UUID,
        command: UpdateHostInvitationLinkCommand,
    ) = TokenHashing.sha256(
        "update\u0000$linkId\u0000${command.expectedRevision}\u0000${command.name}\u0000" +
            "${command.maxUses}\u0000${command.expiresAt}\u0000${command.status}",
    )

    fun hashKey(value: String) = TokenHashing.sha256("host-invitation-link\u0000$value")
}
