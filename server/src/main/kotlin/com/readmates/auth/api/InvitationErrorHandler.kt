package com.readmates.auth.api

import com.readmates.auth.application.InvitationDomainException
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

data class InvitationErrorResponse(
    val code: String,
    val message: String,
)

@RestControllerAdvice
class InvitationErrorHandler {
    @ExceptionHandler(InvitationDomainException::class)
    fun handleInvitationDomainException(error: InvitationDomainException): ResponseEntity<InvitationErrorResponse> {
        return ResponseEntity
            .status(error.status)
            .body(InvitationErrorResponse(code = error.code, message = error.message ?: error.code))
    }
}
