package com.readmates.club.application.port.out

import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import java.time.OffsetDateTime
import java.util.UUID

data class StoredHostClubSettings(
    val clubId: UUID,
    val clubSlug: String,
    val name: String,
    val approvalPolicy: String,
    val defaultTimezone: String,
    val scheduleReminderEnabled: Boolean,
    val recordPublicationDefault: String,
    val hostSettingsRevision: Long,
    val status: String,
)

data class StoredHostClubSettingsCommand(
    val receiptId: UUID,
    val clubId: UUID,
    val actorMembershipId: UUID,
    val action: String,
    val keyHash: String,
    val requestHash: String,
    val resultRevision: Long,
    val safeResult: Map<String, String?>,
    val occurredAt: OffsetDateTime,
)

data class StoredHostClubSettingsHistory(
    val id: UUID,
    val clubId: UUID,
    val revision: Long,
    val action: String,
    val actorMembershipId: UUID,
    val subjectMembershipId: UUID?,
    val beforeSettings: Map<String, String?>,
    val afterSettings: Map<String, String?>,
    val occurredAt: OffsetDateTime,
)

data class StoredHostClubClosePreview(
    val id: UUID,
    val clubId: UUID,
    val actorMembershipId: UUID,
    val clubRevision: Long,
    val effectHash: String,
    val effects: Map<String, String>,
    val expiresAt: OffsetDateTime,
    val consumedReceiptId: UUID?,
    val createdAt: OffsetDateTime,
)

interface HostClubSettingsStorePort {
    fun load(
        clubId: UUID,
        forUpdate: Boolean,
    ): StoredHostClubSettings?

    fun findCommand(
        clubId: UUID,
        actorMembershipId: UUID,
        keyHash: String,
    ): StoredHostClubSettingsCommand?

    fun updateSettings(
        next: StoredHostClubSettings,
        expectedRevision: Long,
        history: StoredHostClubSettingsHistory,
        command: StoredHostClubSettingsCommand,
    )

    fun activeHostCount(clubId: UUID): Int

    fun membershipRole(
        clubId: UUID,
        membershipId: UUID,
        forUpdate: Boolean,
    ): String?

    fun updateMembershipRole(
        clubId: UUID,
        membershipId: UUID,
        role: String,
    )

    fun appendHistoryAndCommand(
        history: StoredHostClubSettingsHistory,
        command: StoredHostClubSettingsCommand,
    )

    fun history(
        clubId: UUID,
        pageRequest: PageRequest,
    ): CursorPage<StoredHostClubSettingsHistory>

    fun saveClosePreview(preview: StoredHostClubClosePreview)

    fun loadClosePreview(
        previewId: UUID,
        forUpdate: Boolean,
    ): StoredHostClubClosePreview?

    fun archiveClub(
        clubId: UUID,
        expectedRevision: Long,
        previewId: UUID,
        command: StoredHostClubSettingsCommand,
        history: StoredHostClubSettingsHistory,
    )
}
