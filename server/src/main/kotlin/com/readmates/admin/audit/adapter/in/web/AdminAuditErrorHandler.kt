@file:Suppress("ktlint:standard:package-name")

package com.readmates.admin.audit.adapter.`in`.web

import com.readmates.admin.audit.application.AdminAuditError
import com.readmates.admin.audit.application.AdminAuditException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice(assignableTypes = [PlatformAdminAuditController::class])
class AdminAuditErrorHandler {
    @ExceptionHandler(AdminAuditException::class)
    fun handleAdminAuditException(exception: AdminAuditException): ResponseEntity<Void> =
        ResponseEntity.status(exception.error.toHttpStatus()).build()

    private fun AdminAuditError.toHttpStatus(): HttpStatus =
        when (this) {
            AdminAuditError.INVALID_FILTER -> HttpStatus.BAD_REQUEST
            AdminAuditError.INVALID_CURSOR -> HttpStatus.BAD_REQUEST
        }
}
