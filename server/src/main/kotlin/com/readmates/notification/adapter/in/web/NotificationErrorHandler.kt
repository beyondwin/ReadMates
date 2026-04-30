package com.readmates.notification.adapter.`in`.web

import com.readmates.notification.application.NotificationApplicationError
import com.readmates.notification.application.NotificationApplicationException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice(assignableTypes = [MemberNotificationController::class, HostNotificationController::class])
class NotificationErrorHandler {
    @ExceptionHandler(NotificationApplicationException::class)
    fun handleNotificationApplicationException(exception: NotificationApplicationException): ResponseEntity<Void> =
        ResponseEntity.status(exception.error.toHttpStatus()).build()

    private fun NotificationApplicationError.toHttpStatus(): HttpStatus =
        when (this) {
            NotificationApplicationError.NOTIFICATION_NOT_FOUND -> HttpStatus.NOT_FOUND
            NotificationApplicationError.INVALID_TEST_MAIL_EMAIL -> HttpStatus.BAD_REQUEST
            NotificationApplicationError.TEST_MAIL_COOLDOWN -> HttpStatus.TOO_MANY_REQUESTS
        }
}
