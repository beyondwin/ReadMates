@file:Suppress("TooManyFunctions")

package com.readmates.admin.audit.application.service

import com.readmates.admin.audit.application.AdminAuditError
import com.readmates.admin.audit.application.AdminAuditException
import com.readmates.admin.audit.application.model.AdminAuditActionCategory
import com.readmates.admin.audit.application.model.AdminAuditActor
import com.readmates.admin.audit.application.model.AdminAuditActorRole
import com.readmates.admin.audit.application.model.AdminAuditCursor
import com.readmates.admin.audit.application.model.AdminAuditCursorDraft
import com.readmates.admin.audit.application.model.AdminAuditFilter
import com.readmates.admin.audit.application.model.AdminAuditLedgerItem
import com.readmates.admin.audit.application.model.AdminAuditLedgerPage
import com.readmates.admin.audit.application.model.AdminAuditListQuery
import com.readmates.admin.audit.application.model.AdminAuditMetadata
import com.readmates.admin.audit.application.model.AdminAuditMetadataState
import com.readmates.admin.audit.application.model.AdminAuditOutcome
import com.readmates.admin.audit.application.model.AdminAuditSourceQuery
import com.readmates.admin.audit.application.model.AdminAuditSourceRow
import com.readmates.admin.audit.application.model.AdminAuditSourceSlice
import com.readmates.admin.audit.application.model.AdminAuditSourceType
import com.readmates.admin.audit.application.model.AdminAuditSummary
import com.readmates.admin.audit.application.model.AdminAuditTarget
import com.readmates.admin.audit.application.model.AdminAuditTuple
import com.readmates.admin.audit.application.model.utc
import com.readmates.admin.audit.application.port.`in`.ListAdminAuditLedgerUseCase
import com.readmates.admin.audit.application.port.out.AdminAuditLedgerReadPort
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.architecture.ReadOnlyApplicationService
import com.readmates.shared.security.CurrentPlatformAdmin
import com.readmates.shared.security.PlatformCapability
import com.readmates.shared.security.toPlatformActor
import org.springframework.stereotype.Service
import tools.jackson.databind.ObjectMapper
import java.math.BigInteger
import java.time.Clock
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

@ReadOnlyApplicationService
@Service
class AdminAuditLedgerService(
    private val readPort: AdminAuditLedgerReadPort,
    private val cursorSigner: AdminAuditCursorSigner,
    private val clock: Clock,
    private val objectMapper: ObjectMapper = ObjectMapper(),
) : ListAdminAuditLedgerUseCase {
    override fun listLedger(
        admin: CurrentPlatformAdmin,
        query: AdminAuditListQuery,
    ): AdminAuditLedgerPage {
        validateFilter(query.filter)
        requireAuditAccess(admin, query.sensitiveTarget)

        val requestedLimit = query.pageRequest.limit.coerceIn(1, MAX_LIMIT)
        val fingerprint = cursorSigner.fingerprint(query.filter, query.sensitiveTarget)
        val cursor = resolveCursor(query)
        val now = OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC)
        val snapshotTo = cursor?.snapshotTo ?: minOf(query.filter.to.utc(), now)
        val after = cursor?.let { AdminAuditTuple(it.occurredAt, it.sourceRank, it.immutableSourceId) }
        val unavailable = cursor?.excludedSources?.toMutableSet() ?: linkedSetOf()
        val sourceQuery =
            AdminAuditSourceQuery(
                filter = query.filter,
                snapshotTo = snapshotTo,
                after = after,
                limit = requestedLimit + 1,
                sensitiveTarget = query.sensitiveTarget,
            )
        val projected =
            projectedRows(admin, sourceQuery, cursor != null, unavailable)

        val visible = projected.take(requestedLimit)
        val nextCursor =
            if (projected.size > requestedLimit && visible.isNotEmpty()) {
                val last = visible.last()
                val source = sourceType(last)
                cursorSigner.issue(
                    AdminAuditCursorDraft(
                        snapshotTo = snapshotTo,
                        from = query.filter.from,
                        filterFingerprint = fingerprint,
                        excludedSources = unavailable,
                        after = AdminAuditTuple(last.occurredAt, source.rank, last.nativeSourceId()),
                    ),
                )
            } else {
                null
            }
        return AdminAuditLedgerPage(
            generatedAt = now,
            filters = query.filter,
            summary =
                AdminAuditSummary(
                    visibleCount = visible.size,
                    sourceUnavailableCount = unavailable.size,
                    metadataUnavailableCount =
                        visible.count {
                            it.metadataState == AdminAuditMetadataState.UNAVAILABLE
                        },
                    unavailableSources = unavailable.sortedBy { it.rank },
                ),
            items = visible,
            nextCursor = nextCursor,
        )
    }

    private fun projectedRows(
        admin: CurrentPlatformAdmin,
        sourceQuery: AdminAuditSourceQuery,
        continuation: Boolean,
        unavailable: MutableSet<AdminAuditSourceType>,
    ): List<AdminAuditLedgerItem> =
        AdminAuditSourceType.entries
            .asSequence()
            .filterNot(unavailable::contains)
            .flatMap { source ->
                readSource(source, sourceQuery, continuation, unavailable).asSequence()
            }.map { project(admin, it) }
            .sortedWith(::compareItems)
            .toList()

    private fun requireAuditAccess(
        admin: CurrentPlatformAdmin,
        sensitiveTarget: String?,
    ) {
        val actor = admin.toPlatformActor()
        if (!actor.can(PlatformCapability.VIEW_AUDIT)) {
            throw AdminAuditException(AdminAuditError.INVALID_FILTER, "Audit access is not allowed")
        }
        if (sensitiveTarget != null && !actor.can(PlatformCapability.VIEW_SENSITIVE_AUDIT)) {
            throw AdminAuditException(AdminAuditError.INVALID_FILTER, "Sensitive audit search is not allowed")
        }
    }

    private fun resolveCursor(query: AdminAuditListQuery): AdminAuditCursor? {
        val cursor =
            query.rawCursor
                ?.takeIf(String::isNotBlank)
                ?.let { cursorSigner.verify(it, query.filter, query.sensitiveTarget) }
        if (
            cursor != null &&
            (cursor.from != query.filter.from.utc() || cursor.snapshotTo.isAfter(query.filter.to.utc()))
        ) {
            throw AdminAuditException(AdminAuditError.INVALID_CURSOR, "Invalid audit cursor")
        }
        return cursor
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
        source: AdminAuditSourceType,
        query: AdminAuditSourceQuery,
        continuation: Boolean,
        unavailable: MutableSet<AdminAuditSourceType>,
    ): List<AdminAuditSourceRow> =
        runCatching { readPort.listSource(source, query) }.getOrElse {
            if (continuation) {
                throw AdminAuditException(AdminAuditError.SOURCE_UNAVAILABLE, "Audit source temporarily unavailable")
            }
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
            else -> projectDomainCommand(admin, row)
        }

    private fun projectDomainCommand(
        admin: CurrentPlatformAdmin,
        row: AdminAuditSourceRow,
    ): AdminAuditLedgerItem {
        val metadata = parseMetadata(row.metadataJson)
        val unavailable = row.metadataJson != null && metadata == null
        val targetUser = row.targetUserId.takeUnless { admin.role == PlatformAdminRole.SUPPORT }
        return AdminAuditLedgerItem(
            id = "${row.sourceType.tableName}:${row.sourceId}",
            occurredAt = row.occurredAt.utc(),
            sourceSlice = row.sourceType.domainSlice(),
            sourceTable = row.sourceType.tableName,
            actionCategory = row.sourceType.domainCategory(),
            actionType = row.actionType,
            outcome = row.outcomeHint.toOutcome(default = AdminAuditOutcome.UNKNOWN),
            actor = actor(row.actorUserId, row.actorRole),
            target =
                AdminAuditTarget(
                    clubId = row.clubId,
                    userId = targetUser,
                    jobId = metadata?.uuid("jobId"),
                    eventId = metadata?.string("receiptId") ?: metadata?.string("caseId"),
                    label = targetLabel(admin.role, row.targetUserId),
                ),
            summary = "${row.sourceType.domainCategory().name} 감사 증거가 기록되었습니다.",
            safeMetadata = metadata?.domainMetadata().orEmpty(),
            metadataState = metadataState(metadata, unavailable),
        )
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
                    eventId = metadata?.string("eventId") ?: metadata?.string("receiptId"),
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
            summary = replayPreviewSummary(row.actionType),
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
                    metadata.selectionHashPrefix(),
                    metadata.number("replayedCount")?.let { AdminAuditMetadata("replayedCount", it, "count") },
                    metadata.number("skippedCount")?.let { AdminAuditMetadata("skippedCount", it, "count") },
                )
            "EMERGENCY_PUBLIC_TAKEDOWN_CONFIRMED" ->
                publicTakedownMetadata(metadata)
            else -> listOf(AdminAuditMetadata("eventType", actionType, "code"))
        }

    private fun publicTakedownMetadata(metadata: Map<String, Any?>): List<AdminAuditMetadata> =
        listOfNotNull(
            metadata.string("receiptId")?.let { AdminAuditMetadata("receiptId", it, "id") },
            metadata.string("convergenceId")?.let { AdminAuditMetadata("convergenceId", it, "id") },
            metadata.string("publicationId")?.let { AdminAuditMetadata("publicationId", it, "id") },
            metadata.number("committedGeneration")?.let {
                AdminAuditMetadata("committedGeneration", it, "count")
            },
            metadata.string("originResult")?.let { AdminAuditMetadata("originResult", it, "code") },
            metadata.string("reasonCategory")?.let { AdminAuditMetadata("reasonCategory", it, "code") },
            metadata.string("reasonRedacted")?.let { AdminAuditMetadata("reasonRedacted", it, "boolean") },
            metadata.string("remoteCopyLimitationCode")?.let {
                AdminAuditMetadata("remoteCopyLimitationCode", it, "code")
            },
        )

    private fun clubMetadata(
        actionType: String,
        metadata: Map<String, Any?>,
    ): List<AdminAuditMetadata> =
        listOfNotNull(
            AdminAuditMetadata("eventType", actionType, "code"),
            metadata.string("reason")?.let {
                AdminAuditMetadata("reasonPresent", it.isNotBlank().toString(), "boolean")
            },
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
                metadata.selectionHashPrefix(),
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

    private fun compareItems(
        left: AdminAuditLedgerItem,
        right: AdminAuditLedgerItem,
    ): Int {
        val occurred = right.occurredAt.compareTo(left.occurredAt)
        val leftSource = sourceType(left)
        val rightSource = sourceType(right)
        val rank = leftSource.rank.compareTo(rightSource.rank)
        return when {
            occurred != 0 -> occurred
            rank != 0 -> rank
            else ->
                compareNativeIdDescending(
                    left.nativeSourceId(),
                    right.nativeSourceId(),
                    leftSource,
                )
        }
    }

    private fun sourceType(item: AdminAuditLedgerItem): AdminAuditSourceType =
        AdminAuditSourceType.entries.firstOrNull { it.tableName == item.sourceTable }
            ?: throw AdminAuditException(AdminAuditError.INVALID_CURSOR, "Unknown audit source")
}

private fun AdminAuditLedgerItem.nativeSourceId(): String = id.removePrefix("$sourceTable:")

private fun compareNativeIdDescending(
    left: String,
    right: String,
    source: AdminAuditSourceType,
): Int =
    when (source.nativeIdType) {
        com.readmates.admin.audit.application.model.AdminAuditNativeIdType.NUMERIC ->
            right.toBigIntegerStrict().compareTo(left.toBigIntegerStrict())
        com.readmates.admin.audit.application.model.AdminAuditNativeIdType.UUID,
        com.readmates.admin.audit.application.model.AdminAuditNativeIdType.COMPOSITE,
        -> right.compareTo(left)
    }

private fun String.toBigIntegerStrict(): BigInteger =
    runCatching(::BigInteger).getOrElse {
        throw AdminAuditException(AdminAuditError.INVALID_CURSOR, "Invalid native audit id")
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
        "SUCCESS", "SUCCEEDED", "ACCEPTED", "CONFIRMED", "CONSUMED", "COMMITTED" -> AdminAuditOutcome.SUCCESS
        "FAILED", "FAILURE", "PARTIAL", "DEAD", "ERROR", "CANCELLED" -> AdminAuditOutcome.FAILED
        "DENIED", "FORBIDDEN" -> AdminAuditOutcome.DENIED
        "PREPARED", "OPEN", "PENDING", "RUNNING", "ACKNOWLEDGED", "SNOOZED" -> AdminAuditOutcome.PREPARED
        "UNKNOWN" -> AdminAuditOutcome.UNKNOWN
        else -> default
    }

private fun platformSummary(actionType: String): String =
    when (actionType) {
        "SUPPORT_ACCESS_GRANT_CREATED" -> "support grant가 생성되었습니다."
        "SUPPORT_ACCESS_GRANT_REVOKED" -> "support grant가 회수되었습니다."
        "ADMIN_NOTIFICATION_REPLAY_CONFIRMED" -> "알림 재처리가 확정되었습니다."
        "EMERGENCY_PUBLIC_TAKEDOWN_CONFIRMED" -> "긴급 공개 회수의 origin 차단이 기록되었습니다."
        else -> "platform admin 이벤트가 기록되었습니다."
    }

private fun replayPreviewSummary(actionType: String): String =
    when (actionType) {
        "ADMIN_NOTIFICATION_REPLAY_PREVIEW_PREPARED" -> "알림 재처리 대상이 미리 확인되었습니다."
        "ADMIN_NOTIFICATION_REPLAY_PREVIEW_CONSUMED" -> "알림 재처리 preview가 소비되었습니다."
        "ADMIN_NOTIFICATION_REPLAY_PREVIEW_LEGACY" -> "레거시 알림 재처리 preview 증거가 기록되었습니다."
        else -> "알림 재처리 preview 증거가 기록되었습니다."
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

@Suppress("ktlint:standard:function-expression-body")
private fun Map<String, Any?>.uuid(key: String): UUID? {
    return string(key)?.let { runCatching { UUID.fromString(it) }.getOrNull() }
}

private fun Map<String, Any?>.selectionHashPrefix(): AdminAuditMetadata? =
    string("selectionHash")
        ?.take(SELECTION_HASH_PREFIX_LENGTH)
        ?.let { AdminAuditMetadata("selectionHashPrefix", it, "fingerprint") }

private fun Map<String, Any?>.domainMetadata(): List<AdminAuditMetadata> =
    DOMAIN_METADATA_KEYS.mapNotNull { (key, kind) ->
        string(key)?.let { AdminAuditMetadata(key, it, kind) }
    }

private fun AdminAuditSourceType.domainSlice(): AdminAuditSourceSlice =
    when (this) {
        AdminAuditSourceType.CLUB_COMMAND_RECEIPT,
        AdminAuditSourceType.CLUB_CONVERGENCE_ATTEMPT,
        -> AdminAuditSourceSlice.S3
        AdminAuditSourceType.SUPPORT_COMMAND_RECEIPT -> AdminAuditSourceSlice.S4
        AdminAuditSourceType.NOTIFICATION_CONFIRMATION,
        AdminAuditSourceType.NOTIFICATION_CONVERGENCE_ATTEMPT,
        -> AdminAuditSourceSlice.S5
        AdminAuditSourceType.AI_COMMAND_RECEIPT,
        AdminAuditSourceType.AI_CONVERGENCE_ATTEMPT,
        -> AdminAuditSourceSlice.S6
        else -> AdminAuditSourceSlice.PLATFORM
    }

private fun AdminAuditSourceType.domainCategory(): AdminAuditActionCategory =
    when (domainSlice()) {
        AdminAuditSourceSlice.S3 -> AdminAuditActionCategory.CLUB_LIFECYCLE
        AdminAuditSourceSlice.S4 -> AdminAuditActionCategory.SUPPORT
        AdminAuditSourceSlice.S5 -> AdminAuditActionCategory.NOTIFICATION
        AdminAuditSourceSlice.S6 -> AdminAuditActionCategory.AI_OPS
        else -> AdminAuditActionCategory.PLATFORM_ADMIN
    }

private fun expiryBucket(value: String): String = if (value.contains("T")) "configured" else "unknown"

private const val MAX_LIMIT = 50
private const val MAX_WINDOW_DAYS = 90L
private const val SELECTION_HASH_PREFIX_LENGTH = 8
private val DOMAIN_METADATA_KEYS =
    linkedMapOf(
        "receiptId" to "id",
        "replayedCount" to "count",
        "skippedCount" to "count",
        "originOutcome" to "code",
        "caseId" to "id",
        "commandType" to "code",
        "effectType" to "code",
        "attemptNo" to "count",
        "state" to "code",
        "safeErrorCode" to "code",
        "afterAdminRevision" to "count",
        "outcome" to "code",
        "jobId" to "id",
        "action" to "code",
        "afterStatus" to "code",
        "grantId" to "id",
        "scope" to "code",
        "reasonCategory" to "code",
        "notePresent" to "boolean",
        "convergenceId" to "id",
        "publicationId" to "id",
        "originResult" to "code",
        "reasonRedacted" to "boolean",
        "remoteCopyLimitationCode" to "code",
    )
