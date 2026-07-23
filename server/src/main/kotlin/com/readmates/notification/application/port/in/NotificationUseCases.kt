package com.readmates.notification.application.port.`in`

import com.readmates.notification.application.model.AdminNotificationDelivery
import com.readmates.notification.application.model.AdminNotificationFilter
import com.readmates.notification.application.model.AdminNotificationOperationsSnapshot
import com.readmates.notification.application.model.AdminNotificationOutboxEvent
import com.readmates.notification.application.model.AdminNotificationReplayConfirmCommand
import com.readmates.notification.application.model.AdminNotificationReplayConfirmResult
import com.readmates.notification.application.model.AdminNotificationReplayPreview
import com.readmates.notification.application.model.AdminNotificationReplayPreviewRequest
import com.readmates.notification.application.model.CompleteHostActionDecisionCommand
import com.readmates.notification.application.model.HostActionDecisionCommand
import com.readmates.notification.application.model.HostActionPreview
import com.readmates.notification.application.model.HostActionPreviewCommand
import com.readmates.notification.application.model.HostNotificationDeliveryList
import com.readmates.notification.application.model.HostNotificationDetail
import com.readmates.notification.application.model.HostNotificationEventList
import com.readmates.notification.application.model.HostNotificationItemList
import com.readmates.notification.application.model.HostNotificationItemQuery
import com.readmates.notification.application.model.HostNotificationSummary
import com.readmates.notification.application.model.ManualNotificationConfirmCommand
import com.readmates.notification.application.model.ManualNotificationConfirmResult
import com.readmates.notification.application.model.ManualNotificationDispatchList
import com.readmates.notification.application.model.ManualNotificationOptions
import com.readmates.notification.application.model.ManualNotificationPreview
import com.readmates.notification.application.model.ManualNotificationPreviewCommand
import com.readmates.notification.application.model.MemberNotificationList
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.model.NotificationPreferences
import com.readmates.notification.application.model.NotificationTestMailAuditItem
import com.readmates.notification.application.model.PreparedHostActionDecision
import com.readmates.notification.application.model.RecordHostConfirmedNotificationEventCommand
import com.readmates.notification.application.model.SendNotificationTestMailCommand
import com.readmates.notification.application.port.out.StoredHostActionDecision
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.notification.domain.NotificationEventOutboxStatus
import com.readmates.notification.domain.NotificationEventType
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.CurrentPlatformAdmin
import java.time.LocalDate
import java.util.UUID

interface RecordNotificationEventUseCase {
    fun recordFeedbackDocumentPublished(
        clubId: UUID,
        sessionId: UUID,
        sessionNumber: Int,
        bookTitle: String,
        documentVersion: Int,
    )

    fun recordNextBookPublished(
        clubId: UUID,
        sessionId: UUID,
        sessionNumber: Int,
        bookTitle: String,
    )

    fun recordReviewPublished(
        clubId: UUID,
        sessionId: UUID,
        sessionNumber: Int,
        bookTitle: String,
        authorMembershipId: UUID,
    )

    fun recordSessionReminderDue(targetDate: LocalDate)

    /**
     * AI session generation finished (task 6.3 / spec §10.x). Emits a
     * NotificationEventType.AI_GENERATION_READY event into the notification
     * outbox addressed to [hostUserId] only. PII invariant: payload carries
     * jobId / sessionId / hostUserId — never transcript text, author names,
     * or book title content.
     */
    fun recordAiGenerationReady(
        jobId: UUID,
        sessionId: UUID,
        clubId: UUID,
        hostUserId: UUID,
    )
}

interface ConfirmHostActionNotificationUseCase {
    fun preview(
        host: CurrentMember,
        command: HostActionPreviewCommand,
    ): HostActionPreview

    fun prepare(
        host: CurrentMember,
        command: HostActionDecisionCommand,
    ): PreparedHostActionDecision

    fun complete(command: CompleteHostActionDecisionCommand): StoredHostActionDecision
}

interface RecordHostConfirmedNotificationEventUseCase {
    fun record(command: RecordHostConfirmedNotificationEventCommand): UUID
}

interface ProcessNotificationDeliveriesUseCase {
    fun processPending(limit: Int): Int

    fun processPendingForClub(
        clubId: UUID,
        limit: Int,
    ): Int
}

interface PublishNotificationEventsUseCase {
    fun publishPending(limit: Int): Int
}

interface DispatchNotificationEventUseCase {
    fun dispatch(message: NotificationEventMessage)
}

interface GetHostNotificationSummaryUseCase {
    fun getHostNotificationSummary(host: CurrentMember): HostNotificationSummary
}

interface ManageHostNotificationsUseCase {
    fun listItems(
        host: CurrentMember,
        query: HostNotificationItemQuery,
        pageRequest: PageRequest,
    ): HostNotificationItemList

    fun listEvents(
        host: CurrentMember,
        status: NotificationEventOutboxStatus?,
        pageRequest: PageRequest,
    ): HostNotificationEventList

    fun listDeliveries(
        host: CurrentMember,
        status: NotificationDeliveryStatus?,
        channel: NotificationChannel?,
        pageRequest: PageRequest,
    ): HostNotificationDeliveryList

    fun detail(
        host: CurrentMember,
        id: UUID,
    ): HostNotificationDetail

    fun retry(
        host: CurrentMember,
        id: UUID,
    ): HostNotificationDetail

    fun restore(
        host: CurrentMember,
        id: UUID,
    ): HostNotificationDetail
}

interface ManageAdminNotificationOperationsUseCase {
    fun snapshot(admin: CurrentPlatformAdmin): AdminNotificationOperationsSnapshot

    fun listEvents(
        admin: CurrentPlatformAdmin,
        filter: AdminNotificationFilter,
        pageRequest: PageRequest,
    ): CursorPage<AdminNotificationOutboxEvent>

    fun listDeliveries(
        admin: CurrentPlatformAdmin,
        filter: AdminNotificationFilter,
        pageRequest: PageRequest,
    ): CursorPage<AdminNotificationDelivery>

    fun previewReplay(
        admin: CurrentPlatformAdmin,
        request: AdminNotificationReplayPreviewRequest,
    ): AdminNotificationReplayPreview

    fun confirmReplay(
        admin: CurrentPlatformAdmin,
        command: AdminNotificationReplayConfirmCommand,
    ): AdminNotificationReplayConfirmResult
}

interface ManageManualHostNotificationsUseCase {
    fun options(
        host: CurrentMember,
        sessionId: UUID?,
        search: String?,
        pageRequest: PageRequest,
    ): ManualNotificationOptions

    fun listDispatches(
        host: CurrentMember,
        sessionId: UUID?,
        eventType: NotificationEventType?,
        pageRequest: PageRequest,
    ): ManualNotificationDispatchList

    fun preview(
        host: CurrentMember,
        command: ManualNotificationPreviewCommand,
    ): ManualNotificationPreview

    fun confirm(
        host: CurrentMember,
        command: ManualNotificationConfirmCommand,
    ): ManualNotificationConfirmResult
}

interface SendNotificationTestMailUseCase {
    fun sendTestMail(
        host: CurrentMember,
        command: SendNotificationTestMailCommand,
    ): NotificationTestMailAuditItem

    fun listTestMailAudit(
        host: CurrentMember,
        pageRequest: PageRequest,
    ): CursorPage<NotificationTestMailAuditItem>
}

interface ManageNotificationPreferencesUseCase {
    fun getPreferences(member: CurrentMember): NotificationPreferences

    fun savePreferences(
        member: CurrentMember,
        preferences: NotificationPreferences,
    ): NotificationPreferences
}

interface ManageMemberNotificationsUseCase {
    fun list(
        member: CurrentMember,
        pageRequest: PageRequest,
    ): MemberNotificationList

    fun unreadCount(member: CurrentMember): Int

    fun markRead(
        member: CurrentMember,
        id: UUID,
    )

    fun markAllRead(member: CurrentMember): Int
}
