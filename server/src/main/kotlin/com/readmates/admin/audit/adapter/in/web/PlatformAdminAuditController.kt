@file:Suppress("ktlint:standard:package-name")

package com.readmates.admin.audit.adapter.`in`.web

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
import com.readmates.admin.audit.application.model.AdminAuditSourceSlice
import com.readmates.admin.audit.application.model.AdminAuditSummary
import com.readmates.admin.audit.application.model.AdminAuditTarget
import com.readmates.admin.audit.application.model.AdminAuditTimeRange
import com.readmates.admin.audit.application.port.`in`.ListAdminAuditLedgerUseCase
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentPlatformAdmin
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

@RestController
@RequestMapping("/api/admin/audit")
class PlatformAdminAuditController(
    private val useCase: ListAdminAuditLedgerUseCase,
) {
    @GetMapping("/events")
    @Suppress("LongParameterList")
    fun events(
        admin: CurrentPlatformAdmin,
        request: HttpServletRequest,
        @RequestParam(required = false) from: OffsetDateTime?,
        @RequestParam(required = false) to: OffsetDateTime?,
        @RequestParam(required = false) range: String?,
        @RequestParam(required = false) clubId: UUID?,
        @RequestParam(required = false) actorRole: AdminAuditActorRole?,
        @RequestParam(required = false) sourceSlice: AdminAuditSourceSlice?,
        @RequestParam(required = false) actionCategory: AdminAuditActionCategory?,
        @RequestParam(required = false) outcome: AdminAuditOutcome?,
        @RequestParam(required = false) limit: Int?,
        @RequestParam(required = false) cursor: String?,
    ): AdminAuditLedgerPageResponse {
        rejectSensitiveGetFilters(request)
        val now = OffsetDateTime.now(ZoneOffset.UTC)
        val normalizedRange = range?.toTimeRange()
        val resolvedTo = (to ?: now).withOffsetSameInstant(ZoneOffset.UTC)
        val resolvedFrom =
            (from ?: normalizedRange?.from(resolvedTo) ?: resolvedTo.minusDays(DEFAULT_RANGE_DAYS))
                .withOffsetSameInstant(ZoneOffset.UTC)
        return useCase
            .listLedger(
                admin,
                AdminAuditListQuery(
                    filter =
                        AdminAuditFilter(
                            from = resolvedFrom,
                            to = resolvedTo,
                            range = normalizedRange,
                            clubId = clubId,
                            actorRole = actorRole,
                            sourceSlice = sourceSlice,
                            actionCategory = actionCategory,
                            outcome = outcome,
                        ),
                    pageRequest =
                        PageRequest.cursor(
                            limit,
                            null,
                            defaultLimit = DEFAULT_LIMIT,
                            maxLimit = MAX_LIMIT,
                        ),
                    rawCursor = cursor,
                ),
            ).toResponse()
    }

    @PostMapping("/events/search")
    fun search(
        admin: CurrentPlatformAdmin,
        @RequestBody request: AdminAuditSearchRequest,
    ): ResponseEntity<AdminAuditLedgerPageResponse> {
        val now = OffsetDateTime.now(ZoneOffset.UTC)
        val normalizedRange = request.range?.toTimeRange()
        val resolvedTo = (request.to ?: now).withOffsetSameInstant(ZoneOffset.UTC)
        val resolvedFrom =
            (request.from ?: normalizedRange?.from(resolvedTo) ?: resolvedTo.minusDays(DEFAULT_RANGE_DAYS))
                .withOffsetSameInstant(ZoneOffset.UTC)
        val page =
            useCase.listLedger(
                admin,
                AdminAuditListQuery(
                    filter =
                        AdminAuditFilter(
                            from = resolvedFrom,
                            to = resolvedTo,
                            range = normalizedRange,
                            clubId = request.clubId,
                            actorRole = request.actorRole,
                            sourceSlice = request.sourceSlice,
                            actionCategory = request.actionCategory,
                            outcome = request.outcome,
                        ),
                    pageRequest = PageRequest.cursor(request.limit, null, DEFAULT_LIMIT, MAX_LIMIT),
                    rawCursor = request.cursor,
                    sensitiveTarget = request.sensitiveTarget,
                ),
            )
        return ResponseEntity
            .ok()
            .cacheControl(CacheControl.noStore())
            .body(page.toResponse())
    }
}

data class AdminAuditSearchRequest(
    val from: OffsetDateTime? = null,
    val to: OffsetDateTime? = null,
    val range: String? = null,
    val clubId: UUID? = null,
    val actorRole: AdminAuditActorRole? = null,
    val sourceSlice: AdminAuditSourceSlice? = null,
    val actionCategory: AdminAuditActionCategory? = null,
    val outcome: AdminAuditOutcome? = null,
    val sensitiveTarget: String? = null,
    val limit: Int? = null,
    val cursor: String? = null,
)

data class AdminAuditLedgerPageResponse(
    val generatedAt: OffsetDateTime,
    val filters: AdminAuditFilterResponse,
    val summary: AdminAuditSummaryResponse,
    val items: List<AdminAuditLedgerItemResponse>,
    val nextCursor: String?,
)

data class AdminAuditFilterResponse(
    val from: OffsetDateTime,
    val to: OffsetDateTime,
    val clubId: UUID?,
    val actorRole: AdminAuditActorRole?,
    val sourceSlice: AdminAuditSourceSlice?,
    val actionCategory: AdminAuditActionCategory?,
    val outcome: AdminAuditOutcome?,
)

data class AdminAuditSummaryResponse(
    val visibleCount: Int,
    val sourceUnavailableCount: Int,
    val metadataUnavailableCount: Int,
    val unavailableSources: List<String>,
)

data class AdminAuditLedgerItemResponse(
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

private fun AdminAuditLedgerPage.toResponse(): AdminAuditLedgerPageResponse =
    AdminAuditLedgerPageResponse(
        generatedAt = generatedAt,
        filters =
            AdminAuditFilterResponse(
                from = filters.from,
                to = filters.to,
                clubId = filters.clubId,
                actorRole = filters.actorRole,
                sourceSlice = filters.sourceSlice,
                actionCategory = filters.actionCategory,
                outcome = filters.outcome,
            ),
        summary = summary.toResponse(),
        items = items.map(AdminAuditLedgerItem::toResponse),
        nextCursor = nextCursor,
    )

private fun AdminAuditSummary.toResponse(): AdminAuditSummaryResponse =
    AdminAuditSummaryResponse(
        visibleCount = visibleCount,
        sourceUnavailableCount = sourceUnavailableCount,
        metadataUnavailableCount = metadataUnavailableCount,
        unavailableSources = unavailableSources.map { it.tableName },
    )

private fun AdminAuditLedgerItem.toResponse(): AdminAuditLedgerItemResponse =
    AdminAuditLedgerItemResponse(
        id = id,
        occurredAt = occurredAt,
        sourceSlice = sourceSlice,
        sourceTable = sourceTable,
        actionCategory = actionCategory,
        actionType = actionType,
        outcome = outcome,
        actor = actor,
        target = target,
        summary = summary,
        safeMetadata = safeMetadata,
        metadataState = metadataState,
    )

private fun String.toTimeRange(): AdminAuditTimeRange =
    AdminAuditTimeRange.entries.firstOrNull { it.wireValue == this }
        ?: throw AdminAuditException(AdminAuditError.INVALID_FILTER, "Invalid audit range")

private fun AdminAuditTimeRange.from(to: OffsetDateTime): OffsetDateTime =
    when (this) {
        AdminAuditTimeRange.HOURS_24 -> to.minusHours(HOURS_IN_DAY)
        AdminAuditTimeRange.DAYS_7 -> to.minusDays(DAYS_IN_WEEK)
        AdminAuditTimeRange.DAYS_30 -> to.minusDays(DAYS_IN_MONTH)
        AdminAuditTimeRange.DAYS_90 -> to.minusDays(DAYS_IN_QUARTER)
    }

private fun rejectSensitiveGetFilters(request: HttpServletRequest) {
    if (request.parameterMap.keys.any { it.lowercase().replace(NON_ALPHANUMERIC, "") in SENSITIVE_GET_FILTERS }) {
        throw AdminAuditException(AdminAuditError.INVALID_FILTER, "Sensitive target filters require POST")
    }
}

private const val DEFAULT_LIMIT = 25
private const val MAX_LIMIT = 50
private const val DEFAULT_RANGE_DAYS = 7L
private const val HOURS_IN_DAY = 24L
private const val DAYS_IN_WEEK = 7L
private const val DAYS_IN_MONTH = 30L
private const val DAYS_IN_QUARTER = 90L
private val SENSITIVE_GET_FILTERS =
    setOf("target", "targetuserid", "userid", "memberid", "email", "name", "sensitivetarget", "search", "query")
private val NON_ALPHANUMERIC = Regex("[^a-z0-9]")
