@file:Suppress("ktlint:standard:package-name")

package com.readmates.sessionrecord.adapter.`in`.web

import com.readmates.notification.application.model.HostActionNotificationError
import com.readmates.notification.application.model.HostActionNotificationException
import com.readmates.sessionrecord.application.model.SessionRecordError
import com.readmates.sessionrecord.application.model.SessionRecordException
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class SessionRecordErrorHandlerTest {
    private val handler = SessionRecordErrorHandler()

    @Test
    fun `maps record conflicts and invalid data to stable public codes`() {
        assertRecordError(SessionRecordError.DRAFT_STALE, 409, "SESSION_RECORD_DRAFT_STALE")
        assertRecordError(SessionRecordError.LIVE_STALE, 409, "SESSION_RECORD_LIVE_STALE")
        assertRecordError(SessionRecordError.INVALID_RECORD, 422, "SESSION_RECORD_INVALID")
        assertRecordError(SessionRecordError.SESSION_NOT_FOUND, 404, "SESSION_RECORD_NOT_FOUND")
        assertRecordError(SessionRecordError.REVISION_NOT_FOUND, 404, "SESSION_RECORD_NOT_FOUND")
        assertRecordError(
            SessionRecordError.PREVIEW_ALREADY_CONSUMED,
            409,
            "NOTIFICATION_PREVIEW_ALREADY_CONSUMED",
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
    }

    private fun assertRecordError(
        error: SessionRecordError,
        status: Int,
        code: String,
    ) {
        val response = handler.handleSessionRecord(SessionRecordException(error, "private detail"))
        assertThat(response.statusCode.value()).isEqualTo(status)
        assertThat(response.body?.code).isEqualTo(code)
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
