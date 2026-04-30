package com.readmates.archive.adapter.`in`.web

import com.readmates.archive.application.ArchiveApplicationError
import com.readmates.archive.application.ArchiveApplicationException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice(assignableTypes = [ArchiveController::class, MemberArchiveReviewController::class])
class ArchiveErrorHandler {
    @ExceptionHandler(ArchiveApplicationException::class)
    fun handleArchiveApplicationException(exception: ArchiveApplicationException): ResponseEntity<Void> =
        ResponseEntity.status(exception.error.toHttpStatus()).build()

    private fun ArchiveApplicationError.toHttpStatus(): HttpStatus =
        when (this) {
            ArchiveApplicationError.MEMBER_APP_ACCESS_REQUIRED -> HttpStatus.FORBIDDEN
            ArchiveApplicationError.REVIEW_BODY_REQUIRED -> HttpStatus.BAD_REQUEST
            ArchiveApplicationError.SESSION_NOT_FOUND -> HttpStatus.NOT_FOUND
        }
}
