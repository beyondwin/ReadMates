package com.readmates.shared.adapter.`in`.web

import com.readmates.shared.security.AccessDeniedException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.server.ResponseStatusException

@RestControllerAdvice
class SharedApplicationErrorHandler {
    @ExceptionHandler(AccessDeniedException::class)
    fun handleAccessDenied(error: AccessDeniedException): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.FORBIDDEN,
            code = "PERMISSION_DENIED",
            message = "이 작업을 수행할 권한이 없습니다.",
        )

    @ExceptionHandler(ResponseStatusException::class)
    fun handleResponseStatusException(error: ResponseStatusException): ResponseEntity<ApiErrorResponse> {
        val status = HttpStatus.resolve(error.statusCode.value()) ?: HttpStatus.INTERNAL_SERVER_ERROR
        return apiErrorResponse(
            status = status,
            code = status.defaultApiErrorCode(),
            message = status.defaultApiErrorMessage(),
        )
    }
}
