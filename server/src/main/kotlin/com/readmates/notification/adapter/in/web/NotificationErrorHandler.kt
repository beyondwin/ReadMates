package com.readmates.notification.adapter.`in`.web

import com.readmates.notification.application.NotificationApplicationError
import com.readmates.notification.application.NotificationApplicationException
import com.readmates.shared.adapter.`in`.web.ApiErrorResponse
import com.readmates.shared.adapter.`in`.web.apiErrorResponse
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice(
    assignableTypes = [
        MemberNotificationController::class,
        HostNotificationController::class,
        PlatformAdminNotificationController::class,
    ],
)
class NotificationErrorHandler {
    @ExceptionHandler(NotificationApplicationException::class)
    @Suppress("MaxLineLength")
    fun handleNotificationApplicationException(exception: NotificationApplicationException): ResponseEntity<ApiErrorResponse> {
        val status = exception.error.toHttpStatus()
        return apiErrorResponse(
            status = status,
            code = exception.error.name,
            message = exception.error.toPublicMessage(),
        )
    }

    @Suppress("CyclomaticComplexMethod")
    private fun NotificationApplicationError.toHttpStatus(): HttpStatus =
        when (this) {
            NotificationApplicationError.NOTIFICATION_NOT_FOUND -> HttpStatus.NOT_FOUND
            NotificationApplicationError.INVALID_TEST_MAIL_EMAIL -> HttpStatus.BAD_REQUEST
            NotificationApplicationError.TEST_MAIL_COOLDOWN -> HttpStatus.TOO_MANY_REQUESTS
            NotificationApplicationError.MANUAL_NOTIFICATION_TEMPLATE_UNAVAILABLE -> HttpStatus.CONFLICT
            NotificationApplicationError.MANUAL_NOTIFICATION_AUDIENCE_EMPTY -> HttpStatus.UNPROCESSABLE_CONTENT
            NotificationApplicationError.DUPLICATE_NOTIFICATION_DISPATCH -> HttpStatus.CONFLICT
            NotificationApplicationError.MANUAL_NOTIFICATION_PREVIEW_NOT_FOUND -> HttpStatus.NOT_FOUND
            NotificationApplicationError.MANUAL_NOTIFICATION_PREVIEW_EXPIRED -> HttpStatus.CONFLICT
            NotificationApplicationError.MANUAL_NOTIFICATION_PREVIEW_REUSED -> HttpStatus.CONFLICT
            NotificationApplicationError.MANUAL_NOTIFICATION_SELECTION_INVALID -> HttpStatus.UNPROCESSABLE_CONTENT
            NotificationApplicationError.MANUAL_NOTIFICATION_RECIPIENT_INVALID -> HttpStatus.UNPROCESSABLE_CONTENT
            NotificationApplicationError.MANUAL_NOTIFICATION_RECIPIENTS_CHANGED -> HttpStatus.CONFLICT
            NotificationApplicationError.MANUAL_NOTIFICATION_CONTENT_STALE -> HttpStatus.CONFLICT
            NotificationApplicationError.MANUAL_NOTIFICATION_STATE_INVALID -> HttpStatus.CONFLICT
            NotificationApplicationError.MEMBERSHIP_NOT_ALLOWED -> HttpStatus.FORBIDDEN
            NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_REASON_REQUIRED -> HttpStatus.BAD_REQUEST
            NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_PREVIEW_EXPIRED -> HttpStatus.CONFLICT
            NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_PREVIEW_NOT_FOUND -> HttpStatus.NOT_FOUND
            NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_SELECTION_MISMATCH -> HttpStatus.CONFLICT
        }

    @Suppress("CyclomaticComplexMethod")
    private fun NotificationApplicationError.toPublicMessage(): String =
        when (this) {
            NotificationApplicationError.NOTIFICATION_NOT_FOUND -> "알림 정보를 찾을 수 없습니다."
            NotificationApplicationError.INVALID_TEST_MAIL_EMAIL -> "테스트 메일 주소가 올바르지 않습니다."
            NotificationApplicationError.TEST_MAIL_COOLDOWN -> "잠시 후 테스트 메일을 다시 시도해 주세요."
            NotificationApplicationError.MANUAL_NOTIFICATION_TEMPLATE_UNAVAILABLE ->
                "현재 상태에서는 이 알림을 보낼 수 없습니다."
            NotificationApplicationError.MANUAL_NOTIFICATION_AUDIENCE_EMPTY ->
                "선택한 채널로 알림을 받을 수 있는 대상이 없습니다."
            NotificationApplicationError.DUPLICATE_NOTIFICATION_DISPATCH ->
                "같은 내용의 알림이 이미 발송되었습니다. 재발송 여부를 확인해 주세요."
            NotificationApplicationError.MANUAL_NOTIFICATION_PREVIEW_NOT_FOUND ->
                "알림 미리보기를 찾을 수 없습니다. 다시 미리보기를 생성해 주세요."
            NotificationApplicationError.MANUAL_NOTIFICATION_PREVIEW_EXPIRED ->
                "알림 미리보기가 만료되었습니다. 다시 미리보기를 생성해 주세요."
            NotificationApplicationError.MANUAL_NOTIFICATION_PREVIEW_REUSED ->
                "이미 사용한 미리보기입니다. 다시 미리보기를 생성해 주세요."
            NotificationApplicationError.MANUAL_NOTIFICATION_SELECTION_INVALID ->
                "미리보기와 알림 선택 내용이 일치하지 않습니다."
            NotificationApplicationError.MANUAL_NOTIFICATION_RECIPIENT_INVALID ->
                "알림 수신자 선택을 확인해 주세요."
            NotificationApplicationError.MANUAL_NOTIFICATION_RECIPIENTS_CHANGED ->
                "미리보기 이후 수신 대상이 변경되었습니다. 다시 미리보기를 생성해 주세요."
            NotificationApplicationError.MANUAL_NOTIFICATION_CONTENT_STALE ->
                "알림 내용이 변경되었습니다. 최신 내용으로 다시 미리보기를 생성해 주세요."
            NotificationApplicationError.MANUAL_NOTIFICATION_STATE_INVALID ->
                "세션 상태가 변경되어 이 알림을 보낼 수 없습니다."
            NotificationApplicationError.MEMBERSHIP_NOT_ALLOWED -> "선택한 멤버를 알림 대상에 사용할 수 없습니다."
            NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_REASON_REQUIRED ->
                "재처리 사유를 입력해 주세요."
            NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_PREVIEW_EXPIRED ->
                "재처리 미리보기가 만료되었습니다."
            NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_PREVIEW_NOT_FOUND ->
                "재처리 미리보기를 찾을 수 없습니다."
            NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_SELECTION_MISMATCH ->
                "재처리 미리보기와 선택 내용이 일치하지 않습니다."
        }
}
