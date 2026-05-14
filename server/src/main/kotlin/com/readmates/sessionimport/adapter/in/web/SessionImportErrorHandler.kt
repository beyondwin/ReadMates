package com.readmates.sessionimport.adapter.`in`.web

import com.readmates.sessionimport.application.service.InvalidSessionImportException
import com.readmates.shared.adapter.`in`.web.ApiErrorResponse
import com.readmates.shared.adapter.`in`.web.apiErrorResponse
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice(assignableTypes = [SessionImportController::class])
class SessionImportErrorHandler {
    @ExceptionHandler(InvalidSessionImportException::class)
    fun handleInvalidImport(exception: InvalidSessionImportException): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.BAD_REQUEST,
            code = "INVALID_SESSION_IMPORT",
            message = exception.issues.firstOrNull()?.message ?: "세션 import 파일을 확인해 주세요.",
        )
}
