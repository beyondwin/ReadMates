package com.readmates.notification.domain

enum class NotificationEventOutboxStatus {
    PENDING,
    PUBLISHING,
    PUBLISHED,
    FAILED,
    DEAD,
}
