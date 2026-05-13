package com.readmates.notification.application

class NotificationApplicationException(
    val error: NotificationApplicationError,
    message: String,
) : RuntimeException(message)

enum class NotificationApplicationError {
    NOTIFICATION_NOT_FOUND,
    INVALID_TEST_MAIL_EMAIL,
    TEST_MAIL_COOLDOWN,
    MANUAL_NOTIFICATION_TEMPLATE_UNAVAILABLE,
    MANUAL_NOTIFICATION_AUDIENCE_EMPTY,
    DUPLICATE_NOTIFICATION_DISPATCH,
    MANUAL_NOTIFICATION_PREVIEW_EXPIRED,
    MEMBERSHIP_NOT_ALLOWED,
}
