package com.readmates.notification.application.port.`in`

import com.readmates.notification.application.model.HostNotificationSummary
import com.readmates.notification.application.model.NotificationPreferences
import com.readmates.shared.security.CurrentMember
import java.time.LocalDate
import java.util.UUID

interface RecordNotificationEventUseCase {
    fun recordFeedbackDocumentPublished(clubId: UUID, sessionId: UUID)
    fun recordNextBookPublished(clubId: UUID, sessionId: UUID)
    fun recordSessionReminderDue(targetDate: LocalDate)
}

interface ProcessNotificationOutboxUseCase {
    fun processPending(limit: Int): Int
    fun processPendingForClub(clubId: UUID, limit: Int): Int
}

interface GetHostNotificationSummaryUseCase {
    fun getHostNotificationSummary(host: CurrentMember): HostNotificationSummary
}

interface ManageNotificationPreferencesUseCase {
    fun getPreferences(member: CurrentMember): NotificationPreferences
    fun savePreferences(member: CurrentMember, preferences: NotificationPreferences): NotificationPreferences
}
