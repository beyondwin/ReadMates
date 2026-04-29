package com.readmates.notification.application.port.out

import com.readmates.notification.application.model.NotificationPreferences
import com.readmates.shared.security.CurrentMember

interface NotificationPreferencesPort {
    fun getPreferences(member: CurrentMember): NotificationPreferences
    fun savePreferences(member: CurrentMember, preferences: NotificationPreferences): NotificationPreferences
}
