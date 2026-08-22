package com.readmates.copy

import com.readmates.archive.adapter.`in`.web.ArchiveErrorHandler
import com.readmates.archive.application.ArchiveApplicationError
import com.readmates.archive.application.ArchiveApplicationException
import com.readmates.auth.domain.MembershipRole
import com.readmates.notification.adapter.`in`.web.NotificationErrorHandler
import com.readmates.notification.application.NotificationApplicationError
import com.readmates.notification.application.NotificationApplicationException
import com.readmates.notification.application.model.ManualNotificationDispatchList
import com.readmates.notification.application.model.ManualNotificationMemberOption
import com.readmates.notification.application.model.ManualNotificationRecentDispatch
import com.readmates.notification.application.model.ManualNotificationSelection
import com.readmates.notification.application.model.NotificationEmailTemplates
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.port.out.ManualNotificationConfirmAttempt
import com.readmates.notification.application.port.out.ManualNotificationConfirmTransactionInput
import com.readmates.notification.application.port.out.ManualNotificationDispatchPort
import com.readmates.notification.application.port.out.ManualNotificationPreviewRecord
import com.readmates.notification.application.port.out.ManualNotificationSessionContext
import com.readmates.notification.application.port.out.ManualNotificationStoredDispatch
import com.readmates.notification.application.port.out.ManualNotificationTargetSnapshot
import com.readmates.notification.application.port.out.manualDispatchDisabledReason
import com.readmates.notification.application.service.HostManualNotificationService
import com.readmates.notification.domain.NotificationEventType
import com.readmates.session.adapter.`in`.web.SessionApplicationErrorHandler
import com.readmates.session.application.HostSessionCloseNotAllowedException
import com.readmates.session.application.HostSessionDeletionNotAllowedException
import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.HostSessionOpenNotAllowedException
import com.readmates.session.application.HostSessionPublishNotAllowedException
import com.readmates.session.application.HostSessionRecordStagingRequiredException
import com.readmates.session.application.HostSessionReopenNotAllowedException
import com.readmates.session.application.HostSessionReturnToDraftNotAllowedException
import com.readmates.session.application.HostSessionUnpublishNotAllowedException
import com.readmates.session.application.InvalidSessionExposureException
import com.readmates.session.application.InvalidSessionScheduleException
import com.readmates.session.application.model.HostSessionDeletionBlockedException
import com.readmates.session.application.model.HostSessionDeletionBlocker
import com.readmates.session.application.model.HostSessionDeletionBlockerCode
import com.readmates.sessionimport.adapter.`in`.web.SessionImportErrorHandler
import com.readmates.sessionimport.application.InvalidSessionImportException
import com.readmates.sessionimport.application.model.SessionImportCommand
import com.readmates.sessionimport.application.model.SessionImportFeedbackDocumentCommand
import com.readmates.sessionimport.application.model.SessionImportPublicationCommand
import com.readmates.sessionimport.application.model.SessionImportRecordCommand
import com.readmates.sessionimport.application.model.SessionImportSessionCommand
import com.readmates.sessionimport.application.model.SessionImportTarget
import com.readmates.sessionimport.application.port.out.SessionImportRecordReplacement
import com.readmates.sessionimport.application.port.out.SessionImportStoredFeedbackDocument
import com.readmates.sessionimport.application.port.out.SessionImportWritePort
import com.readmates.sessionimport.application.service.SessionImportService
import com.readmates.sessionrecord.adapter.`in`.web.SessionRecordErrorHandler
import com.readmates.sessionrecord.application.model.SessionRecordError
import com.readmates.sessionrecord.application.model.SessionRecordException
import com.readmates.sessionrecord.application.model.SessionRecordVisibility
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.AuthenticatedClubActor
import com.readmates.shared.security.CurrentMember
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID
import kotlin.io.path.relativeTo

class CanonicalMeetingLanguageInventoryTest {
    @Test
    fun `session error copy uses meeting language and keeps codes stable`() {
        val handler = SessionApplicationErrorHandler()
        val blocked =
            handler.handleDeletionBlocked(
                HostSessionDeletionBlockedException(
                    listOf(HostSessionDeletionBlocker(HostSessionDeletionBlockerCode.RECORD_REVISION_EXISTS, 1)),
                ),
            )
        assertThat(blocked.body?.code).isEqualTo("SESSION_DELETE_BLOCKED")
        assertThat(blocked.body?.message).isEqualTo("적용 기록 또는 알림 이력이 있는 모임은 삭제할 수 없습니다.")

        assertThat(handler.handleDeletionNotAllowed().body?.message)
            .isEqualTo("작성 중이거나 멤버와 준비 중인 모임만 삭제할 수 있습니다.")
        assertThat(handler.handleStagingRequired().body?.code).isEqualTo("SESSION_RECORD_STAGING_REQUIRED")
        assertThat(handler.handleStagingRequired().body?.message)
            .isEqualTo("모임 기록은 기록 초안에서 수정한 뒤 기록에 반영해 주세요.")
        assertThat(handler.handleInvalidExposure().body?.code).isEqualTo("SESSION_EXPOSURE_INVALID")
        assertThat(handler.handleInvalidExposure().body?.message)
            .isEqualTo("모임 보기 범위가 현재 모임 상태와 맞지 않습니다.")
        assertThat(handler.handleReopenNotAllowed().body?.message)
            .isEqualTo("기록 정리 중인 모임만 다시 열 수 있습니다.")
        assertThat(handler.handleUnpublishNotAllowed().body?.message)
            .isEqualTo("게스트·멤버 노트에 게시된 모임만 게시를 취소할 수 있습니다.")
        assertThat(handler.handleReturnToDraftNotAllowed().body?.message)
            .isEqualTo("멤버와 준비 중인 모임만 작성 중으로 되돌릴 수 있습니다.")
        assertThat(handler.handleConflict().body?.message)
            .isEqualTo("요청한 작업이 현재 모임 상태와 충돌합니다.")
        assertThat(handler.handleNotFound().body?.code).isEqualTo("SESSION_NOT_FOUND")
        assertThat(handler.handleNotFound().body?.message).isEqualTo("요청한 모임을 찾을 수 없습니다.")
        assertThat(handler.handleBadRequest().body?.code).isEqualTo("INVALID_REQUEST")
        assertThat(handler.handleBadRequest().body?.message).isEqualTo("모임 요청 값을 확인해 주세요.")
        assertThat(handler.handleInvalidListQuery().body?.message).isEqualTo("모임 요청 값을 확인해 주세요.")
        assertThat(handler.handleInvalidIdempotency().body?.message).isEqualTo("모임 요청 값을 확인해 주세요.")
    }

    @Test
    fun `record error copy uses meeting record language and keeps codes stable`() {
        val handler = SessionRecordErrorHandler()
        assertRecord(handler, SessionRecordError.DRAFT_STALE, 409, "SESSION_RECORD_DRAFT_STALE", "모임 기록 초안이 변경되었습니다.")
        assertRecord(handler, SessionRecordError.LIVE_STALE, 409, "SESSION_RECORD_LIVE_STALE", "현재 모임 기록이 변경되었습니다.")
        assertRecord(
            handler,
            SessionRecordError.APPLY_REQUEST_ALREADY_USED,
            409,
            "SESSION_RECORD_APPLY_REQUEST_ALREADY_USED",
            "이미 사용된 모임 기록 반영 요청입니다.",
        )
        assertRecord(
            handler,
            SessionRecordError.INVALID_APPLY_CONTRACT,
            400,
            "SESSION_RECORD_INVALID_APPLY_CONTRACT",
            "모임 기록 반영 요청을 확인해 주세요.",
        )
        assertRecord(handler, SessionRecordError.INVALID_RECORD, 422, "SESSION_RECORD_INVALID", "모임 기록 내용을 확인해 주세요.")
        assertRecord(
            handler,
            SessionRecordError.SESSION_NOT_FOUND,
            404,
            "SESSION_RECORD_NOT_FOUND",
            "요청한 모임 기록을 찾을 수 없습니다.",
        )
        assertRecord(
            handler,
            SessionRecordError.REVISION_NOT_FOUND,
            404,
            "SESSION_RECORD_NOT_FOUND",
            "요청한 모임 기록을 찾을 수 없습니다.",
        )
        assertThat(handler.handleNotificationSessionNotFound().body?.code).isEqualTo("SESSION_RECORD_NOT_FOUND")
        assertThat(handler.handleNotificationSessionNotFound().body?.message)
            .isEqualTo("요청한 모임 기록을 찾을 수 없습니다.")
    }

    @Test
    fun `notification and adjacent error copy uses meeting language`() {
        val notification =
            NotificationErrorHandler().handleNotificationApplicationException(
                NotificationApplicationException(
                    NotificationApplicationError.MANUAL_NOTIFICATION_STATE_INVALID,
                    "Manual notification is unavailable for the current session state",
                ),
            )
        assertThat(notification.body?.code).isEqualTo("MANUAL_NOTIFICATION_STATE_INVALID")
        assertThat(notification.body?.message).isEqualTo("모임 상태가 변경되어 이 알림을 보낼 수 없습니다.")

        val archive =
            ArchiveErrorHandler().handleArchiveApplicationException(
                ArchiveApplicationException(ArchiveApplicationError.SESSION_NOT_FOUND, "Archive session not found"),
            )
        assertThat(archive.body?.code).isEqualTo("SESSION_NOT_FOUND")
        assertThat(archive.body?.message).isEqualTo("요청한 모임을 찾을 수 없습니다.")

        val importFallback = SessionImportErrorHandler().handleInvalidImport(InvalidSessionImportException(emptyList()))
        assertThat(importFallback.body?.code).isEqualTo("INVALID_SESSION_IMPORT")
        assertThat(importFallback.body?.message).isEqualTo("모임 import 파일을 확인해 주세요.")
    }

    @Test
    fun `future notification templates cover every event type with No or sentence ordinals`() {
        NotificationEventType.entries.forEach { eventType ->
            val copy = eventCopy(eventType)
            assertThat(copy.emailSubject).doesNotContain("세션", "회차")
            assertThat(copy.title).doesNotContain("세션", "회차")
            assertThat(copy.body).doesNotContain("세션", "회차")
            assertThat(copy.emailBodyText).doesNotContain("세션", "회차")
            assertThat(copy.emailBodyHtml).doesNotContain("세션", "회차")
            assertThat(copy.emailBodyText).contains("모임: No.8")
        }

        val nextBook = eventCopy(NotificationEventType.NEXT_BOOK_PUBLISHED)
        assertThat(nextBook.title).isEqualTo("No.8 책이 정해졌습니다")
        assertThat(nextBook.body).isEqualTo("No.8 Distributed Systems 책이 정해졌습니다.")
        assertThat(nextBook.emailSubject).isEqualTo("No.8 책이 정해졌습니다")
        assertThat(nextBook.emailBodyHtml).contains("모임 확인하기")

        val reminder = eventCopy(NotificationEventType.SESSION_REMINDER_DUE)
        assertThat(reminder.title).isEqualTo("내일 8번째 모임이 있습니다")
        assertThat(reminder.body).isEqualTo("내일 No.8 Distributed Systems 모임이 있습니다.")

        val feedback = eventCopy(NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED)
        assertThat(feedback.title).isEqualTo("No.8 피드백 문서가 올라왔습니다")
        assertThat(feedback.body).isEqualTo("No.8 Distributed Systems 피드백 문서가 올라왔습니다.")

        val record = eventCopy(NotificationEventType.SESSION_RECORD_UPDATED)
        assertThat(record.title).isEqualTo("No.8 모임 기록이 수정되었습니다")
        assertThat(record.body).isEqualTo("No.8 Distributed Systems 기록이 수정되었습니다.")
        assertThat(record.emailBodyHtml).contains("모임 기록 확인하기")

        val review = eventCopy(NotificationEventType.REVIEW_PUBLISHED)
        assertThat(review.title).isEqualTo("8번째 모임에 새 서평이 올라왔습니다")
        assertThat(review.body).isEqualTo("No.8 Distributed Systems 에 새 서평이 올라왔습니다.")

        val ai = eventCopy(NotificationEventType.AI_GENERATION_READY)
        assertThat(ai.title).isEqualTo("AI 모임 초안 준비가 완료되었습니다")
        assertThat(ai.body).isEqualTo("AI 모임 초안 준비가 완료되었습니다. 결과를 확인해 주세요.")

        val testMail = NotificationEmailTemplates.testMailCopy("읽는사이")
        assertThat(testMail.emailBodyText).contains("실제 알림은 모임, 책, 확인할 일을 함께 담아 발송됩니다.")
        assertThat(testMail.emailBodyHtml).contains("실제 알림은 모임, 책, 확인할 일을 함께 담아 발송됩니다.")
    }

    @Test
    fun `manual notification copy uses meeting language without implying public placement`() {
        val draftMember = context(state = "OPEN", visibility = "MEMBER")
        assertThat(draftMember.manualDispatchDisabledReason(NotificationEventType.NEXT_BOOK_PUBLISHED))
            .isEqualTo("멤버에게 보이는 예정 모임만 다음 책 알림을 보낼 수 있습니다.")
        assertThat(context(state = "CLOSED").manualDispatchDisabledReason(NotificationEventType.SESSION_REMINDER_DUE))
            .isEqualTo("작성 중이거나 멤버와 준비 중인 모임만 리마인더를 보낼 수 있습니다.")
        assertThat(
            context(state = "DRAFT", feedbackDocumentUploaded = false)
                .manualDispatchDisabledReason(NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED),
        ).isEqualTo("현재 피드백 문서가 있는 멤버와 준비 중 또는 지난 모임에서 발송할 수 있습니다.")
        assertThat(context().manualDispatchDisabledReason(NotificationEventType.SESSION_RECORD_UPDATED))
            .isEqualTo("반영된 모임 기록이 있어야 수정 알림을 보낼 수 있습니다.")
        assertThat(context().manualDispatchDisabledReason(NotificationEventType.REVIEW_PUBLISHED))
            .isEqualTo("새 서평 알림은 수동 발송하지 않습니다.")
        assertThat(context().manualDispatchDisabledReason(NotificationEventType.AI_GENERATION_READY))
            .isEqualTo("AI 모임 초안 완료 알림은 수동 발송하지 않습니다.")

        val templates =
            HostManualNotificationService(CopyInventoryManualPort())
                .options(hostMember(), SESSION_ID, null, PageRequest.cursor(null, null, defaultLimit = 50, maxLimit = 100))
                .templates
        assertThat(templates.associate { it.eventType to it.label }).containsExactlyInAnyOrderEntriesOf(
            mapOf(
                NotificationEventType.NEXT_BOOK_PUBLISHED to "다음 책 확정",
                NotificationEventType.SESSION_REMINDER_DUE to "모임 전날 리마인더",
                NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED to "피드백 문서 등록",
                NotificationEventType.SESSION_RECORD_UPDATED to "모임 기록 수정",
            ),
        )
        templates.forEach { template ->
            assertThat(template.label).doesNotContain("공개", "세션", "회차")
        }
        assertThat(hostManualNotificationTemplateLabels()).containsExactlyInAnyOrderEntriesOf(
            mapOf(
                NotificationEventType.NEXT_BOOK_PUBLISHED to "다음 책 확정",
                NotificationEventType.SESSION_REMINDER_DUE to "모임 전날 리마인더",
                NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED to "피드백 문서 등록",
                NotificationEventType.REVIEW_PUBLISHED to "새 서평",
                NotificationEventType.SESSION_RECORD_UPDATED to "모임 기록 수정",
                NotificationEventType.AI_GENERATION_READY to "AI 모임 초안 완료",
            ),
        )
    }

    @Test
    fun `generated import number mismatch uses folio ordinals`() {
        val host = hostMember()
        val sessionId = SESSION_ID
        val target =
            SessionImportTarget(
                sessionId = sessionId,
                clubId = host.clubId,
                sessionNumber = 7,
                bookTitle = "Book",
                meetingDate = LocalDate.of(2026, 7, 23),
                attendees = emptyList(),
            )
        val preview =
            SessionImportService(CopyInventoryImportPort(target)).preview(
                SessionImportCommand(
                    host = host,
                    sessionId = sessionId,
                    recordVisibility = SessionRecordVisibility.MEMBER,
                    format = "readmates-session-import:v1",
                    session = SessionImportSessionCommand(8, "Book", LocalDate.of(2026, 7, 23)),
                    publication = SessionImportPublicationCommand("Summary"),
                    highlights = listOf(SessionImportRecordCommand("Member", "Highlight")),
                    oneLineReviews = listOf(SessionImportRecordCommand("Member", "Review")),
                    feedbackDocument = SessionImportFeedbackDocumentCommand("feedback.md", "# note"),
                ),
            )
        val mismatch = preview.issues.single { it.code == "SESSION_NUMBER_MISMATCH" }
        assertThat(mismatch.message).isEqualTo("No.8 파일인데 현재 화면은 No.7입니다.")
        assertThat(mismatch.message).doesNotContain("회차", "세션")
    }

    @Test
    fun `lifecycle and publication wording stay on independent axes`() {
        val handler = SessionApplicationErrorHandler()
        val unpublish = handler.handleUnpublishNotAllowed().body?.message.orEmpty()
        val exposure = handler.handleInvalidExposure().body?.message.orEmpty()
        val reopen = handler.handleReopenNotAllowed().body?.message.orEmpty()
        val record = eventCopy(NotificationEventType.SESSION_RECORD_UPDATED)
        val nextBook = eventCopy(NotificationEventType.NEXT_BOOK_PUBLISHED)
        val forbidden = listOf("세션", "회차", "기록 공개", "공개 완료", "공개를 취소", "공개 기록", "공개 범위")

        listOf(unpublish, exposure, reopen, record.summarySurface(), nextBook.summarySurface()).forEach { text ->
            forbidden.forEach { term ->
                assertThat(text).doesNotContain(term)
            }
        }
        assertThat(unpublish).contains("게스트·멤버 노트")
        assertThat(exposure).contains("보기 범위")
        assertThat(reopen).contains("기록 정리 중")
        assertThat(nextBook.title).doesNotContain("공개")
        assertThat(record.emailBodyText).doesNotContain("공개")
        hostManualNotificationTemplateLabels().values.forEach { label ->
            assertThat(label).doesNotContain("공개", "세션", "회차")
        }
    }

    @Test
    fun `exception types used by session errors remain the documented technical identifiers`() {
        listOf(
            HostSessionDeletionNotAllowedException(),
            HostSessionRecordStagingRequiredException(),
            InvalidSessionExposureException(),
            HostSessionReopenNotAllowedException(),
            HostSessionUnpublishNotAllowedException(),
            HostSessionReturnToDraftNotAllowedException(),
            HostSessionOpenNotAllowedException(),
            HostSessionCloseNotAllowedException(),
            HostSessionPublishNotAllowedException(),
            HostSessionNotFoundException(),
            InvalidSessionScheduleException(),
        ).forEach { error ->
            assertThat(error.javaClass.simpleName).contains("Session")
        }
    }

    @Test
    fun `allowlisted production hits are only technical parser or historical exceptions`() {
        val sourceRoot = projectRoot().resolve("server/src/main/kotlin")
        val allowlist = readAllowlist(projectRoot().resolve("server/config/copy/canonical-meeting-language-allowlist.txt"))
        val hits = scanLegacyCopy(sourceRoot)
        val unmatched =
            hits.filter { hit ->
                allowlist.none { entry -> entry.path == hit.path && hit.line.contains(entry.needle) }
            }
        val unused =
            allowlist.filter { entry ->
                hits.none { hit -> hit.path == entry.path && hit.line.contains(entry.needle) }
            }

        assertThat(allowlist.map { it.kind }.toSet())
            .isSubsetOf(setOf("technical-identifier", "parser-storage-compatibility", "historical-data"))
        assertThat(allowlist).allMatch { it.owner.isNotBlank() && it.removalCondition.isNotBlank() }
        assertThat(unmatched.map { "${it.path}:${it.lineNumber}:${it.line.trim()}" })
            .describedAs("unclassified legacy copy")
            .isEmpty()
        assertThat(unused.map { "${it.path}|${it.needle}" })
            .describedAs("unused allowlist entries")
            .isEmpty()
    }

    private fun assertRecord(
        handler: SessionRecordErrorHandler,
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

    private fun eventCopy(eventType: NotificationEventType) =
        NotificationEmailTemplates.eventCopy(
            eventType = eventType,
            sessionId = SESSION_ID,
            sessionNumber = 8,
            bookTitle = "Distributed Systems",
            clubName = "읽는사이",
            clubSlug = "reading-sai",
            displayName = "민서",
            appBaseUrl = "https://app.readmates.example",
        )

    private fun com.readmates.notification.application.model.NotificationRenderedCopy.summarySurface(): String =
        listOf(title, body, emailSubject, emailBodyText).joinToString("\n")

    private fun hostMember() =
        CurrentMember(
            userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
            membershipId = UUID.fromString("00000000-0000-0000-0000-000000000201"),
            clubId = CLUB_ID,
            clubSlug = "reading-sai",
            email = "host@example.com",
            displayName = "Host",
            accountName = "host",
            role = MembershipRole.HOST,
        )

    private fun hostManualNotificationTemplateLabels(): Map<NotificationEventType, String> {
        val source =
            Files.readString(
                projectRoot().resolve(
                    "server/src/main/kotlin/com/readmates/notification/application/service/HostManualNotificationService.kt",
                ),
            )
        return NotificationEventType.entries.associateWith { eventType ->
            Regex("""NotificationEventType\.${eventType.name} -> "([^"]+)"""")
                .findAll(source)
                .map { it.groupValues[1] }
                .last()
        }
    }

    private fun context(
        state: String = "DRAFT",
        visibility: String = "HOST_ONLY",
        feedbackDocumentUploaded: Boolean = false,
    ) = ManualNotificationSessionContext(
        sessionId = SESSION_ID,
        clubId = CLUB_ID,
        sessionNumber = 8,
        bookTitle = "Distributed Systems",
        date = LocalDate.of(2026, 8, 22),
        state = state,
        visibility = visibility,
        feedbackDocumentUploaded = feedbackDocumentUploaded,
    )

    private companion object {
        private val SESSION_ID = UUID.fromString("00000000-0000-0000-0000-000000000301")
        private val CLUB_ID = UUID.fromString("00000000-0000-0000-0000-000000000001")
        private val LEGACY_COPY = Regex("세션|회차|RSVP|기록 공개|공개 완료|공개 취소|독서모임.{0,40}차")

        private fun projectRoot(): Path =
            listOf(Path.of("."), Path.of(".."))
                .map { candidate -> candidate.toAbsolutePath().normalize() }
                .first { candidate -> Files.exists(candidate.resolve("server/build.gradle.kts")) }

        private fun scanLegacyCopy(sourceRoot: Path): List<CopyHit> {
            val hits = mutableListOf<CopyHit>()
            Files.walk(sourceRoot).use { paths ->
                paths
                    .filter { Files.isRegularFile(it) && it.fileName.toString().endsWith(".kt") }
                    .forEach { file ->
                        val relative = file.relativeTo(sourceRoot).toString().replace('\\', '/')
                        Files.readAllLines(file).forEachIndexed { index, line ->
                            if (LEGACY_COPY.containsMatchIn(line)) {
                                hits += CopyHit(relative, index + 1, line)
                            }
                        }
                    }
            }
            return hits
        }

        private fun readAllowlist(path: Path): List<AllowlistEntry> =
            Files
                .readAllLines(path)
                .map { it.trim() }
                .filter { it.isNotEmpty() && !it.startsWith("#") }
                .map { row ->
                    val fields = row.split('|')
                    require(fields.size == 5) { "allowlist row must have 5 fields: $row" }
                    AllowlistEntry(
                        kind = fields[0],
                        path = fields[1],
                        needle = fields[2],
                        owner = fields[3],
                        removalCondition = fields[4],
                    )
                }

        private data class CopyHit(
            val path: String,
            val lineNumber: Int,
            val line: String,
        )

        private data class AllowlistEntry(
            val kind: String,
            val path: String,
            val needle: String,
            val owner: String,
            val removalCondition: String,
        )
    }

    private class CopyInventoryManualPort : ManualNotificationDispatchPort {
        override fun findSessionContext(
            clubId: UUID,
            sessionId: UUID,
        ) = ManualNotificationSessionContext(
            sessionId = SESSION_ID,
            clubId = CLUB_ID,
            sessionNumber = 8,
            bookTitle = "Distributed Systems",
            date = LocalDate.of(2026, 8, 22),
            state = "DRAFT",
            visibility = "MEMBER",
            feedbackDocumentUploaded = false,
        )

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
        ) = error("unused")

        override fun previewTargets(
            clubId: UUID,
            selection: ManualNotificationSelection,
        ) = error("unused")

        override fun recentDispatches(
            clubId: UUID,
            sessionId: UUID,
            eventType: NotificationEventType,
            contentRevision: String,
        ): List<ManualNotificationRecentDispatch> = error("unused")

        override fun insertPreview(
            clubId: UUID,
            hostMembershipId: UUID,
            selectionHash: String,
            targetSnapshotHash: String,
            expiresAt: OffsetDateTime,
        ): UUID = error("unused")

        override fun findPreview(
            id: UUID,
            clubId: UUID,
            hostMembershipId: UUID,
        ): ManualNotificationPreviewRecord? = error("unused")

        override fun confirmManualDispatch(input: ManualNotificationConfirmTransactionInput): ManualNotificationConfirmAttempt =
            error("unused")

        override fun insertManualDispatch(
            clubId: UUID,
            hostMembershipId: UUID,
            selection: ManualNotificationSelection,
            payload: NotificationEventPayload,
            targetSnapshot: ManualNotificationTargetSnapshot,
            resend: Boolean,
        ): ManualNotificationStoredDispatch = error("unused")
    }

    private class CopyInventoryImportPort(
        private val target: SessionImportTarget,
    ) : SessionImportWritePort {
        override fun loadTarget(
            host: AuthenticatedClubActor,
            sessionId: UUID,
        ): SessionImportTarget = target

        override fun replaceRecords(command: SessionImportRecordReplacement): SessionImportStoredFeedbackDocument =
            error("unused")
    }
}
