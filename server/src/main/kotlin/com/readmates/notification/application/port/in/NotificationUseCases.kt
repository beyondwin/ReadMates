package com.readmates.notification.application.port.`in`

import com.readmates.notification.application.model.HostNotificationDetail
import com.readmates.notification.application.model.HostNotificationDeliveryList
import com.readmates.notification.application.model.HostNotificationEventList
import com.readmates.notification.application.model.HostNotificationItemList
import com.readmates.notification.application.model.HostNotificationItemQuery
import com.readmates.notification.application.model.HostNotificationSummary
import com.readmates.notification.application.model.MemberNotificationList
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.model.NotificationTestMailAuditItem
import com.readmates.notification.application.model.NotificationPreferences
import com.readmates.notification.application.model.SendNotificationTestMailCommand
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.notification.domain.NotificationEventOutboxStatus
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
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
    fun recordNextBookPublished(clubId: UUID, sessionId: UUID, sessionNumber: Int, bookTitle: String)
    fun recordReviewPublished(
        clubId: UUID,
        sessionId: UUID,
        sessionNumber: Int,
        bookTitle: String,
        authorMembershipId: UUID,
    )
    fun recordSessionReminderDue(targetDate: LocalDate)
}

interface ProcessNotificationDeliveriesUseCase {
    fun processPending(limit: Int): Int
    fun processPendingForClub(clubId: UUID, limit: Int): Int
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
    fun listItems(host: CurrentMember, query: HostNotificationItemQuery, pageRequest: PageRequest): HostNotificationItemList
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
    fun detail(host: CurrentMember, id: UUID): HostNotificationDetail
    fun retry(host: CurrentMember, id: UUID): HostNotificationDetail
    fun restore(host: CurrentMember, id: UUID): HostNotificationDetail
}

interface SendNotificationTestMailUseCase {
    fun sendTestMail(host: CurrentMember, command: SendNotificationTestMailCommand): NotificationTestMailAuditItem
    fun listTestMailAudit(host: CurrentMember, pageRequest: PageRequest): CursorPage<NotificationTestMailAuditItem>
}

interface ManageNotificationPreferencesUseCase {
    fun getPreferences(member: CurrentMember): NotificationPreferences
    fun savePreferences(member: CurrentMember, preferences: NotificationPreferences): NotificationPreferences
}

interface ManageMemberNotificationsUseCase {
    fun list(member: CurrentMember, pageRequest: PageRequest): MemberNotificationList
    fun unreadCount(member: CurrentMember): Int
    fun markRead(member: CurrentMember, id: UUID)
    fun markAllRead(member: CurrentMember): Int
}
