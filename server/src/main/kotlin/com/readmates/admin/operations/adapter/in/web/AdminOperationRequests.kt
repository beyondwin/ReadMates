@file:Suppress("ktlint:standard:package-name")

package com.readmates.admin.operations.adapter.`in`.web

import com.fasterxml.jackson.annotation.JsonAnySetter
import com.fasterxml.jackson.annotation.JsonIgnore
import com.readmates.admin.operations.application.AdminOperationError
import com.readmates.admin.operations.application.AdminOperationException
import com.readmates.admin.operations.application.model.AdminOperationAssigneeFilter
import com.readmates.admin.operations.application.model.AdminOperationCaseFilter
import com.readmates.admin.operations.application.model.AdminOperationCaseState
import com.readmates.admin.operations.application.model.AdminOperationSeverity
import com.readmates.admin.operations.application.model.AdminOperationSourceType
import com.readmates.shared.paging.PageRequest
import tools.jackson.databind.JsonNode
import java.time.OffsetDateTime

data class AdminOperationCaseListRequest(
    val state: List<String>? = null,
    val severity: List<String>? = null,
    val source: List<String>? = null,
    val assignee: List<String>? = null,
    val limit: Int? = null,
    val cursor: String? = null,
)

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

    fun requiredExpectedVersion(): Long = requireExpectedVersion(expectedVersion, hasUnknownFields)
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

    fun requiredExpectedVersion(): Long = requireExpectedVersion(expectedVersion, hasUnknownFields)

    fun requiredSnoozedUntil(): OffsetDateTime =
        snoozedUntil
            ?.takeIf { !hasUnknownFields && it.isString }
            ?.stringValue()
            ?.takeIf { it.isNotBlank() }
            ?.let { runCatching { OffsetDateTime.parse(it) }.getOrNull() }
            ?: throw AdminOperationException(AdminOperationError.INVALID_SNOOZE_WINDOW)
}

internal fun AdminOperationCaseListRequest.toFilter(): AdminOperationCaseFilter =
    AdminOperationCaseFilter(
        states = parseFilter<AdminOperationCaseState>(state),
        severities = parseFilter<AdminOperationSeverity>(severity),
        sources = parseFilter<AdminOperationSourceType>(source),
        assignee = parseSingleFilter<AdminOperationAssigneeFilter>(assignee),
    )

internal fun AdminOperationCaseListRequest.toPageRequest(): PageRequest =
    PageRequest(
        limit = (limit ?: DEFAULT_LIMIT).coerceIn(1, MAX_LIMIT),
        cursor = decodeAdminOperationCaseCursor(cursor),
    )

private fun requireExpectedVersion(
    value: JsonNode?,
    hasUnknownFields: Boolean,
): Long =
    value
        ?.takeIf { !hasUnknownFields && it.isIntegralNumber && it.canConvertToLong() }
        ?.longValue()
        ?.takeIf { it >= 0 }
        ?: throw InvalidAdminOperationRequestException()

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

internal class InvalidAdminOperationRequestException : RuntimeException()

private const val DEFAULT_LIMIT = 25
private const val MAX_LIMIT = 50
