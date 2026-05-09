package com.readmates.shared.adapter.`in`.web

import com.readmates.shared.observability.RequestIdFilter
import org.slf4j.MDC
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity

data class ApiErrorResponse(
    val code: String,
    val message: String,
    val status: Int,
    val traceId: String? = null,
)

fun apiErrorResponse(
    status: HttpStatus,
    code: String,
    message: String = status.defaultApiErrorMessage(),
): ResponseEntity<ApiErrorResponse> =
    ResponseEntity
        .status(status)
        .body(
            ApiErrorResponse(
                code = code,
                message = message,
                status = status.value(),
                traceId = MDC.get(RequestIdFilter.MDC_KEY),
            ),
        )

fun HttpStatus.defaultApiErrorCode(): String =
    when (this) {
        HttpStatus.BAD_REQUEST -> "INVALID_REQUEST"
        HttpStatus.UNAUTHORIZED -> "AUTHENTICATION_REQUIRED"
        HttpStatus.FORBIDDEN -> "PERMISSION_DENIED"
        HttpStatus.NOT_FOUND -> "RESOURCE_NOT_FOUND"
        HttpStatus.CONFLICT -> "CONFLICT"
        HttpStatus.GONE -> "GONE"
        HttpStatus.SERVICE_UNAVAILABLE -> "SERVICE_UNAVAILABLE"
        else -> if (is5xxServerError) "INTERNAL_ERROR" else "INVALID_REQUEST"
    }

fun HttpStatus.defaultApiErrorMessage(): String =
    when (this) {
        HttpStatus.BAD_REQUEST -> "요청을 처리할 수 없습니다."
        HttpStatus.UNAUTHORIZED -> "로그인이 필요합니다."
        HttpStatus.FORBIDDEN -> "이 작업을 수행할 권한이 없습니다."
        HttpStatus.NOT_FOUND -> "요청한 리소스를 찾을 수 없습니다."
        HttpStatus.CONFLICT -> "요청한 작업이 현재 상태와 충돌합니다."
        HttpStatus.GONE -> "더 이상 사용할 수 없는 경로입니다."
        HttpStatus.SERVICE_UNAVAILABLE -> "서비스를 일시적으로 사용할 수 없습니다."
        else -> if (is5xxServerError) {
            "서비스 오류가 발생했습니다."
        } else {
            "요청을 처리할 수 없습니다."
        }
    }
