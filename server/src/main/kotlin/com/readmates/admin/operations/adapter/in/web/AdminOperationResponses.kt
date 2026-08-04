@file:Suppress("ktlint:standard:package-name")

package com.readmates.admin.operations.adapter.`in`.web

import com.readmates.admin.operations.application.model.AdminOperationAction
import com.readmates.admin.operations.application.model.AdminOperationCase
import com.readmates.admin.operations.application.model.AdminOperationCaseCounts
import com.readmates.admin.operations.application.model.AdminOperationCaseEvent
import com.readmates.admin.operations.application.model.AdminOperationCaseState
import com.readmates.admin.operations.application.model.AdminOperationSeverity
import com.readmates.admin.operations.application.model.AdminOperationSourceFreshness
import com.readmates.admin.operations.application.model.AdminOperationSourceStatus
import com.readmates.admin.operations.application.model.AdminOperationSourceType
import com.readmates.admin.operations.application.port.`in`.AdminOperationCaseDetail
import com.readmates.admin.operations.application.port.`in`.AdminOperationCasePage
import com.readmates.admin.operations.application.port.`in`.AdminOperationCaseView
import com.readmates.shared.security.CurrentPlatformAdmin
import java.time.OffsetDateTime
import java.util.UUID

data class AdminOperationCasesResponse(
    val schema: String = ADMIN_OPERATION_CASES_SCHEMA,
    val generatedAt: OffsetDateTime,
    val counts: AdminOperationCaseCountsResponse,
    val sources: List<AdminOperationSourceFreshnessResponse>,
    val items: List<AdminOperationCaseResponse>,
    val nextCursor: String?,
)

data class AdminOperationCaseDetailResponse(
    val schema: String = ADMIN_OPERATION_CASES_SCHEMA,
    val item: AdminOperationCaseResponse,
    val history: List<AdminOperationCaseEventResponse>,
)

data class AdminOperationCaseMutationResponse(
    val schema: String = ADMIN_OPERATION_CASES_SCHEMA,
    val id: UUID,
    val sourceType: AdminOperationSourceType,
    val clubId: UUID?,
    val state: AdminOperationCaseState,
    val severity: AdminOperationSeverity,
    val summaryCode: String,
    val firstObservedAt: OffsetDateTime,
    val lastObservedAt: OffsetDateTime,
    val snoozedUntil: OffsetDateTime?,
    val resolvedAt: OffsetDateTime?,
    val assignedToMe: Boolean,
    val reopenCount: Int,
    val version: Long,
    val impactCount: Int,
    val detailHref: String,
)

data class AdminOperationCaseCountsResponse(
    val open: Long,
    val critical: Long,
    val assignedToMe: Long,
    val snoozed: Long,
)

data class AdminOperationSourceFreshnessResponse(
    val sourceType: AdminOperationSourceType,
    val status: AdminOperationSourceStatus,
    val generatedAt: OffsetDateTime,
    val lastSuccessfulAt: OffsetDateTime?,
    val authoritative: Boolean,
)

data class AdminOperationCaseResponse(
    val id: UUID,
    val sourceType: AdminOperationSourceType,
    val clubId: UUID?,
    val state: AdminOperationCaseState,
    val severity: AdminOperationSeverity,
    val summaryCode: String,
    val firstObservedAt: OffsetDateTime,
    val lastObservedAt: OffsetDateTime,
    val snoozedUntil: OffsetDateTime?,
    val resolvedAt: OffsetDateTime?,
    val assignedToMe: Boolean,
    val reopenCount: Int,
    val version: Long,
    val impactCount: Int,
    val detailHref: String,
    val allowedActions: List<AdminOperationAction>,
    val source: AdminOperationSourceFreshnessResponse,
)

data class AdminOperationCaseEventResponse(
    val fromState: AdminOperationCaseState?,
    val toState: AdminOperationCaseState,
    val action: AdminOperationAction?,
    val reasonCode: String,
    val occurredAt: OffsetDateTime,
    val caseVersion: Long,
)

internal fun AdminOperationCasePage.toResponse(admin: CurrentPlatformAdmin): AdminOperationCasesResponse =
    AdminOperationCasesResponse(
        generatedAt = generatedAt,
        counts = counts.toResponse(),
        sources = sources.map(AdminOperationSourceFreshness::toResponse),
        items = cases.items.map { it.toResponse(admin) },
        nextCursor = cases.nextCursor,
    )

internal fun AdminOperationCaseDetail.toResponse(admin: CurrentPlatformAdmin): AdminOperationCaseDetailResponse =
    AdminOperationCaseDetailResponse(
        item = case.toResponse(admin),
        history = history.map(AdminOperationCaseEvent::toResponse),
    )

internal fun AdminOperationCase.toMutationResponse(admin: CurrentPlatformAdmin): AdminOperationCaseMutationResponse =
    AdminOperationCaseMutationResponse(
        id = id,
        sourceType = sourceType,
        clubId = clubId,
        state = state,
        severity = severity,
        summaryCode = summaryCode,
        firstObservedAt = firstObservedAt,
        lastObservedAt = lastObservedAt,
        snoozedUntil = snoozedUntil,
        resolvedAt = resolvedAt,
        assignedToMe = assigneeAdminId == admin.userId,
        reopenCount = reopenCount,
        version = version,
        impactCount = impactCount,
        detailHref = detailHref,
    )

private fun AdminOperationCaseCounts.toResponse(): AdminOperationCaseCountsResponse =
    AdminOperationCaseCountsResponse(
        open = open,
        critical = critical,
        assignedToMe = assignedToMe,
        snoozed = snoozed,
    )

private fun AdminOperationSourceFreshness.toResponse(): AdminOperationSourceFreshnessResponse =
    AdminOperationSourceFreshnessResponse(
        sourceType = sourceType,
        status = status,
        generatedAt = generatedAt,
        lastSuccessfulAt = lastSuccessfulAt,
        authoritative = authoritative,
    )

private fun AdminOperationCaseView.toResponse(admin: CurrentPlatformAdmin): AdminOperationCaseResponse =
    AdminOperationCaseResponse(
        id = case.id,
        sourceType = case.sourceType,
        clubId = case.clubId,
        state = case.state,
        severity = case.severity,
        summaryCode = case.summaryCode,
        firstObservedAt = case.firstObservedAt,
        lastObservedAt = case.lastObservedAt,
        snoozedUntil = case.snoozedUntil,
        resolvedAt = case.resolvedAt,
        assignedToMe = case.assigneeAdminId == admin.userId,
        reopenCount = case.reopenCount,
        version = case.version,
        impactCount = case.impactCount,
        detailHref = case.detailHref,
        allowedActions = allowedActions.sortedBy(AdminOperationAction::ordinal),
        source = source.toResponse(),
    )

private fun AdminOperationCaseEvent.toResponse(): AdminOperationCaseEventResponse =
    AdminOperationCaseEventResponse(
        fromState = fromState,
        toState = toState,
        action = action,
        reasonCode = reasonCode,
        occurredAt = occurredAt,
        caseVersion = caseVersion,
    )

private const val ADMIN_OPERATION_CASES_SCHEMA = "admin.operation_cases.v1"
