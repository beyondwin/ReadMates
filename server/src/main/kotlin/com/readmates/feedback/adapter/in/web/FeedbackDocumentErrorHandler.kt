package com.readmates.feedback.adapter.`in`.web

import com.readmates.feedback.application.FeedbackDocumentError
import com.readmates.feedback.application.FeedbackDocumentException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice(assignableTypes = [FeedbackDocumentController::class])
class FeedbackDocumentErrorHandler {
    @ExceptionHandler(FeedbackDocumentException::class)
    fun handleFeedbackDocumentException(exception: FeedbackDocumentException): ResponseEntity<Void> =
        ResponseEntity.status(exception.error.toHttpStatus()).build()

    private fun FeedbackDocumentError.toHttpStatus(): HttpStatus =
        when (this) {
            FeedbackDocumentError.NOT_FOUND -> HttpStatus.NOT_FOUND
            FeedbackDocumentError.STORAGE_UNAVAILABLE -> HttpStatus.SERVICE_UNAVAILABLE
            FeedbackDocumentError.ACTIVE_MEMBERSHIP_REQUIRED -> HttpStatus.FORBIDDEN
            FeedbackDocumentError.INVALID_TEMPLATE -> HttpStatus.BAD_REQUEST
            FeedbackDocumentError.INVALID_STORED_DOCUMENT -> HttpStatus.UNPROCESSABLE_ENTITY
        }
}
