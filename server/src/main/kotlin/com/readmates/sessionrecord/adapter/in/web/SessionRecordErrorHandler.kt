@file:Suppress("ktlint:standard:package-name")

package com.readmates.sessionrecord.adapter.`in`.web

import com.readmates.notification.application.model.HostActionNotificationError
import com.readmates.notification.application.model.HostActionNotificationException
import com.readmates.sessionrecord.application.model.SessionRecordError
import com.readmates.sessionrecord.application.model.SessionRecordException
import com.readmates.shared.adapter.`in`.web.ApiErrorResponse
import com.readmates.shared.adapter.`in`.web.apiErrorResponse
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class SessionRecordErrorHandler {
    @ExceptionHandler(SessionRecordException::class)
    fun handleSessionRecord(error: SessionRecordException): ResponseEntity<ApiErrorResponse> =
        when (error.error) {
            SessionRecordError.DRAFT_STALE ->
                conflict("SESSION_RECORD_DRAFT_STALE", "세션 기록 초안이 변경되었습니다.")
            SessionRecordError.LIVE_STALE ->
                conflict("SESSION_RECORD_LIVE_STALE", "현재 세션 기록이 변경되었습니다.")
            SessionRecordError.PREVIEW_ALREADY_CONSUMED ->
                conflict("NOTIFICATION_PREVIEW_ALREADY_CONSUMED", "이미 사용된 알림 확인입니다.")
            SessionRecordError.INVALID_RECORD ->
                apiErrorResponse(
                    HttpStatus.UNPROCESSABLE_CONTENT,
                    "SESSION_RECORD_INVALID",
                    "세션 기록 내용을 확인해 주세요.",
                )
            SessionRecordError.SESSION_NOT_FOUND,
            SessionRecordError.REVISION_NOT_FOUND,
            ->
                apiErrorResponse(
                    HttpStatus.NOT_FOUND,
                    "SESSION_RECORD_NOT_FOUND",
                    "요청한 세션 기록을 찾을 수 없습니다.",
                )
        }

    @ExceptionHandler(HostActionNotificationException::class)
    fun handleNotification(error: HostActionNotificationException): ResponseEntity<ApiErrorResponse> =
        when (error.error) {
            HostActionNotificationError.PREVIEW_EXPIRED ->
                conflict("NOTIFICATION_PREVIEW_EXPIRED", "알림 확인 시간이 만료되었습니다.")
            HostActionNotificationError.TARGETS_CHANGED ->
                conflict("NOTIFICATION_TARGETS_CHANGED", "알림 대상이 변경되었습니다.")
            HostActionNotificationError.PREVIEW_ALREADY_CONSUMED ->
                conflict("NOTIFICATION_PREVIEW_ALREADY_CONSUMED", "이미 사용된 알림 확인입니다.")
            HostActionNotificationError.DUPLICATE_EVENT ->
                conflict("NOTIFICATION_DUPLICATE_EVENT", "동일한 알림 이벤트가 이미 생성되었습니다.")
            HostActionNotificationError.CONFIRMATION_REQUIRED,
            HostActionNotificationError.PREVIEW_NOT_FOUND,
            HostActionNotificationError.PREVIEW_MISMATCH,
            HostActionNotificationError.INVALID_DECISION,
            ->
                conflict("NOTIFICATION_CONFIRMATION_REQUIRED", "알림 전송 여부를 다시 선택해 주세요.")
            HostActionNotificationError.AUDIENCE_EMPTY ->
                apiErrorResponse(
                    HttpStatus.UNPROCESSABLE_CONTENT,
                    "NOTIFICATION_AUDIENCE_EMPTY",
                    "알림을 받을 대상이 없습니다.",
                )
        }

    private fun conflict(
        code: String,
        message: String,
    ) = apiErrorResponse(HttpStatus.CONFLICT, code, message)
}
