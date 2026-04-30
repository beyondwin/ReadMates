package com.readmates.notification.application

class NotificationApplicationException(
    val error: NotificationApplicationError,
    message: String,
) : RuntimeException(message)

enum class NotificationApplicationError {
    NOTIFICATION_NOT_FOUND,
    INVALID_TEST_MAIL_EMAIL,
    TEST_MAIL_COOLDOWN,
}
