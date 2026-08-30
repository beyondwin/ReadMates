package com.readmates.hostworkspace.application.model

import com.readmates.hostworkspace.domain.HostWorkItemKey
import com.readmates.hostworkspace.domain.HostWorkboxOwner
import java.time.OffsetDateTime
import java.util.UUID

enum class HostWorkboxState {
    NOW,
    DEFERRED,
    COMPLETED,
}

enum class HostWorkItemType {
    SCHEDULE_UNSEEN,
    MEMBER_APPROVAL,
    RECORD_CLOSING,
    INVITATION_EXPIRY,
    NOTIFICATION_FAILURE,
}

enum class HostWorkSourceAvailabilityState {
    AVAILABLE,
    UNAVAILABLE,
}

data class HostWorkSourceAvailability(
    val type: HostWorkItemType,
    val state: HostWorkSourceAvailabilityState,
    val failureCode: String? = null,
) {
    init {
        require(failureCode == null || SAFE_CODE.matches(failureCode)) { "Failure code must be allowlisted ASCII" }
        require(state == HostWorkSourceAvailabilityState.UNAVAILABLE || failureCode == null) {
            "Available sources cannot expose a failure code"
        }
    }

    private companion object {
        val SAFE_CODE = Regex("[A-Z][A-Z0-9_]{0,63}")
    }
}

data class HostWorkboxReceiptSummary(
    val operation: String,
    val outcome: String,
    val affectedCount: Int? = null,
) {
    init {
        require(SAFE_CODE.matches(operation)) { "Receipt operation must be allowlisted ASCII" }
        require(SAFE_CODE.matches(outcome)) { "Receipt outcome must be allowlisted ASCII" }
        require(affectedCount == null || affectedCount >= 0) { "Receipt count cannot be negative" }
    }

    private companion object {
        val SAFE_CODE = Regex("[A-Z][A-Z0-9_]{0,63}")
    }
}

data class HostWorkboxItemProjection(
    val key: HostWorkItemKey,
    val type: HostWorkItemType,
    val state: HostWorkboxState,
    val title: String,
    val description: String,
    val count: Int,
    val dueAt: OffsetDateTime?,
    val deferredUntil: OffsetDateTime?,
    val resolvedAt: OffsetDateTime?,
    val destinationHref: String,
    val receiptSummary: HostWorkboxReceiptSummary?,
) {
    init {
        require(title.isNotBlank()) { "Projection title cannot be blank" }
        require(description.isNotBlank()) { "Projection description cannot be blank" }
        require(count >= 0) { "Projection count cannot be negative" }
        require(destinationHref.startsWith("/app/") && !destinationHref.contains("://")) {
            "Projection destination must be app relative"
        }
    }
}

data class HostWorkboxSnapshotItem(
    val ordinal: Int,
    val key: HostWorkItemKey,
    val projection: HostWorkboxItemProjection,
) {
    init {
        require(ordinal >= 0) { "Snapshot ordinal cannot be negative" }
        require(key == projection.key) { "Snapshot item key must match projection key" }
    }
}

data class HostWorkboxSnapshot(
    val id: UUID,
    val owner: HostWorkboxOwner,
    val state: HostWorkboxState,
    val filterFingerprint: String,
    val schemaVersion: Int,
    val evaluatedAt: OffsetDateTime,
    val sourceAvailability: List<HostWorkSourceAvailability>,
    val expiresAt: OffsetDateTime,
    val items: List<HostWorkboxSnapshotItem>,
) {
    init {
        require(FILTER_FINGERPRINT.matches(filterFingerprint)) { "Filter fingerprint must be lowercase SHA-256" }
        require(schemaVersion > 0) { "Snapshot schema version must be positive" }
        require(expiresAt.isAfter(evaluatedAt)) { "Snapshot expiry must be after evaluation" }
        require(items.map(HostWorkboxSnapshotItem::ordinal).distinct().size == items.size) {
            "Snapshot ordinals must be unique"
        }
        require(items.map(HostWorkboxSnapshotItem::key).distinct().size == items.size) {
            "Snapshot keys must be unique"
        }
        require(sourceAvailability.map(HostWorkSourceAvailability::type).distinct().size == sourceAvailability.size) {
            "Source availability types must be unique"
        }
    }

    private companion object {
        val FILTER_FINGERPRINT = Regex("[a-f0-9]{64}")
    }
}

data class HostWorkboxSnapshotPageQuery(
    val snapshotId: UUID,
    val owner: HostWorkboxOwner,
    val state: HostWorkboxState,
    val filterFingerprint: String,
    val readAt: OffsetDateTime,
    val afterOrdinal: Int?,
    val limit: Int,
) {
    init {
        require(Regex("[a-f0-9]{64}").matches(filterFingerprint)) { "Filter fingerprint must be lowercase SHA-256" }
        require(afterOrdinal == null || afterOrdinal >= 0) { "Snapshot ordinal cannot be negative" }
        require(limit in 1..MAX_PAGE_LIMIT) { "Snapshot page limit must be between 1 and $MAX_PAGE_LIMIT" }
    }

    private companion object {
        const val MAX_PAGE_LIMIT = 100
    }
}

data class HostWorkboxSnapshotPage(
    val snapshotId: UUID,
    val owner: HostWorkboxOwner,
    val state: HostWorkboxState,
    val filterFingerprint: String,
    val schemaVersion: Int,
    val evaluatedAt: OffsetDateTime,
    val sourceAvailability: List<HostWorkSourceAvailability>,
    val expiresAt: OffsetDateTime,
    val items: List<HostWorkboxSnapshotItem>,
    val hasMore: Boolean,
)
