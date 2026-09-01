package com.readmates.auth.application.model

import java.time.OffsetDateTime
import java.util.UUID

enum class HostInvitationLinkStatus { ACTIVE, PAUSED, EXHAUSTED, EXPIRED }

data class CreateHostInvitationLinkCommand(
    val name: String,
    val maxUses: Int,
    val expiresAt: OffsetDateTime,
    val idempotencyKey: String,
)

data class UpdateHostInvitationLinkCommand(
    val expectedRevision: Long,
    val name: String,
    val maxUses: Int,
    val expiresAt: OffsetDateTime,
    val status: HostInvitationLinkStatus,
    val idempotencyKey: String,
)

data class HostInvitationLink(
    val linkId: UUID,
    val name: String,
    val status: HostInvitationLinkStatus,
    val maxUses: Int,
    val usedCount: Int,
    val expiresAt: OffsetDateTime,
    val revision: Long,
    val createdAt: OffsetDateTime,
    val updatedAt: OffsetDateTime,
)

data class HostInvitationLinkReceipt(
    val receiptId: UUID,
    val action: String,
    val linkId: UUID,
    val revision: Long,
    val replayed: Boolean,
)

data class CreateHostInvitationLinkResult(
    val link: HostInvitationLink,
    val oneTimeSharePath: String?,
    val receipt: HostInvitationLinkReceipt,
)

data class UpdateHostInvitationLinkResult(
    val link: HostInvitationLink,
    val receipt: HostInvitationLinkReceipt,
)

data class HostInvitationLinkHistoryItem(
    val receiptId: UUID,
    val revision: Long,
    val action: String,
    val beforeSettings: Map<String, String?>,
    val afterSettings: Map<String, String?>,
    val occurredAt: OffsetDateTime,
)
