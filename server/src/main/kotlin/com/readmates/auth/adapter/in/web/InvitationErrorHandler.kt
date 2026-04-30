package com.readmates.auth.adapter.`in`.web

import com.readmates.auth.application.AuthApplicationError
import com.readmates.auth.application.AuthApplicationException
import com.readmates.auth.application.InvitationDomainException
import com.readmates.auth.application.InvitationDomainError
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class InvitationErrorHandler {
    @ExceptionHandler(InvitationDomainException::class)
    fun handleInvitationDomainException(error: InvitationDomainException): ResponseEntity<InvitationErrorResponse> {
        return ResponseEntity
            .status(error.error.toHttpStatus())
            .body(InvitationErrorResponse(code = error.code, message = error.message ?: error.code))
    }

    @ExceptionHandler(AuthApplicationException::class)
    fun handleAuthApplicationException(error: AuthApplicationException): ResponseEntity<Void> =
        ResponseEntity.status(error.error.toHttpStatus()).build()

    private fun InvitationDomainError.toHttpStatus(): HttpStatus =
        when (this) {
            InvitationDomainError.BAD_REQUEST -> HttpStatus.BAD_REQUEST
            InvitationDomainError.FORBIDDEN -> HttpStatus.FORBIDDEN
            InvitationDomainError.NOT_FOUND -> HttpStatus.NOT_FOUND
            InvitationDomainError.CONFLICT -> HttpStatus.CONFLICT
            InvitationDomainError.STORAGE_UNAVAILABLE -> HttpStatus.SERVICE_UNAVAILABLE
        }

    private fun AuthApplicationError.toHttpStatus(): HttpStatus =
        when (this) {
            AuthApplicationError.AUTHENTICATION_REQUIRED -> HttpStatus.UNAUTHORIZED
            AuthApplicationError.HOST_REQUIRED -> HttpStatus.FORBIDDEN
            AuthApplicationError.MEMBER_NOT_FOUND -> HttpStatus.NOT_FOUND
            AuthApplicationError.MEMBER_CONFLICT -> HttpStatus.CONFLICT
            AuthApplicationError.VIEWER_MEMBER_NOT_FOUND -> HttpStatus.NOT_FOUND
            AuthApplicationError.PENDING_APPROVAL_REQUIRED -> HttpStatus.FORBIDDEN
            AuthApplicationError.CLUB_NOT_FOUND -> HttpStatus.NOT_FOUND
        }
}
