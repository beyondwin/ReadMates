@file:Suppress("ktlint:standard:package-name")

package com.readmates.hostworkspace.adapter.`in`.web

import com.readmates.hostworkspace.application.model.HostWorkboxAccessDeniedException
import com.readmates.hostworkspace.application.model.HostWorkboxAuthoritativeKeyException
import com.readmates.hostworkspace.application.model.HostWorkboxInvalidRequestException
import com.readmates.hostworkspace.application.model.HostWorkboxRestartRequiredException
import com.readmates.shared.adapter.`in`.web.ApiErrorResponse
import com.readmates.shared.adapter.`in`.web.apiErrorResponse
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice(assignableTypes = [HostWorkboxController::class])
class HostWorkboxErrorHandler {
    @ExceptionHandler(HostWorkboxAccessDeniedException::class)
    fun forbidden(): ResponseEntity<ApiErrorResponse> = apiErrorResponse(HttpStatus.FORBIDDEN, "PERMISSION_DENIED", "호스트 권한이 필요합니다.")

    @ExceptionHandler(HostWorkboxAuthoritativeKeyException::class)
    fun keyNotFound(): ResponseEntity<ApiErrorResponse> = apiErrorResponse(HttpStatus.NOT_FOUND, "WORK_ITEM_NOT_FOUND", "작업 항목을 찾을 수 없습니다.")

    @ExceptionHandler(HostWorkboxInvalidRequestException::class)
    fun invalid(): ResponseEntity<ApiErrorResponse> = apiErrorResponse(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "요청 값을 확인해 주세요.")

    @ExceptionHandler(
        HostWorkboxRestartRequiredException::class,
        HostWorkboxCursorRestartException::class,
    )
    fun restart(): ResponseEntity<ApiErrorResponse> = apiErrorResponse(HttpStatus.CONFLICT, "WORKBOX_RESTART_REQUIRED", "작업함을 새로 불러와 주세요.")
}
