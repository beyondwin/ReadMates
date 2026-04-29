package com.readmates.notification.adapter.`in`.web

import com.readmates.notification.application.model.NotificationPreferences
import com.readmates.notification.domain.NotificationEventType

data class NotificationPreferencesRequest(
    val emailEnabled: Boolean,
    val events: Map<NotificationEventType, Boolean>,
) {
    fun toModel(): NotificationPreferences =
        NotificationPreferences(
            emailEnabled = emailEnabled,
            events = NotificationEventType.entries.associateWith { eventType ->
                events[eventType] ?: NotificationPreferences.defaultEventEnabled(eventType)
            },
        )
}

data class NotificationPreferencesResponse(
    val emailEnabled: Boolean,
    val events: Map<NotificationEventType, Boolean>,
)

fun NotificationPreferences.toResponse(): NotificationPreferencesResponse =
    NotificationPreferencesResponse(
        emailEnabled = emailEnabled,
        events = NotificationEventType.entries.associateWith(::enabled),
    )
