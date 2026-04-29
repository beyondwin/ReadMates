package com.readmates.notification.domain

enum class NotificationOutboxStatus {
    PENDING,
    SENDING,
    SENT,
    FAILED,
    DEAD,
}
