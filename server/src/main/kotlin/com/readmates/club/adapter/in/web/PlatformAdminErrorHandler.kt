package com.readmates.club.adapter.`in`.web

import com.readmates.club.application.PlatformAdminError
import com.readmates.club.application.PlatformAdminException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice(assignableTypes = [PlatformAdminController::class])
class PlatformAdminErrorHandler {
    @ExceptionHandler(PlatformAdminException::class)
    fun handlePlatformAdminException(exception: PlatformAdminException): ResponseEntity<Void> =
        ResponseEntity.status(exception.error.toHttpStatus()).build()

    private fun PlatformAdminError.toHttpStatus(): HttpStatus =
        when (this) {
            PlatformAdminError.INVALID_DOMAIN -> HttpStatus.BAD_REQUEST
            PlatformAdminError.CLUB_DOMAIN_NOT_FOUND -> HttpStatus.NOT_FOUND
            PlatformAdminError.CLUB_DOMAIN_CONFLICT -> HttpStatus.CONFLICT
        }
}
