package com.readmates.shared.adapter.`in`.web

import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.HostAuthorityLossCode
import com.readmates.shared.security.HostAuthorityLossContract
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.server.ResponseStatusException

@RestControllerAdvice
class SharedApplicationErrorHandler {
    @ExceptionHandler(AccessDeniedException::class)
    fun handleAccessDenied(
        error: AccessDeniedException,
        request: HttpServletRequest? = null,
    ): ResponseEntity<*> {
        val code = request?.getAttribute(HostAuthorityLossContract.REQUEST_ATTRIBUTE) as? HostAuthorityLossCode
        return if (code == null) {
            apiErrorResponse(
                status = HttpStatus.FORBIDDEN,
                code = "PERMISSION_DENIED",
                message = "이 작업을 수행할 권한이 없습니다.",
            )
        } else {
            ResponseEntity
                .status(HttpStatus.FORBIDDEN)
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .body(HostAuthorityLossProblem(code = code.name, detail = code.detail))
        }
    }

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

private data class HostAuthorityLossProblem(
    val type: String = "about:blank",
    val title: String = "Forbidden",
    val status: Int = HttpStatus.FORBIDDEN.value(),
    val detail: String,
    val code: String,
)
