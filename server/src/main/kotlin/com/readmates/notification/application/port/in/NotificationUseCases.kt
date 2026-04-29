package com.readmates.notification.application.port.`in`

import com.readmates.notification.application.model.HostNotificationDetail
import com.readmates.notification.application.model.HostNotificationItemList
import com.readmates.notification.application.model.HostNotificationItemQuery
import com.readmates.notification.application.model.HostNotificationSummary
import com.readmates.notification.application.model.NotificationTestMailAuditItem
import com.readmates.notification.application.model.NotificationPreferences
import com.readmates.notification.application.model.SendNotificationTestMailCommand
import com.readmates.shared.security.CurrentMember
import java.time.LocalDate
import java.util.UUID

interface RecordNotificationEventUseCase {
    fun recordFeedbackDocumentPublished(clubId: UUID, sessionId: UUID)
    fun recordNextBookPublished(clubId: UUID, sessionId: UUID)
    fun recordReviewPublished(clubId: UUID, sessionId: UUID, authorMembershipId: UUID)
    fun recordSessionReminderDue(targetDate: LocalDate)
}

interface ProcessNotificationOutboxUseCase {
    fun processPending(limit: Int): Int
    fun processPendingForClub(clubId: UUID, limit: Int): Int
}

interface GetHostNotificationSummaryUseCase {
    fun getHostNotificationSummary(host: CurrentMember): HostNotificationSummary
}

interface ManageHostNotificationsUseCase {
    fun listItems(host: CurrentMember, query: HostNotificationItemQuery): HostNotificationItemList
    fun detail(host: CurrentMember, id: UUID): HostNotificationDetail
    fun retry(host: CurrentMember, id: UUID): HostNotificationDetail
    fun restore(host: CurrentMember, id: UUID): HostNotificationDetail
}

interface SendNotificationTestMailUseCase {
    fun sendTestMail(host: CurrentMember, command: SendNotificationTestMailCommand): NotificationTestMailAuditItem
    fun listTestMailAudit(host: CurrentMember): List<NotificationTestMailAuditItem>
}

interface ManageNotificationPreferencesUseCase {
    fun getPreferences(member: CurrentMember): NotificationPreferences
    fun savePreferences(member: CurrentMember, preferences: NotificationPreferences): NotificationPreferences
}
