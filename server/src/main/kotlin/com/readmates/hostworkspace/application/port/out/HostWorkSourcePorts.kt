package com.readmates.hostworkspace.application.port.out

import com.readmates.hostworkspace.application.model.HostWorkItemType
import com.readmates.hostworkspace.application.model.HostWorkSourceAvailability
import com.readmates.hostworkspace.application.model.HostWorkboxReceiptSummary
import java.time.OffsetDateTime
import java.util.UUID

data class HostWorkSourceRecord(
    val type: HostWorkItemType,
    val resourceId: String,
    val sourceGeneration: String,
    val title: String,
    val description: String,
    val count: Int,
    val dueAt: OffsetDateTime?,
    val resolvedAt: OffsetDateTime?,
    val destinationHref: String,
    val receiptSummary: HostWorkboxReceiptSummary?,
    val priority: Int = type.defaultPriority,
) {
    init {
        require(resourceId.isNotBlank() && sourceGeneration.isNotBlank())
        require(count >= 0)
    }
}

data class HostWorkSourceResult(
    val availability: HostWorkSourceAvailability,
    val records: List<HostWorkSourceRecord>,
)

fun interface HostScheduleUnseenWorkSourcePort {
    fun load(
        clubId: UUID,
        evaluatedAt: OffsetDateTime,
        completedSince: OffsetDateTime,
    ): HostWorkSourceResult
}

fun interface HostMemberApprovalWorkSourcePort {
    fun load(
        clubId: UUID,
        evaluatedAt: OffsetDateTime,
        completedSince: OffsetDateTime,
    ): HostWorkSourceResult
}

fun interface HostRecordClosingWorkSourcePort {
    fun load(
        clubId: UUID,
        evaluatedAt: OffsetDateTime,
        completedSince: OffsetDateTime,
    ): HostWorkSourceResult
}

fun interface HostInvitationExpiryWorkSourcePort {
    fun load(
        clubId: UUID,
        evaluatedAt: OffsetDateTime,
        completedSince: OffsetDateTime,
    ): HostWorkSourceResult
}

fun interface HostNotificationFailureWorkSourcePort {
    fun load(
        clubId: UUID,
        evaluatedAt: OffsetDateTime,
        completedSince: OffsetDateTime,
    ): HostWorkSourceResult
}

private val HostWorkItemType.defaultPriority: Int
    get() =
        when (this) {
            HostWorkItemType.MEMBER_APPROVAL -> MEMBER_APPROVAL_PRIORITY
            HostWorkItemType.SCHEDULE_UNSEEN -> SCHEDULE_UNSEEN_PRIORITY
            HostWorkItemType.RECORD_CLOSING -> RECORD_CLOSING_PRIORITY
            HostWorkItemType.INVITATION_EXPIRY -> INVITATION_EXPIRY_PRIORITY
            HostWorkItemType.NOTIFICATION_FAILURE -> NOTIFICATION_FAILURE_PRIORITY
        }

private const val MEMBER_APPROVAL_PRIORITY = 10
private const val SCHEDULE_UNSEEN_PRIORITY = 20
private const val RECORD_CLOSING_PRIORITY = 30
private const val INVITATION_EXPIRY_PRIORITY = 40
private const val NOTIFICATION_FAILURE_PRIORITY = 50
