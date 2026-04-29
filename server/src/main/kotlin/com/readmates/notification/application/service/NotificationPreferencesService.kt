package com.readmates.notification.application.service

import com.readmates.notification.application.model.NotificationPreferences
import com.readmates.notification.application.port.`in`.ManageNotificationPreferencesUseCase
import com.readmates.notification.application.port.out.NotificationPreferencesPort
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service

@Service
class NotificationPreferencesService(
    private val notificationPreferencesPort: NotificationPreferencesPort,
) : ManageNotificationPreferencesUseCase {
    override fun getPreferences(member: CurrentMember): NotificationPreferences =
        notificationPreferencesPort.getPreferences(member)

    override fun savePreferences(
        member: CurrentMember,
        preferences: NotificationPreferences,
    ): NotificationPreferences =
        notificationPreferencesPort.savePreferences(member, preferences)
}
