@file:Suppress("TooManyFunctions")

package com.readmates.admin.audit.application.service

import com.readmates.admin.audit.application.AdminAuditError
import com.readmates.admin.audit.application.AdminAuditException
import com.readmates.admin.audit.application.model.AdminAuditActionCategory
import com.readmates.admin.audit.application.model.AdminAuditActor
import com.readmates.admin.audit.application.model.AdminAuditActorRole
import com.readmates.admin.audit.application.model.AdminAuditFilter
import com.readmates.admin.audit.application.model.AdminAuditLedgerItem
import com.readmates.admin.audit.application.model.AdminAuditLedgerPage
import com.readmates.admin.audit.application.model.AdminAuditListQuery
import com.readmates.admin.audit.application.model.AdminAuditMetadata
import com.readmates.admin.audit.application.model.AdminAuditMetadataState
import com.readmates.admin.audit.application.model.AdminAuditOutcome
import com.readmates.admin.audit.application.model.AdminAuditSourceRow
import com.readmates.admin.audit.application.model.AdminAuditSourceSlice
import com.readmates.admin.audit.application.model.AdminAuditSourceType
import com.readmates.admin.audit.application.model.AdminAuditSummary
import com.readmates.admin.audit.application.model.AdminAuditTarget
import com.readmates.admin.audit.application.model.utc
import com.readmates.admin.audit.application.port.`in`.ListAdminAuditLedgerUseCase
import com.readmates.admin.audit.application.port.out.AdminAuditLedgerReadPort
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.architecture.ReadOnlyApplicationService
import com.readmates.shared.paging.CursorCodec
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.stereotype.Service
import tools.jackson.databind.ObjectMapper
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

@ReadOnlyApplicationService
@Service
class AdminAuditLedgerService(
    private val readPort: AdminAuditLedgerReadPort,
    private val objectMapper: ObjectMapper = ObjectMapper(),
) : ListAdminAuditLedgerUseCase {
    override fun listLedger(
        admin: CurrentPlatformAdmin,
        query: AdminAuditListQuery,
    ): AdminAuditLedgerPage {
        validateFilter(query.filter)

        val requestedLimit = query.pageRequest.limit.coerceIn(1, MAX_LIMIT)
        val sourcePage = query.pageRequest.copy(limit = requestedLimit + 1)
        val unavailable = mutableListOf<AdminAuditSourceType>()
        val sourceRows =
            buildList {
                addAll(readSource(unavailable, AdminAuditSourceType.PLATFORM) { readPort.listPlatformEvents(query.filter, sourcePage) })
                addAll(readSource(unavailable, AdminAuditSourceType.CLUB) { readPort.listClubEvents(query.filter, sourcePage) })
                addAll(
                    readSource(unavailable, AdminAuditSourceType.AI_GENERATION) {
                        readPort.listAiGenerationEvents(query.filter, sourcePage)
                    },
                )
                addAll(
                    readSource(unavailable, AdminAuditSourceType.NOTIFICATION_REPLAY_PREVIEW) {
                        readPort.listNotificationReplayPreviews(query.filter, sourcePage)
                    },
                )
            }

        val projected =
            sourceRows
                .map { project(admin, it) }
                .filter { matchesQueryFilter(query.filter, it) }
                .sortedWith(
                    compareByDescending<AdminAuditLedgerItem> { it.occurredAt }
                        .thenBy { sourceRank(it.sourceTable) }
                        .thenByDescending { it.id },
                )

        val visible = projected.take(requestedLimit)
        val nextCursor = projected.drop(requestedLimit).firstOrNull()?.let(::encodeCursor)
        return AdminAuditLedgerPage(
            generatedAt = OffsetDateTime.now(ZoneOffset.UTC),
            filters = query.filter,
            summary =
                AdminAuditSummary(
                    visibleCount = visible.size,
                    sourceUnavailableCount = unavailable.size,
                    metadataUnavailableCount = visible.count { it.metadataState == AdminAuditMetadataState.UNAVAILABLE },
                    unavailableSources = unavailable,
                ),
            items = visible,
            nextCursor = nextCursor,
        )
    }

    private fun validateFilter(filter: AdminAuditFilter) {
        if (!filter.from.isBefore(filter.to)) {
            throw AdminAuditException(AdminAuditError.INVALID_FILTER, "from must be before to")
        }
        if (filter.from.isBefore(filter.to.minusDays(MAX_WINDOW_DAYS))) {
            throw AdminAuditException(AdminAuditError.INVALID_FILTER, "audit range cannot exceed 90 days")
        }
    }

    private fun readSource(
        unavailable: MutableList<AdminAuditSourceType>,
        source: AdminAuditSourceType,
        read: () -> List<AdminAuditSourceRow>,
    ): List<AdminAuditSourceRow> =
        runCatching(read).getOrElse {
            unavailable += source
            emptyList()
        }

    private fun project(
        admin: CurrentPlatformAdmin,
        row: AdminAuditSourceRow,
    ): AdminAuditLedgerItem =
        when (row.sourceType) {
            AdminAuditSourceType.PLATFORM -> projectPlatform(admin, row)
            AdminAuditSourceType.CLUB -> projectClub(row)
            AdminAuditSourceType.AI_GENERATION -> projectAi(row)
            AdminAuditSourceType.NOTIFICATION_REPLAY_PREVIEW -> projectReplayPreview(row)
        }

    private fun projectPlatform(
        admin: CurrentPlatformAdmin,
        row: AdminAuditSourceRow,
    ): AdminAuditLedgerItem {
        val metadata = parseMetadata(row.metadataJson)
        val metadataUnavailable = row.metadataJson != null && metadata == null
        val sourceSlice =
            when (row.actionType) {
                "SUPPORT_ACCESS_GRANT_CREATED",
                "SUPPORT_ACCESS_GRANT_REVOKED",
                -> AdminAuditSourceSlice.S4
                "ADMIN_NOTIFICATION_REPLAY_CONFIRMED" -> AdminAuditSourceSlice.S5
                else -> AdminAuditSourceSlice.PLATFORM
            }
        val category =
            when (sourceSlice) {
                AdminAuditSourceSlice.S4 -> AdminAuditActionCategory.SUPPORT
                AdminAuditSourceSlice.S5 -> AdminAuditActionCategory.NOTIFICATION
                else -> AdminAuditActionCategory.PLATFORM_ADMIN
            }
        val targetUser = row.targetUserId.takeUnless { admin.role == PlatformAdminRole.SUPPORT }
        return AdminAuditLedgerItem(
            id = "${row.sourceType.tableName}:${row.sourceId}",
            occurredAt = row.occurredAt.utc(),
            sourceSlice = sourceSlice,
            sourceTable = row.sourceType.tableName,
            actionCategory = category,
            actionType = row.actionType,
            outcome = row.outcomeHint.toOutcome(default = AdminAuditOutcome.SUCCESS),
            actor = actor(row.actorUserId, row.actorRole),
            target =
                AdminAuditTarget(
                    clubId = row.clubId ?: metadata?.uuid("clubId"),
                    userId = targetUser,
                    jobId = null,
                    eventId = metadata?.string("eventId"),
                    label = targetLabel(admin.role, row.targetUserId),
                ),
            summary = platformSummary(row.actionType),
            safeMetadata = metadata?.let { platformMetadata(row.actionType, it) }.orEmpty(),
            metadataState = metadataState(metadata, metadataUnavailable),
        )
    }

    private fun projectClub(row: AdminAuditSourceRow): AdminAuditLedgerItem {
        val metadata = parseMetadata(row.metadataJson)
        val unavailable = row.metadataJson != null && metadata == null
        return AdminAuditLedgerItem(
            id = "${row.sourceType.tableName}:${row.sourceId}",
            occurredAt = row.occurredAt.utc(),
            sourceSlice = AdminAuditSourceSlice.S3,
            sourceTable = row.sourceType.tableName,
            actionCategory = AdminAuditActionCategory.CLUB_LIFECYCLE,
            actionType = row.actionType,
            outcome = row.outcomeHint.toOutcome(default = AdminAuditOutcome.SUCCESS),
            actor = actor(row.actorUserId, row.actorRole),
            target = AdminAuditTarget(row.clubId, null, null, null, row.clubId?.toString() ?: "클럽"),
            summary = clubSummary(row.actionType),
            safeMetadata = metadata?.let { clubMetadata(row.actionType, it) }.orEmpty(),
            metadataState = metadataState(metadata, unavailable),
        )
    }

    private fun projectAi(row: AdminAuditSourceRow): AdminAuditLedgerItem {
        val metadata = parseMetadata(row.metadataJson)
        val unavailable = row.metadataJson != null && metadata == null
        val status = metadata?.string("status") ?: row.outcomeHint
        return AdminAuditLedgerItem(
            id = "${row.sourceType.tableName}:${row.sourceId}",
            occurredAt = row.occurredAt.utc(),
            sourceSlice = AdminAuditSourceSlice.S6,
            sourceTable = row.sourceType.tableName,
            actionCategory = AdminAuditActionCategory.AI_OPS,
            actionType = row.actionType,
            outcome = status.toOutcome(default = AdminAuditOutcome.UNKNOWN),
            actor = actor(row.actorUserId, row.actorRole ?: "HOST"),
            target =
                AdminAuditTarget(
                    clubId = row.clubId,
                    userId = null,
                    jobId = metadata?.uuid("jobId"),
                    eventId = null,
                    label = metadata?.string("jobId") ?: "AI job",
                ),
            summary = "AI 작업 감사 이벤트가 기록되었습니다.",
            safeMetadata = aiMetadata(metadata),
            metadataState = metadataState(metadata, unavailable),
        )
    }

    private fun projectReplayPreview(row: AdminAuditSourceRow): AdminAuditLedgerItem {
        val metadata = parseMetadata(row.metadataJson)
        val unavailable = row.metadataJson != null && metadata == null
        return AdminAuditLedgerItem(
            id = "${row.sourceType.tableName}:${row.sourceId}",
            occurredAt = row.occurredAt.utc(),
            sourceSlice = AdminAuditSourceSlice.S5,
            sourceTable = row.sourceType.tableName,
            actionCategory = AdminAuditActionCategory.NOTIFICATION,
            actionType = row.actionType,
            outcome = row.outcomeHint.toOutcome(default = AdminAuditOutcome.PREPARED),
            actor = actor(row.actorUserId, row.actorRole),
            target = AdminAuditTarget(row.clubId, null, null, row.sourceId, "Replay preview"),
            summary = "알림 재처리 대상이 미리 확인되었습니다.",
            safeMetadata = replayPreviewMetadata(metadata),
            metadataState = metadataState(metadata, unavailable),
        )
    }

    private fun actor(
        actorUserId: UUID?,
        actorRole: String?,
    ): AdminAuditActor {
        val role = actorRole.toActorRole()
        return AdminAuditActor(
            userId = actorUserId,
            role = role,
            displayLabel = role.name,
        )
    }

    private fun targetLabel(
        adminRole: PlatformAdminRole,
        targetUserId: UUID?,
    ): String =
        when {
            adminRole == PlatformAdminRole.SUPPORT && targetUserId != null -> "사용자 숨김"
            targetUserId != null -> targetUserId.toString()
            else -> "대상 없음"
        }

    private fun platformMetadata(
        actionType: String,
        metadata: Map<String, Any?>,
    ): List<AdminAuditMetadata> =
        when (actionType) {
            "SUPPORT_ACCESS_GRANT_CREATED" ->
                listOfNotNull(
                    metadata.string("grantId")?.let { AdminAuditMetadata("grantId", it, "id") },
                    metadata.string("scope")?.let { AdminAuditMetadata("scope", it, "code") },
                    metadata.string("expiresAt")?.let { AdminAuditMetadata("expiryBucket", expiryBucket(it), "time") },
                )
            "SUPPORT_ACCESS_GRANT_REVOKED" ->
                listOfNotNull(metadata.string("grantId")?.let { AdminAuditMetadata("grantId", it, "id") })
            "ADMIN_NOTIFICATION_REPLAY_CONFIRMED" ->
                listOfNotNull(
                    metadata.string("previewId")?.let { AdminAuditMetadata("previewId", it, "id") },
                    metadata.string("selectionHash")?.take(8)?.let { AdminAuditMetadata("selectionHashPrefix", it, "fingerprint") },
                    metadata.number("replayedCount")?.let { AdminAuditMetadata("replayedCount", it, "count") },
                    metadata.number("skippedCount")?.let { AdminAuditMetadata("skippedCount", it, "count") },
                    AdminAuditMetadata("reasonPresent", metadata.string("reason")?.isNotBlank().toString(), "boolean"),
                )
            else -> listOf(AdminAuditMetadata("eventType", actionType, "code"))
        }

    private fun clubMetadata(
        actionType: String,
        metadata: Map<String, Any?>,
    ): List<AdminAuditMetadata> =
        listOfNotNull(
            AdminAuditMetadata("eventType", actionType, "code"),
            metadata.string("reason")?.let { AdminAuditMetadata("reasonPresent", it.isNotBlank().toString(), "boolean") },
            metadata.string("trigger")?.let { AdminAuditMetadata("trigger", it, "code") },
        )

    private fun aiMetadata(metadata: Map<String, Any?>?): List<AdminAuditMetadata> =
        if (metadata == null) {
            emptyList()
        } else {
            listOfNotNull(
                metadata.string("provider")?.let { AdminAuditMetadata("provider", it, "code") },
                metadata.string("model")?.let { AdminAuditMetadata("model", it, "code") },
                metadata.string("status")?.let { AdminAuditMetadata("status", it, "code") },
                metadata.string("errorCode")?.let { AdminAuditMetadata("errorCode", it, "code") },
                metadata.number("costEstimateUsd")?.let { AdminAuditMetadata("costEstimateUsd", it, "money") },
                metadata.number("latencyMs")?.let { AdminAuditMetadata("latencyMs", it, "duration") },
            )
        }

    private fun replayPreviewMetadata(metadata: Map<String, Any?>?): List<AdminAuditMetadata> =
        if (metadata == null) {
            emptyList()
        } else {
            listOfNotNull(
                metadata.number("matchedCount")?.let { AdminAuditMetadata("matchedCount", it, "count") },
                metadata.string("selectionHash")?.take(8)?.let { AdminAuditMetadata("selectionHashPrefix", it, "fingerprint") },
                metadata.string("expiresAt")?.let { AdminAuditMetadata("expiresAt", it, "time") },
                metadata.string("consumedAt")?.let { AdminAuditMetadata("consumedAt", it, "time") },
            )
        }

    private fun metadataState(
        metadata: Map<String, Any?>?,
        unavailable: Boolean,
    ): AdminAuditMetadataState =
        when {
            unavailable -> AdminAuditMetadataState.UNAVAILABLE
            metadata == null || metadata.isEmpty() -> AdminAuditMetadataState.EMPTY
            else -> AdminAuditMetadataState.AVAILABLE
        }

    private fun parseMetadata(metadataJson: String?): Map<String, Any?>? =
        metadataJson?.let {
            runCatching {
                @Suppress("UNCHECKED_CAST")
                objectMapper.readValue(it, Map::class.java) as Map<String, Any?>
            }.getOrNull()
        }

    private fun matchesQueryFilter(
        filter: AdminAuditFilter,
        item: AdminAuditLedgerItem,
    ): Boolean =
        (filter.sourceSlice == null || item.sourceSlice == filter.sourceSlice) &&
            (filter.actionCategory == null || item.actionCategory == filter.actionCategory) &&
            (filter.outcome == null || item.outcome == filter.outcome) &&
            (filter.actorRole == null || item.actor.role == filter.actorRole) &&
            (filter.clubId == null || item.target.clubId == filter.clubId)

    private fun encodeCursor(item: AdminAuditLedgerItem): String? =
        CursorCodec.encode(
            mapOf(
                "occurredAt" to item.occurredAt.toString(),
                "sourceRank" to sourceRank(item.sourceTable).toString(),
                "sourceId" to item.id.substringAfter(":"),
            ),
        )

    private fun sourceRank(tableName: String): Int =
        AdminAuditSourceType.entries.firstOrNull { it.tableName == tableName }?.rank ?: UNKNOWN_SOURCE_RANK
}

private fun String?.toActorRole(): AdminAuditActorRole =
    when (this) {
        "OWNER" -> AdminAuditActorRole.OWNER
        "OPERATOR" -> AdminAuditActorRole.OPERATOR
        "SUPPORT" -> AdminAuditActorRole.SUPPORT
        "HOST" -> AdminAuditActorRole.HOST
        "MEMBER" -> AdminAuditActorRole.MEMBER
        "SYSTEM" -> AdminAuditActorRole.SYSTEM
        else -> AdminAuditActorRole.UNKNOWN
    }

private fun String?.toOutcome(default: AdminAuditOutcome): AdminAuditOutcome =
    when (this?.uppercase()) {
        "SUCCESS", "SUCCEEDED", "CONFIRMED", "CONSUMED" -> AdminAuditOutcome.SUCCESS
        "FAILED", "FAILURE", "DEAD", "ERROR" -> AdminAuditOutcome.FAILED
        "DENIED", "FORBIDDEN" -> AdminAuditOutcome.DENIED
        "PREPARED", "OPEN", "PENDING" -> AdminAuditOutcome.PREPARED
        "UNKNOWN" -> AdminAuditOutcome.UNKNOWN
        else -> default
    }

private fun platformSummary(actionType: String): String =
    when (actionType) {
        "SUPPORT_ACCESS_GRANT_CREATED" -> "support grant가 생성되었습니다."
        "SUPPORT_ACCESS_GRANT_REVOKED" -> "support grant가 회수되었습니다."
        "ADMIN_NOTIFICATION_REPLAY_CONFIRMED" -> "알림 재처리가 확정되었습니다."
        else -> "platform admin 이벤트가 기록되었습니다."
    }

private fun clubSummary(actionType: String): String =
    when (actionType) {
        "CLUB_ACTIVATED" -> "클럽이 활성화되었습니다."
        "CLUB_SUSPENDED" -> "클럽이 일시 중지되었습니다."
        "CLUB_RESTORED" -> "클럽이 복구되었습니다."
        "CLUB_ARCHIVED" -> "클럽이 보관 처리되었습니다."
        else -> "클럽 운영 상태가 변경되었습니다."
    }

private fun Map<String, Any?>.string(key: String): String? = this[key]?.toString()?.takeIf { it.isNotBlank() }

private fun Map<String, Any?>.number(key: String): String? = this[key]?.toString()?.takeIf { it.isNotBlank() }

private fun Map<String, Any?>.uuid(key: String): UUID? = string(key)?.let { runCatching { UUID.fromString(it) }.getOrNull() }

private fun expiryBucket(value: String): String = if (value.contains("T")) "configured" else "unknown"

private const val MAX_LIMIT = 50
private const val MAX_WINDOW_DAYS = 90L
private const val UNKNOWN_SOURCE_RANK = 99
