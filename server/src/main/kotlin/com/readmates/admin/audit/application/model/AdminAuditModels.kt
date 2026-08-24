package com.readmates.admin.audit.application.model

import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

data class AdminAuditListQuery(
    val filter: AdminAuditFilter,
    val pageRequest: PageRequest,
    val rawCursor: String? = null,
    val sensitiveTarget: String? = null,
)

data class AdminAuditFilter(
    val from: OffsetDateTime,
    val to: OffsetDateTime,
    val range: AdminAuditTimeRange?,
    val clubId: UUID?,
    val actorRole: AdminAuditActorRole?,
    val sourceSlice: AdminAuditSourceSlice?,
    val actionCategory: AdminAuditActionCategory?,
    val outcome: AdminAuditOutcome?,
) {
    companion object {
        fun defaultNow(now: OffsetDateTime): AdminAuditFilter =
            AdminAuditFilter(
                from = now.minusDays(DEFAULT_RANGE_DAYS).utc(),
                to = now.utc(),
                range = AdminAuditTimeRange.DAYS_7,
                clubId = null,
                actorRole = null,
                sourceSlice = null,
                actionCategory = null,
                outcome = null,
            )
    }
}

enum class AdminAuditTimeRange(
    val wireValue: String,
) {
    HOURS_24("24h"),
    DAYS_7("7d"),
    DAYS_30("30d"),
    DAYS_90("90d"),
}

enum class AdminAuditSourceSlice {
    S3,
    S4,
    S5,
    S6,
    PLATFORM,
    CLUB,
}

enum class AdminAuditActionCategory {
    NOTIFICATION,
    SUPPORT,
    CLUB_LIFECYCLE,
    AI_OPS,
    AUTH_SECURITY,
    PLATFORM_ADMIN,
}

enum class AdminAuditActorRole {
    OWNER,
    OPERATOR,
    SUPPORT,
    HOST,
    MEMBER,
    SYSTEM,
    UNKNOWN,
}

enum class AdminAuditOutcome {
    SUCCESS,
    FAILED,
    DENIED,
    PREPARED,
    UNKNOWN,
}

enum class AdminAuditMetadataState {
    AVAILABLE,
    EMPTY,
    UNAVAILABLE,
}

enum class AdminAuditSourceType(
    val tableName: String,
    val rank: Int,
    val nativeIdType: AdminAuditNativeIdType = AdminAuditNativeIdType.UUID,
) {
    PLATFORM("platform_audit_events", PLATFORM_SOURCE_RANK),
    CLUB("club_audit_events", CLUB_SOURCE_RANK),
    OPERATION_CASE_EVENT("admin_operation_case_events", OPERATION_CASE_EVENT_SOURCE_RANK),
    CLUB_COMMAND_RECEIPT("platform_admin_club_command_receipts", CLUB_COMMAND_RECEIPT_SOURCE_RANK),
    CLUB_CONVERGENCE_ATTEMPT(
        "platform_admin_club_command_convergence_events",
        CLUB_CONVERGENCE_ATTEMPT_SOURCE_RANK,
        AdminAuditNativeIdType.COMPOSITE,
    ),
    NOTIFICATION_CONFIRMATION("admin_notification_replay_confirmations", NOTIFICATION_CONFIRMATION_SOURCE_RANK),
    NOTIFICATION_CONVERGENCE_ATTEMPT(
        "admin_service_command_convergence_events:notification",
        NOTIFICATION_CONVERGENCE_ATTEMPT_SOURCE_RANK,
        AdminAuditNativeIdType.COMPOSITE,
    ),
    AI_COMMAND_RECEIPT("ai_generation_admin_command_receipts", AI_COMMAND_RECEIPT_SOURCE_RANK),
    AI_CONVERGENCE_ATTEMPT(
        "admin_service_command_convergence_events:ai",
        AI_CONVERGENCE_ATTEMPT_SOURCE_RANK,
        AdminAuditNativeIdType.COMPOSITE,
    ),
    SUPPORT_COMMAND_RECEIPT("platform_admin_support_command_receipts", SUPPORT_COMMAND_RECEIPT_SOURCE_RANK),
    PUBLIC_TAKEDOWN_RECEIPT("admin_public_takedown_receipts", PUBLIC_TAKEDOWN_RECEIPT_SOURCE_RANK),
    PUBLIC_CONVERGENCE_ATTEMPT(
        "public_convergence_events",
        PUBLIC_CONVERGENCE_ATTEMPT_SOURCE_RANK,
        AdminAuditNativeIdType.COMPOSITE,
    ),
    AI_GENERATION("ai_generation_audit_log", AI_GENERATION_SOURCE_RANK, AdminAuditNativeIdType.NUMERIC),
    NOTIFICATION_REPLAY_PREVIEW(
        "admin_notification_replay_previews",
        NOTIFICATION_REPLAY_PREVIEW_SOURCE_RANK,
    ),
}

enum class AdminAuditNativeIdType {
    UUID,
    NUMERIC,
    COMPOSITE,
}

data class AdminAuditTuple(
    val occurredAt: OffsetDateTime,
    val sourceRank: Int,
    val immutableSourceId: String,
)

data class AdminAuditCursorDraft(
    val snapshotTo: OffsetDateTime,
    val from: OffsetDateTime,
    val filterFingerprint: ByteArray,
    val excludedSources: Set<AdminAuditSourceType>,
    val after: AdminAuditTuple,
)

data class AdminAuditCursor(
    val schemaVersion: Int,
    val snapshotTo: OffsetDateTime,
    val from: OffsetDateTime,
    val filterFingerprint: ByteArray,
    val excludedSources: Set<AdminAuditSourceType>,
    val occurredAt: OffsetDateTime,
    val sourceRank: Int,
    val immutableSourceId: String,
    val keyVersion: Int,
    val issuedAt: OffsetDateTime,
    val expiresAt: OffsetDateTime,
)

data class AdminAuditSourceQuery(
    val filter: AdminAuditFilter,
    val snapshotTo: OffsetDateTime,
    val after: AdminAuditTuple?,
    val limit: Int,
    val sensitiveTarget: String? = null,
)

data class AdminAuditSourceRow(
    val sourceType: AdminAuditSourceType,
    val sourceId: String,
    val occurredAt: OffsetDateTime,
    val actorUserId: UUID?,
    val actorRole: String?,
    val clubId: UUID?,
    val targetUserId: UUID?,
    val actionType: String,
    val outcomeHint: String?,
    val metadataJson: String?,
)

data class AdminAuditLedgerPage(
    val generatedAt: OffsetDateTime,
    val filters: AdminAuditFilter,
    val summary: AdminAuditSummary,
    val items: List<AdminAuditLedgerItem>,
    val nextCursor: String?,
) {
    fun toCursorPage(): CursorPage<AdminAuditLedgerItem> = CursorPage(items, nextCursor)
}

data class AdminAuditSummary(
    val visibleCount: Int,
    val sourceUnavailableCount: Int,
    val metadataUnavailableCount: Int,
    val unavailableSources: List<AdminAuditSourceType>,
)

data class AdminAuditLedgerItem(
    val id: String,
    val occurredAt: OffsetDateTime,
    val sourceSlice: AdminAuditSourceSlice,
    val sourceTable: String,
    val actionCategory: AdminAuditActionCategory,
    val actionType: String,
    val outcome: AdminAuditOutcome,
    val actor: AdminAuditActor,
    val target: AdminAuditTarget,
    val summary: String,
    val safeMetadata: List<AdminAuditMetadata>,
    val metadataState: AdminAuditMetadataState,
)

data class AdminAuditActor(
    val userId: UUID?,
    val role: AdminAuditActorRole,
    val displayLabel: String,
)

data class AdminAuditTarget(
    val clubId: UUID?,
    val userId: UUID?,
    val jobId: UUID?,
    val eventId: String?,
    val label: String,
)

data class AdminAuditMetadata(
    val label: String,
    val value: String,
    val kind: String,
)

fun OffsetDateTime.utc(): OffsetDateTime = withOffsetSameInstant(ZoneOffset.UTC)

private const val DEFAULT_RANGE_DAYS = 7L
private const val PLATFORM_SOURCE_RANK = 10
private const val CLUB_SOURCE_RANK = 20
private const val OPERATION_CASE_EVENT_SOURCE_RANK = 30
private const val CLUB_COMMAND_RECEIPT_SOURCE_RANK = 40
private const val CLUB_CONVERGENCE_ATTEMPT_SOURCE_RANK = 50
private const val NOTIFICATION_CONFIRMATION_SOURCE_RANK = 60
private const val NOTIFICATION_CONVERGENCE_ATTEMPT_SOURCE_RANK = 70
private const val AI_COMMAND_RECEIPT_SOURCE_RANK = 80
private const val AI_CONVERGENCE_ATTEMPT_SOURCE_RANK = 90
private const val SUPPORT_COMMAND_RECEIPT_SOURCE_RANK = 100
private const val PUBLIC_TAKEDOWN_RECEIPT_SOURCE_RANK = 110
private const val PUBLIC_CONVERGENCE_ATTEMPT_SOURCE_RANK = 120
private const val AI_GENERATION_SOURCE_RANK = 130
private const val NOTIFICATION_REPLAY_PREVIEW_SOURCE_RANK = 140
