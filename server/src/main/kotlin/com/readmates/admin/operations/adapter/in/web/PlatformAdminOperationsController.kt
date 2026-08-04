@file:Suppress("ktlint:standard:package-name")

package com.readmates.admin.operations.adapter.`in`.web

import com.fasterxml.jackson.annotation.JsonAnySetter
import com.fasterxml.jackson.annotation.JsonIgnore
import com.fasterxml.jackson.annotation.JsonUnwrapped
import com.readmates.admin.operations.application.AdminOperationError
import com.readmates.admin.operations.application.AdminOperationException
import com.readmates.admin.operations.application.model.AdminOperationAction
import com.readmates.admin.operations.application.model.AdminOperationAssigneeFilter
import com.readmates.admin.operations.application.model.AdminOperationCase
import com.readmates.admin.operations.application.model.AdminOperationCaseCounts
import com.readmates.admin.operations.application.model.AdminOperationCaseEvent
import com.readmates.admin.operations.application.model.AdminOperationCaseFilter
import com.readmates.admin.operations.application.model.AdminOperationCaseState
import com.readmates.admin.operations.application.model.AdminOperationSeverity
import com.readmates.admin.operations.application.model.AdminOperationSourceFreshness
import com.readmates.admin.operations.application.model.AdminOperationSourceStatus
import com.readmates.admin.operations.application.model.AdminOperationSourceType
import com.readmates.admin.operations.application.port.`in`.AcknowledgeAdminOperationCaseUseCase
import com.readmates.admin.operations.application.port.`in`.AdminOperationCaseDetail
import com.readmates.admin.operations.application.port.`in`.AdminOperationCasePage
import com.readmates.admin.operations.application.port.`in`.AdminOperationCaseView
import com.readmates.admin.operations.application.port.`in`.AdminOperationMutationCommand
import com.readmates.admin.operations.application.port.`in`.GetAdminOperationCaseUseCase
import com.readmates.admin.operations.application.port.`in`.ListAdminOperationCasesUseCase
import com.readmates.admin.operations.application.port.`in`.ResolveAdminOperationCaseUseCase
import com.readmates.admin.operations.application.port.`in`.SnoozeAdminOperationCaseUseCase
import com.readmates.admin.operations.application.port.`in`.SnoozeAdminOperationCommand
import com.readmates.shared.paging.CursorCodec
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode
import java.time.OffsetDateTime
import java.util.UUID

@RestController
@RequestMapping("/api/admin/operations/cases")
class PlatformAdminOperationsController(
    private val listUseCase: ListAdminOperationCasesUseCase,
    private val getUseCase: GetAdminOperationCaseUseCase,
    private val acknowledgeUseCase: AcknowledgeAdminOperationCaseUseCase,
    private val snoozeUseCase: SnoozeAdminOperationCaseUseCase,
    private val resolveUseCase: ResolveAdminOperationCaseUseCase,
) {
    @GetMapping
    @Suppress("LongParameterList")
    fun list(
        admin: CurrentPlatformAdmin,
        @RequestParam(required = false) state: List<String>?,
        @RequestParam(required = false) severity: List<String>?,
        @RequestParam(required = false) source: List<String>?,
        @RequestParam(required = false) assignee: List<String>?,
        @RequestParam(required = false) limit: Int?,
        @RequestParam(required = false) cursor: String?,
    ): AdminOperationCasesResponse {
        val page =
            PageRequest(
                limit = (limit ?: DEFAULT_LIMIT).coerceIn(1, MAX_LIMIT),
                cursor = decodeCursor(cursor),
            )
        val filter =
            AdminOperationCaseFilter(
                states = parseFilter<AdminOperationCaseState>(state),
                severities = parseFilter<AdminOperationSeverity>(severity),
                sources = parseFilter<AdminOperationSourceType>(source),
                assignee = parseSingleFilter<AdminOperationAssigneeFilter>(assignee),
            )
        return listUseCase.list(admin, filter, page).toResponse(admin)
    }

    @GetMapping("/{caseId}")
    fun get(
        admin: CurrentPlatformAdmin,
        @PathVariable caseId: UUID,
    ): AdminOperationCaseDetailResponse = getUseCase.get(admin, caseId).toResponse(admin)

    @PostMapping("/{caseId}/acknowledge")
    fun acknowledge(
        admin: CurrentPlatformAdmin,
        @PathVariable caseId: UUID,
        @RequestBody request: AdminOperationExpectedVersionRequest,
    ): AdminOperationCaseMutationResponse {
        acknowledgeUseCase
            .acknowledge(admin, AdminOperationMutationCommand(caseId, request.requiredExpectedVersion()))
        return getUseCase.get(admin, caseId).case.toMutationResponse(admin)
    }

    @PostMapping("/{caseId}/snooze")
    fun snooze(
        admin: CurrentPlatformAdmin,
        @PathVariable caseId: UUID,
        @RequestBody request: AdminOperationSnoozeRequest,
    ): AdminOperationCaseMutationResponse {
        snoozeUseCase
            .snooze(
                admin,
                SnoozeAdminOperationCommand(
                    caseId = caseId,
                    expectedVersion = request.requiredExpectedVersion(),
                    snoozedUntil = request.requiredSnoozedUntil(),
                ),
            )
        return getUseCase.get(admin, caseId).case.toMutationResponse(admin)
    }

    @PostMapping("/{caseId}/resolve")
    fun resolve(
        admin: CurrentPlatformAdmin,
        @PathVariable caseId: UUID,
        @RequestBody request: AdminOperationExpectedVersionRequest,
    ): AdminOperationCaseMutationResponse {
        resolveUseCase
            .resolve(admin, AdminOperationMutationCommand(caseId, request.requiredExpectedVersion()))
        return getUseCase.get(admin, caseId).case.toMutationResponse(admin)
    }
}

data class AdminOperationExpectedVersionRequest(
    val expectedVersion: JsonNode? = null,
) {
    @JsonIgnore
    private var hasUnknownFields: Boolean = false

    @JsonAnySetter
    fun captureUnknownField(
        @Suppress("UNUSED_PARAMETER") name: String,
        @Suppress("UNUSED_PARAMETER") value: JsonNode,
    ) {
        hasUnknownFields = true
    }

    fun requiredExpectedVersion(): Long =
        expectedVersion
            ?.takeIf { !hasUnknownFields && it.isIntegralNumber && it.canConvertToLong() }
            ?.longValue()
            ?.takeIf { it >= 0 }
            ?: throw InvalidAdminOperationRequestException()
}

data class AdminOperationSnoozeRequest(
    val expectedVersion: JsonNode? = null,
    val snoozedUntil: JsonNode? = null,
) {
    @JsonIgnore
    private var hasUnknownFields: Boolean = false

    @JsonAnySetter
    fun captureUnknownField(
        @Suppress("UNUSED_PARAMETER") name: String,
        @Suppress("UNUSED_PARAMETER") value: JsonNode,
    ) {
        hasUnknownFields = true
    }

    fun requiredExpectedVersion(): Long =
        expectedVersion
            ?.takeIf { !hasUnknownFields && it.isIntegralNumber && it.canConvertToLong() }
            ?.longValue()
            ?.takeIf { it >= 0 }
            ?: throw InvalidAdminOperationRequestException()

    fun requiredSnoozedUntil(): OffsetDateTime =
        snoozedUntil
            ?.takeIf { !hasUnknownFields && it.isString }
            ?.stringValue()
            ?.takeIf { it.isNotBlank() }
            ?.let { runCatching { OffsetDateTime.parse(it) }.getOrNull() }
            ?: throw AdminOperationException(AdminOperationError.INVALID_SNOOZE_WINDOW)
}

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
    @field:JsonUnwrapped
    val case: AdminOperationCaseResponse,
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

private fun AdminOperationCasePage.toResponse(admin: CurrentPlatformAdmin): AdminOperationCasesResponse =
    AdminOperationCasesResponse(
        generatedAt = generatedAt,
        counts = counts.toResponse(),
        sources = sources.map(AdminOperationSourceFreshness::toResponse),
        items = cases.items.map { it.toResponse(admin) },
        nextCursor = cases.nextCursor,
    )

private fun AdminOperationCaseDetail.toResponse(admin: CurrentPlatformAdmin): AdminOperationCaseDetailResponse =
    AdminOperationCaseDetailResponse(
        item = case.toResponse(admin),
        history = history.map(AdminOperationCaseEvent::toResponse),
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

private fun AdminOperationCaseView.toMutationResponse(admin: CurrentPlatformAdmin): AdminOperationCaseMutationResponse =
    AdminOperationCaseMutationResponse(case = toResponse(admin))

private fun AdminOperationCaseEvent.toResponse(): AdminOperationCaseEventResponse =
    AdminOperationCaseEventResponse(
        fromState = fromState,
        toState = toState,
        action = action,
        reasonCode = reasonCode,
        occurredAt = occurredAt,
        caseVersion = caseVersion,
    )

private inline fun <reified E : Enum<E>> parseFilter(rawValues: List<String>?): Set<E> {
    if (rawValues == null) return emptySet()
    val values = rawValues.flatMap { it.split(',') }.map(String::trim)
    if (values.isEmpty() || values.any(String::isBlank)) {
        throw AdminOperationException(AdminOperationError.INVALID_FILTER)
    }
    val allowed = enumValues<E>().associateBy { it.name }
    return values.map { allowed[it] ?: throw AdminOperationException(AdminOperationError.INVALID_FILTER) }.toSet()
}

private inline fun <reified E : Enum<E>> parseSingleFilter(rawValues: List<String>?): E? {
    if (rawValues == null) return null
    val values = rawValues.flatMap { it.split(',') }.map(String::trim)
    if (values.size != 1 || values.single().isBlank()) {
        throw AdminOperationException(AdminOperationError.INVALID_FILTER)
    }
    return enumValues<E>().singleOrNull { it.name == values.single() }
        ?: throw AdminOperationException(AdminOperationError.INVALID_FILTER)
}

private fun decodeCursor(rawCursor: String?): Map<String, String> {
    if (rawCursor == null) return emptyMap()
    return runCatching { CursorCodec.decodeStrict(rawCursor) }
        .getOrNull()
        ?.takeIf(Map<String, String>::isValidCaseCursor)
        ?: throw AdminOperationException(AdminOperationError.INVALID_CURSOR)
}

private fun Map<String, String>.isValidCaseCursor(): Boolean =
    keys == CASE_CURSOR_KEYS &&
        runCatching {
            val severityRank = getValue("severityRank").toInt()
            OffsetDateTime.parse(getValue("firstObservedAt"))
            UUID.fromString(getValue("id"))
            severityRank in AdminOperationSeverity.entries.indices
        }.getOrDefault(false)

class InvalidAdminOperationRequestException : RuntimeException()

private const val ADMIN_OPERATION_CASES_SCHEMA = "admin.operation_cases.v1"
private const val DEFAULT_LIMIT = 25
private const val MAX_LIMIT = 50
private val CASE_CURSOR_KEYS = setOf("severityRank", "firstObservedAt", "id")
