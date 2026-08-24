@file:Suppress("ktlint:standard:package-name")

package com.readmates.sessionrecord.adapter.`in`.web

import com.readmates.notification.application.model.HostActionNotificationError
import com.readmates.notification.application.model.HostActionNotificationException
import com.readmates.notification.application.model.NotificationSessionNotFoundException
import com.readmates.sessionrecord.application.model.SessionRecordError
import com.readmates.sessionrecord.application.model.SessionRecordException
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class SessionRecordErrorHandlerTest {
    private val handler = SessionRecordErrorHandler()

    @Test
    fun `maps record conflicts and invalid data to stable public codes`() {
        assertRecordError(SessionRecordError.DRAFT_STALE, 409, "SESSION_RECORD_DRAFT_STALE", "모임 기록 초안이 변경되었습니다.")
        assertRecordError(SessionRecordError.LIVE_STALE, 409, "SESSION_RECORD_LIVE_STALE", "현재 모임 기록이 변경되었습니다.")
        assertRecordError(SessionRecordError.INVALID_RECORD, 422, "SESSION_RECORD_INVALID", "모임 기록 내용을 확인해 주세요.")
        assertRecordError(
            SessionRecordError.SESSION_NOT_FOUND,
            404,
            "SESSION_RECORD_NOT_FOUND",
            "요청한 모임 기록을 찾을 수 없습니다.",
        )
        assertRecordError(
            SessionRecordError.REVISION_NOT_FOUND,
            404,
            "SESSION_RECORD_NOT_FOUND",
            "요청한 모임 기록을 찾을 수 없습니다.",
        )
        assertRecordError(
            SessionRecordError.PREVIEW_ALREADY_CONSUMED,
            409,
            "NOTIFICATION_PREVIEW_ALREADY_CONSUMED",
            "이미 사용된 알림 확인입니다.",
        )
        assertRecordError(
            SessionRecordError.APPLY_REQUEST_ALREADY_USED,
            409,
            "SESSION_RECORD_APPLY_REQUEST_ALREADY_USED",
            "이미 사용된 모임 기록 반영 요청입니다.",
        )
        assertRecordError(
            SessionRecordError.INVALID_APPLY_CONTRACT,
            400,
            "SESSION_RECORD_INVALID_APPLY_CONTRACT",
            "모임 기록 반영 요청을 확인해 주세요.",
        )
        assertRecordError(
            SessionRecordError.INVALID_REBASE_CONTRACT,
            400,
            "SESSION_RECORD_INVALID_REBASE_CONTRACT",
            "모임 기록 초안 기준 요청을 확인해 주세요.",
        )
    }

    @Test
    fun `maps notification fail closed errors to stable public codes`() {
        assertNotificationError(
            HostActionNotificationError.CONFIRMATION_REQUIRED,
            "NOTIFICATION_CONFIRMATION_REQUIRED",
        )
        assertNotificationError(HostActionNotificationError.PREVIEW_EXPIRED, "NOTIFICATION_PREVIEW_EXPIRED")
        assertNotificationError(HostActionNotificationError.TARGETS_CHANGED, "NOTIFICATION_TARGETS_CHANGED")
        assertNotificationError(
            HostActionNotificationError.PREVIEW_ALREADY_CONSUMED,
            "NOTIFICATION_PREVIEW_ALREADY_CONSUMED",
        )
        assertNotificationError(HostActionNotificationError.DUPLICATE_EVENT, "NOTIFICATION_DUPLICATE_EVENT")
        val missingSession =
            handler.handleNotification(
                HostActionNotificationException(HostActionNotificationError.SESSION_NOT_FOUND),
            )
        assertThat(missingSession.statusCode.value()).isEqualTo(404)
        assertThat(missingSession.body?.code).isEqualTo("SESSION_RECORD_NOT_FOUND")
        assertThat(missingSession.body?.message).isEqualTo("요청한 모임 기록을 찾을 수 없습니다.")
        val missingParent = handler.handleNotificationSessionNotFound()
        assertThat(missingParent.statusCode.value()).isEqualTo(404)
        assertThat(missingParent.body?.code).isEqualTo("SESSION_RECORD_NOT_FOUND")
        assertThat(missingParent.body?.message).isEqualTo("요청한 모임 기록을 찾을 수 없습니다.")
        assertThat(NotificationSessionNotFoundException().message).isEqualTo("Notification session is missing")
    }

    @Test
    fun `maps invalid history cursor to the stable public contract`() {
        val response = handler.handleInvalidHistoryCursor()

        assertThat(response.statusCode.value()).isEqualTo(400)
        assertThat(response.body?.code).isEqualTo("INVALID_CURSOR")
        assertThat(response.body?.message).isEqualTo("커서가 현재 검색 조건과 일치하지 않습니다.")
    }

    private fun assertRecordError(
        error: SessionRecordError,
        status: Int,
        code: String,
        message: String,
    ) {
        val response = handler.handleSessionRecord(SessionRecordException(error, "private detail"))
        assertThat(response.statusCode.value()).isEqualTo(status)
        assertThat(response.body?.code).isEqualTo(code)
        assertThat(response.body?.message).isEqualTo(message)
        assertThat(response.body?.message).doesNotContain("private detail")
    }

    private fun assertNotificationError(
        error: HostActionNotificationError,
        code: String,
    ) {
        val response = handler.handleNotification(HostActionNotificationException(error))
        assertThat(response.statusCode.value()).isEqualTo(409)
        assertThat(response.body?.code).isEqualTo(code)
    }
}
