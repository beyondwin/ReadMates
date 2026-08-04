@file:Suppress("ktlint:standard:package-name")

package com.readmates.admin.operations.adapter.`in`.web

import com.readmates.admin.operations.application.AdminOperationError
import com.readmates.admin.operations.application.AdminOperationException
import com.readmates.shared.adapter.`in`.web.ApiErrorResponse
import com.readmates.shared.adapter.`in`.web.apiErrorResponse
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException

@RestControllerAdvice(assignableTypes = [PlatformAdminOperationsController::class])
class AdminOperationErrorHandler {
    @ExceptionHandler(AdminOperationException::class)
    fun handleAdminOperation(error: AdminOperationException): ResponseEntity<ApiErrorResponse> =
        when (error.error) {
            AdminOperationError.CASE_NOT_FOUND ->
                apiErrorResponse(HttpStatus.NOT_FOUND, error.error.name, "요청한 운영 케이스를 찾을 수 없습니다.")
            AdminOperationError.PERMISSION_DENIED ->
                apiErrorResponse(HttpStatus.FORBIDDEN, error.error.name, "이 작업을 수행할 권한이 없습니다.")
            AdminOperationError.INVALID_SNOOZE_WINDOW ->
                apiErrorResponse(HttpStatus.BAD_REQUEST, error.error.name, "보류 시각을 다시 확인해 주세요.")
            AdminOperationError.CASE_VERSION_CONFLICT ->
                apiErrorResponse(HttpStatus.CONFLICT, error.error.name, "다른 운영자가 먼저 상태를 변경했습니다.")
            AdminOperationError.CASE_STILL_ACTIVE ->
                apiErrorResponse(HttpStatus.CONFLICT, error.error.name, "운영 신호가 아직 활성 상태입니다.")
            AdminOperationError.CASE_SOURCE_UNAVAILABLE ->
                apiErrorResponse(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    error.error.name,
                    "운영 신호를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.",
                )
            AdminOperationError.INVALID_CURSOR ->
                apiErrorResponse(HttpStatus.BAD_REQUEST, error.error.name, "페이지 정보를 다시 확인해 주세요.")
            AdminOperationError.INVALID_FILTER ->
                apiErrorResponse(HttpStatus.BAD_REQUEST, error.error.name, "검색 조건을 다시 확인해 주세요.")
            AdminOperationError.INVALID_REASON_CODE ->
                apiErrorResponse(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "요청을 처리할 수 없습니다.")
        }

    @ExceptionHandler(
        InvalidAdminOperationRequestException::class,
        HttpMessageNotReadableException::class,
        MethodArgumentTypeMismatchException::class,
    )
    fun handleInvalidRequest(
        @Suppress("UNUSED_PARAMETER") error: Exception,
    ): ResponseEntity<ApiErrorResponse> = apiErrorResponse(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "요청을 처리할 수 없습니다.")
}
