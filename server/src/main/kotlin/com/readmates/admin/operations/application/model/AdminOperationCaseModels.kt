package com.readmates.admin.operations.application.model

import java.time.OffsetDateTime
import java.util.UUID

enum class AdminOperationCaseState {
    OPEN,
    ACKNOWLEDGED,
    SNOOZED,
    RESOLVED,
}

enum class AdminOperationSeverity {
    CRITICAL,
    WARNING,
    READY,
    INFO,
}

enum class AdminOperationSourceType {
    CLUB_READINESS,
    NOTIFICATION,
    AI_JOB,
    CLOSING_RISK,
}

enum class AdminOperationSourceStatus {
    AVAILABLE,
    PARTIAL,
    UNAVAILABLE,
    DISABLED,
}

enum class AdminOperationAction {
    ACKNOWLEDGE,
    SNOOZE,
    RESOLVE,
}

enum class AdminOperationAssigneeFilter {
    ME,
}

data class AdminOperationCaseFilter(
    val states: Set<AdminOperationCaseState> = emptySet(),
    val severities: Set<AdminOperationSeverity> = emptySet(),
    val sources: Set<AdminOperationSourceType> = emptySet(),
    val assignee: AdminOperationAssigneeFilter? = null,
)

data class AdminOperationCaseCounts(
    val open: Long,
    val critical: Long,
    val assignedToMe: Long,
    val snoozed: Long,
)

data class AdminOperationCase(
    val id: UUID,
    val sourceType: AdminOperationSourceType,
    val sourceKey: String,
    val clubId: UUID?,
    val state: AdminOperationCaseState,
    val severity: AdminOperationSeverity,
    val summaryCode: String,
    val firstObservedAt: OffsetDateTime,
    val lastObservedAt: OffsetDateTime,
    val snoozedUntil: OffsetDateTime?,
    val assigneeAdminId: UUID?,
    val resolvedAt: OffsetDateTime?,
    val reopenCount: Int,
    val version: Long,
    val impactCount: Int,
    val detailHref: String,
)

data class AdminOperationCaseEvent(
    val id: UUID,
    val caseId: UUID,
    val fromState: AdminOperationCaseState?,
    val toState: AdminOperationCaseState,
    val action: AdminOperationAction?,
    val actorAdminId: UUID?,
    val reasonCode: String,
    val occurredAt: OffsetDateTime,
    val caseVersion: Long,
)

data class AdminOperationSignal(
    val sourceType: AdminOperationSourceType,
    val sourceKey: String,
    val clubId: UUID?,
    val severity: AdminOperationSeverity,
    val summaryCode: String,
    val impactCount: Int,
    val detailHref: String,
    val observedAt: OffsetDateTime,
)

data class AdminOperationSignalBatch(
    val sourceType: AdminOperationSourceType,
    val status: AdminOperationSourceStatus,
    val generatedAt: OffsetDateTime,
    val authoritative: Boolean,
    val signals: List<AdminOperationSignal>,
)

data class AdminOperationSourceFreshness(
    val sourceType: AdminOperationSourceType,
    val status: AdminOperationSourceStatus,
    val generatedAt: OffsetDateTime,
    val lastSuccessfulAt: OffsetDateTime?,
    val authoritative: Boolean,
)

data class AdminOperationTransitionCommand(
    val caseId: UUID,
    val expectedVersion: Long,
    val action: AdminOperationAction,
    val actorAdminId: UUID,
    val snoozedUntil: OffsetDateTime?,
    val reasonCode: String,
    val now: OffsetDateTime,
)
