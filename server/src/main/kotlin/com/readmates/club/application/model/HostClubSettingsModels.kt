package com.readmates.club.application.model

import java.time.OffsetDateTime
import java.util.UUID

enum class HostClubApprovalPolicy { INVITE_ONLY, HOST_APPROVAL }

enum class HostClubRecordPublicationDefault { HOST_ONLY, MEMBER, PUBLIC }

data class HostClubSettings(
    val clubId: UUID,
    val clubSlug: String,
    val name: String,
    val approvalPolicy: HostClubApprovalPolicy,
    val defaultTimezone: String,
    val scheduleReminderEnabled: Boolean,
    val recordPublicationDefault: HostClubRecordPublicationDefault,
    val revision: Long,
    val status: String,
)

data class UpdateHostClubSettingsCommand(
    val expectedRevision: Long,
    val name: String,
    val approvalPolicy: HostClubApprovalPolicy,
    val defaultTimezone: String,
    val scheduleReminderEnabled: Boolean,
    val recordPublicationDefault: HostClubRecordPublicationDefault,
    val idempotencyKey: String,
)

data class HostClubSettingsReceipt(
    val receiptId: UUID,
    val action: String,
    val revision: Long,
    val replayed: Boolean,
)

data class HostClubSettingsMutationResult(
    val settings: HostClubSettings,
    val receipt: HostClubSettingsReceipt,
)

data class HostCoHostMutationResult(
    val membershipId: UUID,
    val role: String,
    val revision: Long,
    val receipt: HostClubSettingsReceipt,
)

data class HostClubSettingsHistoryItem(
    val historyId: UUID,
    val revision: Long,
    val action: String,
    val subjectMembershipId: UUID?,
    val beforeSettings: Map<String, String?>,
    val afterSettings: Map<String, String?>,
    val occurredAt: OffsetDateTime,
)

data class HostClubClosePreview(
    val previewId: UUID,
    val clubId: UUID,
    val actorMembershipId: UUID,
    val clubRevision: Long,
    val effectHash: String,
    val effects: Map<String, String>,
    val expiresAt: OffsetDateTime,
)

data class HostClubCloseResult(
    val receiptId: UUID,
    val status: String,
    val revision: Long,
    val replayed: Boolean,
)

class HostClubSettingsException(
    val code: String,
    val kind: HostClubSettingsError,
    message: String,
) : RuntimeException(message)

enum class HostClubSettingsError { BAD_REQUEST, FORBIDDEN, NOT_FOUND, CONFLICT }
