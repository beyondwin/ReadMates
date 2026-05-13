package com.readmates.notification.application.service

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.notification.application.NotificationApplicationError
import com.readmates.notification.application.NotificationApplicationException
import com.readmates.notification.application.model.ManualNotificationAudience
import com.readmates.notification.application.model.ManualNotificationConfirmCommand
import com.readmates.notification.application.model.ManualNotificationMemberOption
import com.readmates.notification.application.model.ManualNotificationPreviewCommand
import com.readmates.notification.application.model.ManualNotificationRecentDispatch
import com.readmates.notification.application.model.ManualNotificationRequestedChannels
import com.readmates.notification.application.model.ManualNotificationSelection
import com.readmates.notification.application.model.ManualNotificationSendMode
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.port.out.ManualNotificationDispatchPort
import com.readmates.notification.application.port.out.ManualNotificationPreviewRecord
import com.readmates.notification.application.port.out.ManualNotificationSessionContext
import com.readmates.notification.application.port.out.ManualNotificationStoredDispatch
import com.readmates.notification.application.port.out.ManualNotificationTargetSnapshot
import com.readmates.notification.domain.NotificationEventOutboxStatus
import com.readmates.notification.domain.NotificationEventType
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

class HostManualNotificationServiceTest {
    private val now = OffsetDateTime.of(2026, 5, 13, 9, 0, 0, 0, ZoneOffset.UTC)

    @Test
    fun `options disables feedback template until document exists`() {
        val port = FakeManualPort(
            sessionContext = sessionContext(feedbackDocumentUploaded = false),
        )
        val service = service(port)

        val options = service.options(host(), SESSION_ID, PageRequest.cursor(null, null, defaultLimit = 50, maxLimit = 100))

        val feedback = options.templates.single { it.eventType == NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED }
        assertThat(feedback.enabled).isFalse()
        assertThat(feedback.disabledReason).isEqualTo("피드백 문서를 먼저 등록해야 합니다.")
    }

    @Test
    fun `preview returns counts and duplicate warning`() {
        val port = FakeManualPort(recentDispatchCount = 1)
        val service = service(port)

        val preview = service.preview(host(), ManualNotificationPreviewCommand(selection()))

        assertThat(preview.audience.finalTargetCount).isEqualTo(3)
        assertThat(preview.channels.emailEligibleCount).isEqualTo(2)
        assertThat(preview.duplicates.requiresResendConfirmation).isTrue()
        assertThat(preview.warnings.map { it.code }).contains("EMAIL_PREFERENCE_SKIPS")
        assertThat(port.insertedPreviewHashes).hasSize(1)
    }

    @Test
    fun `confirm rejects duplicate without resend confirmation`() {
        val port = FakeManualPort(recentDispatchCount = 1)
        val service = service(port)
        val previewId = service.preview(host(), ManualNotificationPreviewCommand(selection())).previewId

        assertThatThrownBy {
            service.confirm(host(), ManualNotificationConfirmCommand(previewId, selection(), resendConfirmed = false))
        }
            .isInstanceOf(NotificationApplicationException::class.java)
            .extracting("error")
            .isEqualTo(NotificationApplicationError.DUPLICATE_NOTIFICATION_DISPATCH)
    }

    @Test
    fun `confirm writes manual dispatch when resend is confirmed`() {
        val port = FakeManualPort(recentDispatchCount = 1)
        val service = service(port)
        val previewId = service.preview(host(), ManualNotificationPreviewCommand(selection())).previewId

        val result = service.confirm(host(), ManualNotificationConfirmCommand(previewId, selection(), resendConfirmed = true))

        assertThat(result.status).isEqualTo(NotificationEventOutboxStatus.PENDING)
        assertThat(result.summary.targetCount).isEqualTo(3)
        assertThat(port.insertedDispatches).hasSize(1)
        assertThat(port.insertedDispatches.single().manualDispatch!!.requestedChannels)
            .isEqualTo(ManualNotificationRequestedChannels.BOTH)
    }

    private fun service(port: ManualNotificationDispatchPort) =
        HostManualNotificationService(port, clock = { now })

    private fun host() = CurrentMember(
        userId = UUID.nameUUIDFromBytes("user".toByteArray()),
        membershipId = HOST_MEMBERSHIP_ID,
        clubId = CLUB_ID,
        clubSlug = "reading-sai",
        email = "host@example.com",
        displayName = "Host",
        accountName = "Host",
        role = MembershipRole.HOST,
        membershipStatus = MembershipStatus.ACTIVE,
    )

    private fun selection() = ManualNotificationSelection(
        sessionId = SESSION_ID,
        eventType = NotificationEventType.SESSION_REMINDER_DUE,
        audience = ManualNotificationAudience.ALL_ACTIVE_MEMBERS,
        requestedChannels = ManualNotificationRequestedChannels.BOTH,
        excludedMembershipIds = emptyList(),
        includedMembershipIds = emptyList(),
        sendMode = ManualNotificationSendMode.NOW,
    )

    private fun sessionContext(feedbackDocumentUploaded: Boolean = true) = ManualNotificationSessionContext(
        sessionId = SESSION_ID,
        clubId = CLUB_ID,
        sessionNumber = 7,
        bookTitle = "Example Book",
        state = "OPEN",
        visibility = "MEMBER",
        feedbackDocumentUploaded = feedbackDocumentUploaded,
    )

    private class FakeManualPort(
        private val sessionContext: ManualNotificationSessionContext = ManualNotificationSessionContext(
            sessionId = SESSION_ID,
            clubId = CLUB_ID,
            sessionNumber = 7,
            bookTitle = "Example Book",
            state = "OPEN",
            visibility = "MEMBER",
            feedbackDocumentUploaded = true,
        ),
        private val recentDispatchCount: Int = 0,
    ) : ManualNotificationDispatchPort {
        val insertedPreviewHashes = mutableListOf<String>()
        val insertedDispatches = mutableListOf<NotificationEventPayload>()
        private val previews = mutableMapOf<UUID, ManualNotificationPreviewRecord>()

        override fun findSessionContext(clubId: UUID, sessionId: UUID) = sessionContext

        override fun listMembers(clubId: UUID, sessionId: UUID?, pageRequest: PageRequest) =
            CursorPage<ManualNotificationMemberOption>(emptyList(), null)

        override fun previewTargets(clubId: UUID, selection: ManualNotificationSelection) =
            ManualNotificationTargetSnapshot(
                baseCount = 4,
                excludedCount = 1,
                includedCount = 0,
                finalTargetCount = 3,
                inAppEligibleCount = 3,
                emailEligibleCount = 2,
                emailSkippedByPreferenceCount = 1,
                emailMissingCount = 0,
            )

        override fun recentDispatches(clubId: UUID, sessionId: UUID, eventType: NotificationEventType) =
            (1..recentDispatchCount).map {
                ManualNotificationRecentDispatch(
                    manualDispatchId = UUID.nameUUIDFromBytes("recent-$it".toByteArray()),
                    eventType = eventType,
                    requestedChannels = ManualNotificationRequestedChannels.BOTH,
                    createdAt = OffsetDateTime.of(2026, 5, 12, 9, 0, 0, 0, ZoneOffset.UTC),
                    requestedBy = "h***@example.com",
                    targetCount = 4,
                )
            }

        override fun insertPreview(
            clubId: UUID,
            hostMembershipId: UUID,
            selectionHash: String,
            expiresAt: OffsetDateTime,
        ): UUID {
            val id = UUID.nameUUIDFromBytes("preview-${insertedPreviewHashes.size}".toByteArray())
            insertedPreviewHashes += selectionHash
            previews[id] = ManualNotificationPreviewRecord(id, clubId, hostMembershipId, selectionHash, expiresAt)
            return id
        }

        override fun findPreview(id: UUID, clubId: UUID, hostMembershipId: UUID) = previews[id]

        override fun insertManualDispatch(
            clubId: UUID,
            hostMembershipId: UUID,
            selection: ManualNotificationSelection,
            payload: NotificationEventPayload,
            targetSnapshot: ManualNotificationTargetSnapshot,
            resend: Boolean,
        ): ManualNotificationStoredDispatch {
            insertedDispatches += payload
            return ManualNotificationStoredDispatch(
                manualDispatchId = payload.manualDispatch!!.id,
                eventId = UUID.nameUUIDFromBytes("event".toByteArray()),
                createdAt = OffsetDateTime.of(2026, 5, 13, 9, 1, 0, 0, ZoneOffset.UTC),
            )
        }
    }

    private companion object {
        val CLUB_ID: UUID = UUID.nameUUIDFromBytes("club".toByteArray())
        val SESSION_ID: UUID = UUID.nameUUIDFromBytes("session".toByteArray())
        val HOST_MEMBERSHIP_ID: UUID = UUID.nameUUIDFromBytes("host".toByteArray())
    }
}
