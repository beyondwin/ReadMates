package com.readmates.notification.adapter.`in`.web

import com.readmates.notification.application.NotificationApplicationError
import com.readmates.notification.application.NotificationApplicationException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice(
    assignableTypes = [
        MemberNotificationController::class,
        HostNotificationController::class,
        PlatformAdminNotificationController::class,
    ],
)
class NotificationErrorHandler {
    @ExceptionHandler(NotificationApplicationException::class)
    fun handleNotificationApplicationException(exception: NotificationApplicationException): ResponseEntity<Void> =
        ResponseEntity.status(exception.error.toHttpStatus()).build()

    private fun NotificationApplicationError.toHttpStatus(): HttpStatus =
        when (this) {
            NotificationApplicationError.NOTIFICATION_NOT_FOUND -> HttpStatus.NOT_FOUND
            NotificationApplicationError.INVALID_TEST_MAIL_EMAIL -> HttpStatus.BAD_REQUEST
            NotificationApplicationError.TEST_MAIL_COOLDOWN -> HttpStatus.TOO_MANY_REQUESTS
            NotificationApplicationError.MANUAL_NOTIFICATION_TEMPLATE_UNAVAILABLE -> HttpStatus.CONFLICT
            NotificationApplicationError.MANUAL_NOTIFICATION_AUDIENCE_EMPTY -> HttpStatus.UNPROCESSABLE_ENTITY
            NotificationApplicationError.DUPLICATE_NOTIFICATION_DISPATCH -> HttpStatus.CONFLICT
            NotificationApplicationError.MANUAL_NOTIFICATION_PREVIEW_EXPIRED -> HttpStatus.CONFLICT
            NotificationApplicationError.MEMBERSHIP_NOT_ALLOWED -> HttpStatus.FORBIDDEN
            NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_REASON_REQUIRED -> HttpStatus.BAD_REQUEST
            NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_PREVIEW_EXPIRED -> HttpStatus.CONFLICT
            NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_PREVIEW_NOT_FOUND -> HttpStatus.NOT_FOUND
            NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_SELECTION_MISMATCH -> HttpStatus.CONFLICT
        }
}
