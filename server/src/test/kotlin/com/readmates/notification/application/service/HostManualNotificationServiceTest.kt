package com.readmates.notification.application.service

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.notification.application.NotificationApplicationError
import com.readmates.notification.application.NotificationApplicationException
import com.readmates.notification.application.model.ManualNotificationAudience
import com.readmates.notification.application.model.ManualNotificationConfirmCommand
import com.readmates.notification.application.model.ManualNotificationConfirmSummary
import com.readmates.notification.application.model.ManualNotificationContentRevision
import com.readmates.notification.application.model.ManualNotificationDispatchList
import com.readmates.notification.application.model.ManualNotificationMemberOption
import com.readmates.notification.application.model.ManualNotificationPreviewCommand
import com.readmates.notification.application.model.ManualNotificationRecentDispatch
import com.readmates.notification.application.model.ManualNotificationRequestedChannels
import com.readmates.notification.application.model.ManualNotificationSelection
import com.readmates.notification.application.model.ManualNotificationSendMode
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.port.out.ManualNotificationConfirmInsertStatus
import com.readmates.notification.application.port.out.ManualNotificationConfirmedDispatch
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
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

class HostManualNotificationServiceTest {
    private val now = OffsetDateTime.of(2026, 5, 13, 9, 0, 0, 0, ZoneOffset.UTC)

    @Test
    fun `options expose event defaults allowed selected audience and current revisions`() {
        val feedbackRevision = "b".repeat(64)
        val service =
            service(
                FakeManualPort(
                    sessionContext =
                        sessionContext(
                            state = "CLOSED",
                            feedbackDocumentVersion = 3,
                            sessionRecordContentRevision = feedbackRevision,
                        ),
                ),
            )

        val options =
            service.options(
                host(),
                SESSION_ID,
                null,
                PageRequest.cursor(null, null, defaultLimit = 50, maxLimit = 100),
            )

        val feedback = options.templates.single { it.eventType == NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED }
        val sessionRecord = options.templates.single { it.eventType == NotificationEventType.SESSION_RECORD_UPDATED }
        assertThat(feedback.contentRevision).isEqualTo(feedbackRevision)
        assertThat(feedback.defaultAudience).isEqualTo(ManualNotificationAudience.CONFIRMED_ATTENDEES)
        assertThat(feedback.defaultChannels).isEqualTo(ManualNotificationRequestedChannels.BOTH)
        assertThat(sessionRecord.contentRevision).isEqualTo(feedbackRevision)
        assertThat(sessionRecord.defaultAudience).isEqualTo(ManualNotificationAudience.CONFIRMED_ATTENDEES)
        assertThat(sessionRecord.allowedAudiences).contains(ManualNotificationAudience.SELECTED_MEMBERS)
    }

    @Test
    fun `legacy feedback options derive revision from document version`() {
        val service =
            service(
                FakeManualPort(
                    sessionContext =
                        sessionContext(
                            state = "CLOSED",
                            feedbackDocumentVersion = 3,
                            sessionRecordContentRevision = null,
                        ),
                ),
            )

        val feedback =
            service
                .options(
                    host(),
                    SESSION_ID,
                    null,
                    PageRequest.cursor(null, null, defaultLimit = 50, maxLimit = 100),
                ).templates
                .single { it.eventType == NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED }

        assertThat(feedback.contentRevision)
            .isEqualTo(ManualNotificationContentRevision.feedbackDocument(SESSION_ID, 3))
    }

    @Test
    fun `selected members require unique active same club memberships without legacy edits`() {
        val selected = UUID.nameUUIDFromBytes("selected".toByteArray())
        val service = service(FakeManualPort())
        val invalidSelections =
            listOf(
                selection(
                    audience = ManualNotificationAudience.SELECTED_MEMBERS,
                    selectedMembershipIds = emptyList(),
                ),
                selection(
                    audience = ManualNotificationAudience.SELECTED_MEMBERS,
                    selectedMembershipIds = listOf(selected, selected),
                ),
                selection(
                    audience = ManualNotificationAudience.SELECTED_MEMBERS,
                    selectedMembershipIds = listOf(selected),
                    includedMembershipIds = listOf(selected),
                ),
                selection(selectedMembershipIds = listOf(selected)),
            )

        invalidSelections.forEach { invalid ->
            assertThatThrownBy {
                service.preview(host(), ManualNotificationPreviewCommand(invalid))
            }.isInstanceOf(NotificationApplicationException::class.java)
                .extracting("error")
                .isEqualTo(NotificationApplicationError.MEMBERSHIP_NOT_ALLOWED)
        }

        val foreignOrInactive =
            service(FakeManualPort(membershipEditsAllowed = false))
        assertThatThrownBy {
            foreignOrInactive.preview(
                host(),
                ManualNotificationPreviewCommand(
                    selection(
                        audience = ManualNotificationAudience.SELECTED_MEMBERS,
                        selectedMembershipIds = listOf(selected),
                    ),
                ),
            )
        }.isInstanceOf(NotificationApplicationException::class.java)
            .extracting("error")
            .isEqualTo(NotificationApplicationError.MEMBERSHIP_NOT_ALLOWED)
    }

    @Test
    fun `stale content revision fails preview and confirm without outbox`() {
        val port = FakeManualPort()
        val service = service(port)
        val staleSelection = selection(contentRevision = "f".repeat(64))

        assertThatThrownBy {
            service.preview(host(), ManualNotificationPreviewCommand(staleSelection))
        }.isInstanceOf(NotificationApplicationException::class.java)
            .extracting("error")
            .isEqualTo(NotificationApplicationError.MANUAL_NOTIFICATION_TEMPLATE_UNAVAILABLE)
        assertThatThrownBy {
            service.confirm(
                host(),
                ManualNotificationConfirmCommand(UUID.randomUUID(), staleSelection, resendConfirmed = false),
            )
        }.isInstanceOf(NotificationApplicationException::class.java)
            .extracting("error")
            .isEqualTo(NotificationApplicationError.MANUAL_NOTIFICATION_TEMPLATE_UNAVAILABLE)
        assertThat(port.insertedDispatches).isEmpty()
    }

    @Test
    fun `options disables feedback template until document exists`() {
        val port =
            FakeManualPort(
                sessionContext = sessionContext(state = "CLOSED", feedbackDocumentUploaded = false),
            )
        val service = service(port)

        val options = service.options(host(), SESSION_ID, null, PageRequest.cursor(null, null, defaultLimit = 50, maxLimit = 100))

        val feedback = options.templates.single { it.eventType == NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED }
        assertThat(feedback.enabled).isFalse()
        assertThat(feedback.disabledReason).isEqualTo("닫힌 세션의 피드백 문서가 등록된 뒤 발송할 수 있습니다.")
    }

    @Test
    fun `options disables next book manual notification unless session is draft and member visible`() {
        val port = FakeManualPort(sessionContext = sessionContext(state = "OPEN", visibility = "MEMBER"))
        val service = service(port)

        val options = service.options(host(), SESSION_ID, null, PageRequest.cursor(null, null, defaultLimit = 50, maxLimit = 100))

        val nextBook = options.templates.single { it.eventType == NotificationEventType.NEXT_BOOK_PUBLISHED }
        assertThat(nextBook.enabled).isFalse()
        assertThat(nextBook.disabledReason).isEqualTo("멤버에게 공개된 예정 세션만 다음 책 알림을 보낼 수 있습니다.")
    }

    @Test
    fun `options enables feedback document manual notification only for closed or published sessions with a document`() {
        val port = FakeManualPort(sessionContext = sessionContext(state = "OPEN", feedbackDocumentUploaded = true))
        val service = service(port)

        val options = service.options(host(), SESSION_ID, null, PageRequest.cursor(null, null, defaultLimit = 50, maxLimit = 100))

        val feedback = options.templates.single { it.eventType == NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED }
        assertThat(feedback.enabled).isFalse()
        assertThat(feedback.disabledReason).isEqualTo("닫힌 세션의 피드백 문서가 등록된 뒤 발송할 수 있습니다.")
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
    fun `email only preview and confirm reject audience without eligible email recipient`() {
        val port =
            FakeManualPort(
                targetSnapshot =
                    targetSnapshot(
                        finalTargetCount = 1,
                        inAppEligibleCount = 0,
                        emailEligibleCount = 0,
                    ),
            )
        val service = service(port)
        val emailSelection = selection().copy(requestedChannels = ManualNotificationRequestedChannels.EMAIL)

        assertThatThrownBy {
            service.preview(host(), ManualNotificationPreviewCommand(emailSelection))
        }.isInstanceOf(NotificationApplicationException::class.java)
            .extracting("error")
            .isEqualTo(NotificationApplicationError.MANUAL_NOTIFICATION_AUDIENCE_EMPTY)
        assertThatThrownBy {
            service.confirm(
                host(),
                ManualNotificationConfirmCommand(UUID.randomUUID(), emailSelection, resendConfirmed = false),
            )
        }.isInstanceOf(NotificationApplicationException::class.java)
            .extracting("error")
            .isEqualTo(NotificationApplicationError.MANUAL_NOTIFICATION_AUDIENCE_EMPTY)
        assertThat(port.insertedDispatches).isEmpty()
    }

    @Test
    fun `both channels allow audience with only in app eligible recipient`() {
        val service =
            service(
                FakeManualPort(
                    targetSnapshot =
                        targetSnapshot(
                            finalTargetCount = 1,
                            inAppEligibleCount = 1,
                            emailEligibleCount = 0,
                        ),
                ),
            )

        val preview = service.preview(host(), ManualNotificationPreviewCommand(selection()))

        assertThat(preview.audience.finalTargetCount).isEqualTo(1)
        assertThat(preview.channels.inAppEligibleCount).isEqualTo(1)
        assertThat(preview.channels.emailEligibleCount).isZero()
    }

    @Test
    fun `confirm rejects duplicate without resend confirmation`() {
        val port = FakeManualPort(recentDispatchCount = 1)
        val service = service(port)
        val previewId = service.preview(host(), ManualNotificationPreviewCommand(selection())).previewId

        assertThatThrownBy {
            service.confirm(host(), ManualNotificationConfirmCommand(previewId, selection(), resendConfirmed = false))
        }.isInstanceOf(NotificationApplicationException::class.java)
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
        assertThat(
            port.insertedDispatches
                .single()
                .manualDispatch!!
                .requestedChannels,
        ).isEqualTo(ManualNotificationRequestedChannels.BOTH)
    }

    @Test
    fun `confirm includes frozen recipients in manual payload`() {
        val port = FakeManualPort()
        val service = service(port)
        val previewId = service.preview(host(), ManualNotificationPreviewCommand(selection())).previewId

        service.confirm(host(), ManualNotificationConfirmCommand(previewId, selection(), resendConfirmed = false))

        val manual = port.insertedDispatches.single().manualDispatch!!
        assertThat(manual.targetMembershipIds).isNotEmpty
        assertThat(manual.inAppMembershipIds).isNotEmpty
        assertThat(manual.emailMembershipIds).isNotEmpty
    }

    @Test
    fun `confirm retry for the same consumed preview returns existing dispatch before duplicate check`() {
        val port = FakeManualPort()
        val service = service(port)
        val previewId = service.preview(host(), ManualNotificationPreviewCommand(selection())).previewId

        val first = service.confirm(host(), ManualNotificationConfirmCommand(previewId, selection(), resendConfirmed = false))
        val second = service.confirm(host(), ManualNotificationConfirmCommand(previewId, selection(), resendConfirmed = false))

        assertThat(second.eventId).isEqualTo(first.eventId)
        assertThat(port.insertedDispatches).hasSize(1)
    }

    @Test
    fun `consumed confirm retry returns original dispatch after content revision changes`() {
        val port = FakeManualPort()
        val service = service(port)
        val currentSelection = selection()
        val previewId = service.preview(host(), ManualNotificationPreviewCommand(currentSelection)).previewId
        val first =
            service.confirm(
                host(),
                ManualNotificationConfirmCommand(previewId, currentSelection, resendConfirmed = false),
            )
        port.sessionContext = port.sessionContext.copy(date = port.sessionContext.date!!.plusDays(1))

        val replay =
            service.confirm(
                host(),
                ManualNotificationConfirmCommand(previewId, currentSelection, resendConfirmed = false),
            )

        assertThat(replay).isEqualTo(first)
        assertThat(port.insertedDispatches).hasSize(1)
    }

    @Test
    fun `consumed confirm retry returns original summary after member and channel eligibility changes`() {
        val selected = UUID.nameUUIDFromBytes("selected-replay".toByteArray())
        val currentSelection =
            selection(
                selectedMembershipIds = listOf(selected),
                audience = ManualNotificationAudience.SELECTED_MEMBERS,
            )
        val port =
            FakeManualPort(
                targetSnapshot =
                    targetSnapshot(
                        finalTargetCount = 1,
                        inAppEligibleCount = 1,
                        emailEligibleCount = 1,
                    ),
            )
        val service = service(port)
        val previewId = service.preview(host(), ManualNotificationPreviewCommand(currentSelection)).previewId
        val first =
            service.confirm(
                host(),
                ManualNotificationConfirmCommand(previewId, currentSelection, resendConfirmed = false),
            )
        port.membershipEditsAllowed = false
        port.targetSnapshot = targetSnapshot(finalTargetCount = 0, inAppEligibleCount = 0, emailEligibleCount = 0)

        val replay =
            service.confirm(
                host(),
                ManualNotificationConfirmCommand(previewId, currentSelection, resendConfirmed = false),
            )

        assertThat(replay).isEqualTo(first)
        assertThat(replay.summary.targetCount).isEqualTo(1)
        assertThat(replay.summary.expectedEmailCount).isEqualTo(1)
        assertThat(port.insertedDispatches).hasSize(1)
    }

    @Test
    fun `consumed confirm retry survives preview ttl without recomputing target summary`() {
        var currentTime = now
        val port = FakeManualPort()
        val service = HostManualNotificationService(port, clock = { currentTime })
        val currentSelection = selection()
        val previewId = service.preview(host(), ManualNotificationPreviewCommand(currentSelection)).previewId
        val first =
            service.confirm(
                host(),
                ManualNotificationConfirmCommand(previewId, currentSelection, resendConfirmed = false),
            )
        currentTime = currentTime.plusMinutes(11)
        port.targetSnapshot = targetSnapshot(finalTargetCount = 0, inAppEligibleCount = 0, emailEligibleCount = 0)

        val replay =
            service.confirm(
                host(),
                ManualNotificationConfirmCommand(previewId, currentSelection, resendConfirmed = false),
            )

        assertThat(replay).isEqualTo(first)
        assertThat(port.insertedDispatches).hasSize(1)
    }

    @Test
    fun `preview rejects membership edits outside current club`() {
        val invalidId = UUID.nameUUIDFromBytes("invalid".toByteArray())
        val port = FakeManualPort(membershipEditsAllowed = false)
        val service = service(port)

        assertThatThrownBy {
            service.preview(
                host(),
                ManualNotificationPreviewCommand(selection(includedMembershipIds = listOf(invalidId))),
            )
        }.isInstanceOf(NotificationApplicationException::class.java)
            .extracting("error")
            .isEqualTo(NotificationApplicationError.MEMBERSHIP_NOT_ALLOWED)
    }

    private fun service(port: ManualNotificationDispatchPort) = HostManualNotificationService(port, clock = { now })

    private fun host() =
        CurrentMember(
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

    private fun selection(
        contentRevision: String =
            ManualNotificationContentRevision.reminder(
                SESSION_ID,
                LocalDate.parse("2026-05-20"),
            ),
        selectedMembershipIds: List<UUID> = emptyList(),
        includedMembershipIds: List<UUID> = emptyList(),
        excludedMembershipIds: List<UUID> = emptyList(),
        eventType: NotificationEventType = NotificationEventType.SESSION_REMINDER_DUE,
        audience: ManualNotificationAudience = ManualNotificationAudience.ALL_ACTIVE_MEMBERS,
    ) = ManualNotificationSelection(
        sessionId = SESSION_ID,
        eventType = eventType,
        contentRevision = contentRevision,
        audience = audience,
        requestedChannels = ManualNotificationRequestedChannels.BOTH,
        selectedMembershipIds = selectedMembershipIds,
        excludedMembershipIds = excludedMembershipIds,
        includedMembershipIds = includedMembershipIds,
        sendMode = ManualNotificationSendMode.NOW,
    )

    private fun sessionContext(
        state: String = "OPEN",
        visibility: String = "MEMBER",
        feedbackDocumentUploaded: Boolean = true,
        feedbackDocumentVersion: Int? = if (feedbackDocumentUploaded) 1 else null,
        sessionRecordContentRevision: String? = "c".repeat(64),
    ) = ManualNotificationSessionContext(
        sessionId = SESSION_ID,
        clubId = CLUB_ID,
        sessionNumber = 7,
        bookTitle = "Example Book",
        date = LocalDate.parse("2026-05-20"),
        state = state,
        visibility = visibility,
        feedbackDocumentUploaded = feedbackDocumentUploaded,
        feedbackDocumentVersion = feedbackDocumentVersion,
        sessionRecordContentRevision = sessionRecordContentRevision,
    )

    private fun targetSnapshot(
        finalTargetCount: Int = 3,
        inAppEligibleCount: Int = 3,
        emailEligibleCount: Int = 2,
    ) = ManualNotificationTargetSnapshot(
        baseCount = finalTargetCount,
        excludedCount = 0,
        includedCount = 0,
        finalTargetCount = finalTargetCount,
        inAppEligibleCount = inAppEligibleCount,
        emailEligibleCount = emailEligibleCount,
        emailSkippedByPreferenceCount = if (emailEligibleCount == 0) finalTargetCount else 0,
        emailMissingCount = 0,
        targetMembershipIds =
            (1..finalTargetCount).map { UUID.nameUUIDFromBytes("target-$it".toByteArray()) },
        inAppMembershipIds =
            (1..inAppEligibleCount).map { UUID.nameUUIDFromBytes("target-$it".toByteArray()) },
        emailMembershipIds =
            (1..emailEligibleCount).map { UUID.nameUUIDFromBytes("target-$it".toByteArray()) },
    )

    private class FakeManualPort(
        var sessionContext: ManualNotificationSessionContext =
            ManualNotificationSessionContext(
                sessionId = SESSION_ID,
                clubId = CLUB_ID,
                sessionNumber = 7,
                bookTitle = "Example Book",
                date = LocalDate.parse("2026-05-20"),
                state = "OPEN",
                visibility = "MEMBER",
                feedbackDocumentUploaded = true,
                feedbackDocumentVersion = 1,
                sessionRecordContentRevision = "c".repeat(64),
            ),
        private val recentDispatchCount: Int = 0,
        var membershipEditsAllowed: Boolean = true,
        var targetSnapshot: ManualNotificationTargetSnapshot =
            ManualNotificationTargetSnapshot(
                baseCount = 4,
                excludedCount = 1,
                includedCount = 0,
                finalTargetCount = 3,
                inAppEligibleCount = 3,
                emailEligibleCount = 2,
                emailSkippedByPreferenceCount = 1,
                emailMissingCount = 0,
                targetMembershipIds =
                    listOf(
                        UUID.nameUUIDFromBytes("target-1".toByteArray()),
                        UUID.nameUUIDFromBytes("target-2".toByteArray()),
                        UUID.nameUUIDFromBytes("target-3".toByteArray()),
                    ),
                inAppMembershipIds =
                    listOf(
                        UUID.nameUUIDFromBytes("target-1".toByteArray()),
                        UUID.nameUUIDFromBytes("target-2".toByteArray()),
                        UUID.nameUUIDFromBytes("target-3".toByteArray()),
                    ),
                emailMembershipIds =
                    listOf(
                        UUID.nameUUIDFromBytes("target-1".toByteArray()),
                        UUID.nameUUIDFromBytes("target-2".toByteArray()),
                    ),
            ),
    ) : ManualNotificationDispatchPort {
        val insertedPreviewHashes = mutableListOf<String>()
        val insertedDispatches = mutableListOf<NotificationEventPayload>()
        private val previews = mutableMapOf<UUID, ManualNotificationPreviewRecord>()
        private val confirmedByPreview = mutableMapOf<UUID, ManualNotificationConfirmedDispatch>()

        override fun findSessionContext(
            clubId: UUID,
            sessionId: UUID,
        ) = sessionContext

        override fun listMembers(
            clubId: UUID,
            sessionId: UUID?,
            search: String?,
            pageRequest: PageRequest,
        ) = CursorPage<ManualNotificationMemberOption>(emptyList(), null)

        override fun listDispatches(
            clubId: UUID,
            sessionId: UUID?,
            eventType: NotificationEventType?,
            pageRequest: PageRequest,
        ) = ManualNotificationDispatchList(emptyList(), null)

        override fun validateMembershipEdits(
            clubId: UUID,
            membershipIds: Set<UUID>,
        ) = membershipEditsAllowed

        override fun previewTargets(
            clubId: UUID,
            selection: ManualNotificationSelection,
        ) = targetSnapshot

        override fun recentDispatches(
            clubId: UUID,
            sessionId: UUID,
            eventType: NotificationEventType,
            contentRevision: String,
        ) = (1..(recentDispatchCount + insertedDispatches.size)).map {
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

        override fun findPreview(
            id: UUID,
            clubId: UUID,
            hostMembershipId: UUID,
        ) = previews[id]

        override fun findConsumedManualDispatch(
            previewId: UUID,
            clubId: UUID,
            hostMembershipId: UUID,
            selectionHash: String,
            now: OffsetDateTime,
        ): ManualNotificationConfirmedDispatch? {
            val preview = previews[previewId] ?: return null
            if (preview.selectionHash != selectionHash) return null
            confirmedByPreview[previewId]?.let {
                return it.copy(status = ManualNotificationConfirmInsertStatus.ALREADY_CONSUMED)
            }
            if (preview.expiresAt.isBefore(now)) return null
            return null
        }

        override fun confirmManualDispatch(
            previewId: UUID,
            clubId: UUID,
            hostMembershipId: UUID,
            selectionHash: String,
            now: OffsetDateTime,
            selection: ManualNotificationSelection,
            payload: NotificationEventPayload,
            targetSnapshot: ManualNotificationTargetSnapshot,
            resend: Boolean,
        ): ManualNotificationConfirmedDispatch? {
            previews[previewId] ?: return null
            return confirmedByPreview.getOrPut(previewId) {
                insertedDispatches += payload
                ManualNotificationConfirmedDispatch(
                    manualDispatchId = payload.manualDispatch!!.id,
                    eventId = UUID.nameUUIDFromBytes("event".toByteArray()),
                    createdAt = OffsetDateTime.of(2026, 5, 13, 9, 1, 0, 0, ZoneOffset.UTC),
                    status = ManualNotificationConfirmInsertStatus.CREATED,
                    summary =
                        ManualNotificationConfirmSummary(
                            targetCount = targetSnapshot.finalTargetCount,
                            requestedChannels = selection.requestedChannels,
                            expectedInAppCount = targetSnapshot.inAppEligibleCount,
                            expectedEmailCount = targetSnapshot.emailEligibleCount,
                        ),
                )
            }
        }

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
