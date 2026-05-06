package com.readmates.archive.adapter.`in`.web

import com.readmates.archive.application.ArchiveApplicationError
import com.readmates.archive.application.ArchiveApplicationException
import com.readmates.shared.adapter.`in`.web.ApiErrorResponse
import com.readmates.shared.adapter.`in`.web.apiErrorResponse
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice(assignableTypes = [ArchiveController::class, MemberArchiveReviewController::class])
class ArchiveErrorHandler {
    @ExceptionHandler(ArchiveApplicationException::class)
    fun handleArchiveApplicationException(exception: ArchiveApplicationException): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = exception.error.toHttpStatus(),
            code = exception.error.toApiCode(),
            message = exception.error.toUserMessage(),
        )

    private fun ArchiveApplicationError.toHttpStatus(): HttpStatus =
        when (this) {
            ArchiveApplicationError.MEMBER_APP_ACCESS_REQUIRED -> HttpStatus.FORBIDDEN
            ArchiveApplicationError.REVIEW_BODY_REQUIRED -> HttpStatus.BAD_REQUEST
            ArchiveApplicationError.SESSION_NOT_FOUND -> HttpStatus.NOT_FOUND
        }

    private fun ArchiveApplicationError.toApiCode(): String =
        when (this) {
            ArchiveApplicationError.MEMBER_APP_ACCESS_REQUIRED -> "PERMISSION_DENIED"
            ArchiveApplicationError.REVIEW_BODY_REQUIRED -> "INVALID_REQUEST"
            ArchiveApplicationError.SESSION_NOT_FOUND -> "SESSION_NOT_FOUND"
        }

    private fun ArchiveApplicationError.toUserMessage(): String =
        when (this) {
            ArchiveApplicationError.MEMBER_APP_ACCESS_REQUIRED -> "멤버 공간에 접근할 권한이 없습니다."
            ArchiveApplicationError.REVIEW_BODY_REQUIRED -> "서평 내용을 입력해 주세요."
            ArchiveApplicationError.SESSION_NOT_FOUND -> "요청한 세션을 찾을 수 없습니다."
        }
}
