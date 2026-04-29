package com.readmates.notification.domain

enum class NotificationDeliveryStatus {
    PENDING,
    SENDING,
    SENT,
    FAILED,
    DEAD,
    SKIPPED,
}
