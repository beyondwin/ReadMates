package com.readmates.auth.adapter.`in`.web

import com.readmates.auth.application.AuthApplicationError
import com.readmates.auth.application.AuthApplicationException
import com.readmates.auth.application.InvitationDomainError
import com.readmates.auth.application.InvitationDomainException
import com.readmates.shared.adapter.`in`.web.ApiErrorResponse
import com.readmates.shared.adapter.`in`.web.apiErrorResponse
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class InvitationErrorHandler {
    @ExceptionHandler(InvitationDomainException::class)
    fun handleInvitationDomainException(error: InvitationDomainException): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = error.error.toHttpStatus(),
            code = error.code,
            message = error.message ?: error.code,
        )

    @ExceptionHandler(AuthApplicationException::class)
    fun handleAuthApplicationException(error: AuthApplicationException): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = error.error.toHttpStatus(),
            code = error.error.toApiCode(),
            message = error.error.toUserMessage(),
        )

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

    private fun AuthApplicationError.toApiCode(): String =
        when (this) {
            AuthApplicationError.AUTHENTICATION_REQUIRED -> "AUTHENTICATION_REQUIRED"
            AuthApplicationError.HOST_REQUIRED -> "PERMISSION_DENIED"
            AuthApplicationError.MEMBER_NOT_FOUND -> "MEMBER_NOT_FOUND"
            AuthApplicationError.MEMBER_CONFLICT -> "CONFLICT"
            AuthApplicationError.VIEWER_MEMBER_NOT_FOUND -> "MEMBER_NOT_FOUND"
            AuthApplicationError.PENDING_APPROVAL_REQUIRED -> "PERMISSION_DENIED"
            AuthApplicationError.CLUB_NOT_FOUND -> "CLUB_NOT_FOUND"
        }

    private fun AuthApplicationError.toUserMessage(): String =
        when (this) {
            AuthApplicationError.AUTHENTICATION_REQUIRED -> "로그인이 필요합니다."
            AuthApplicationError.HOST_REQUIRED -> "호스트 권한이 필요합니다."
            AuthApplicationError.MEMBER_NOT_FOUND -> "멤버를 찾을 수 없습니다."
            AuthApplicationError.MEMBER_CONFLICT -> "멤버 상태가 현재 요청과 충돌합니다."
            AuthApplicationError.VIEWER_MEMBER_NOT_FOUND -> "승인 대기 멤버를 찾을 수 없습니다."
            AuthApplicationError.PENDING_APPROVAL_REQUIRED -> "승인 대기 상태에서만 사용할 수 있습니다."
            AuthApplicationError.CLUB_NOT_FOUND -> "클럽을 찾을 수 없습니다."
        }
}
