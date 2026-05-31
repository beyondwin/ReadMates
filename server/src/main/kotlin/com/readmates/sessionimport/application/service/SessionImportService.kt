package com.readmates.sessionimport.application.service

import com.readmates.feedback.application.FeedbackDocumentParser
import com.readmates.notification.application.port.`in`.RecordNotificationEventUseCase
import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.sessionimport.application.model.SessionImportCommand
import com.readmates.sessionimport.application.model.SessionImportCommitResult
import com.readmates.sessionimport.application.model.SessionImportCommittedFeedbackDocument
import com.readmates.sessionimport.application.model.SessionImportFeedbackDocumentPreview
import com.readmates.sessionimport.application.model.SessionImportIssue
import com.readmates.sessionimport.application.model.SessionImportPreviewResult
import com.readmates.sessionimport.application.model.SessionImportPublicationPreview
import com.readmates.sessionimport.application.model.SessionImportRecordPreview
import com.readmates.sessionimport.application.model.SessionImportSessionPreview
import com.readmates.sessionimport.application.model.SessionImportTarget
import com.readmates.sessionimport.application.port.`in`.CommitSessionImportUseCase
import com.readmates.sessionimport.application.port.`in`.CommitValidatedSessionImportUseCase
import com.readmates.sessionimport.application.port.`in`.PreviewSessionImportUseCase
import com.readmates.sessionimport.application.port.`in`.ValidatedSessionImportInput
import com.readmates.sessionimport.application.port.out.SessionImportRecordReplacement
import com.readmates.sessionimport.application.port.out.SessionImportWritePort
import com.readmates.shared.cache.ReadCacheInvalidationPort
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.AuthenticatedClubActor
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

class InvalidSessionImportException(
    val issues: List<SessionImportIssue>,
) : RuntimeException("Invalid session import")

private fun isSafeFeedbackFileName(fileName: String): Boolean {
    val trimmed = fileName.trim()
    return trimmed.isNotBlank() &&
        !trimmed.contains('/') &&
        !trimmed.contains('\\') &&
        (trimmed.endsWith(".md") || trimmed.endsWith(".txt"))
}

private fun requireHost(host: AuthenticatedClubActor) {
    if (!host.isHost) {
        throw AccessDeniedException("Host role required")
    }
}

@Service
class SessionImportService(
    private val writePort: SessionImportWritePort,
    private val recordNotificationEventUseCase: RecordNotificationEventUseCase,
    private val cacheInvalidation: ReadCacheInvalidationPort = ReadCacheInvalidationPort.Noop(),
) : PreviewSessionImportUseCase,
    CommitSessionImportUseCase,
    CommitValidatedSessionImportUseCase {
    private val parser = FeedbackDocumentParser()

    override fun preview(command: SessionImportCommand): SessionImportPreviewResult {
        requireHost(command.host)
        val target = writePort.loadTarget(command.host, command.sessionId) ?: throw HostSessionNotFoundException()
        return validate(command, target)
    }

    @Transactional
    override fun commit(command: SessionImportCommand): SessionImportCommitResult {
        requireHost(command.host)
        val target = writePort.loadTarget(command.host, command.sessionId) ?: throw HostSessionNotFoundException()
        val preview = validate(command, target)
        if (!preview.valid) {
            throw InvalidSessionImportException(preview.issues)
        }
        return commitVerifiedTarget(command, preview)
    }

    /**
     * Commits a session import command whose caller has already validated it. Skips the
     * standard [validate] step but still loads the target, replaces records, and triggers
     * post-commit cache invalidation. Trust boundary: callers (e.g. the AI generation flow,
     * which re-runs SessionImportV1Validator) MUST validate the command first.
     */
    @Transactional
    override fun commitValidated(input: ValidatedSessionImportInput): SessionImportCommitResult {
        val command = input.command
        requireHost(command.host)
        val target = writePort.loadTarget(command.host, command.sessionId) ?: throw HostSessionNotFoundException()
        // The caller has already validated, but we still build the preview projection so we
        // reuse the same SessionImportRecordReplacement payload shape as commit(...). If the
        // caller passed an invalid command, surface InvalidSessionImportException — same as
        // commit(...). This preserves the security invariant.
        val preview = validate(command, target)
        if (!preview.valid) {
            throw InvalidSessionImportException(preview.issues)
        }
        return commitVerifiedTarget(command, preview)
    }

    private fun commitVerifiedTarget(
        command: SessionImportCommand,
        preview: SessionImportPreviewResult,
    ): SessionImportCommitResult {
        val feedbackTitle =
            preview.feedbackDocument.title
                ?: throw InvalidSessionImportException(
                    listOf(SessionImportIssue("INVALID_FEEDBACK_DOCUMENT", "피드백 문서가 ReadMates 피드백 템플릿 형식이 아닙니다.")),
                )

        val storedFeedback =
            writePort.replaceRecords(
                SessionImportRecordReplacement(
                    host = command.host,
                    sessionId = command.sessionId,
                    visibility = command.recordVisibility,
                    publicationSummary = preview.publication.summary,
                    highlights = preview.highlights,
                    oneLineReviews = preview.oneLineReviews,
                    feedbackDocument = command.feedbackDocument,
                    feedbackTitle = feedbackTitle,
                ),
            )
        recordNotificationEventUseCase.recordFeedbackDocumentPublished(
            clubId = command.host.clubId,
            sessionId = command.sessionId,
            sessionNumber = command.session.number,
            bookTitle = command.session.bookTitle,
            documentVersion = storedFeedback.version,
        )
        cacheInvalidation.evictClubContentAfterCommit(command.host.clubId)

        return SessionImportCommitResult(
            sessionId = command.sessionId.toString(),
            publication = preview.publication,
            highlights = preview.highlights,
            oneLineReviews = preview.oneLineReviews,
            feedbackDocument =
                SessionImportCommittedFeedbackDocument(
                    uploaded = true,
                    fileName = storedFeedback.fileName,
                    title = storedFeedback.title,
                    uploadedAt = storedFeedback.uploadedAt,
                ),
        )
    }

    private fun validate(
        command: SessionImportCommand,
        target: SessionImportTarget,
    ): SessionImportPreviewResult {
        val issues = mutableListOf<SessionImportIssue>()
        validateSessionMetadata(command, target, issues)
        validateImportContent(command, issues)

        val highlights =
            command.highlights.map {
                matchRecord(it.authorName, it.text, target, issues, "HIGHLIGHT_AUTHOR_NOT_FOUND")
            }
        val oneLineReviews =
            command.oneLineReviews.map {
                matchRecord(it.authorName, it.text, target, issues, "ONE_LINE_AUTHOR_NOT_FOUND")
            }
        validateOneLineReviewAuthors(command, issues)

        val parsedFeedback =
            parseFeedbackDocument(command.feedbackDocument.markdown, issues)

        return SessionImportPreviewResult(
            valid = issues.isEmpty(),
            session =
                SessionImportSessionPreview(
                    command.session.number,
                    command.session.bookTitle,
                    command.session.meetingDate.toString(),
                ),
            publication = SessionImportPublicationPreview(command.publication.summary.trim()),
            highlights = highlights,
            oneLineReviews = oneLineReviews,
            feedbackDocument =
                SessionImportFeedbackDocumentPreview(
                    command.feedbackDocument.fileName.trim(),
                    parsedFeedback?.title,
                    parsedFeedback != null,
                ),
            issues = issues,
        )
    }

    private fun validateSessionMetadata(
        command: SessionImportCommand,
        target: SessionImportTarget,
        issues: MutableList<SessionImportIssue>,
    ) {
        if (command.format != FORMAT) {
            issues += SessionImportIssue("INVALID_FORMAT", "이 파일은 readmates-session-import:v1 형식이 아닙니다.")
        }
        if (command.recordVisibility == SessionRecordVisibility.HOST_ONLY) {
            issues += SessionImportIssue("HOST_ONLY_VISIBILITY", "호스트 전용 공개 범위에서는 세션 기록 import를 저장할 수 없습니다.")
        }
        if (command.session.number != target.sessionNumber) {
            issues +=
                SessionImportIssue(
                    "SESSION_NUMBER_MISMATCH",
                    "${command.session.number}회차 파일인데 현재 화면은 ${target.sessionNumber}회차입니다.",
                )
        }
        if (command.session.bookTitle.trim() != target.bookTitle) {
            issues += SessionImportIssue("BOOK_TITLE_MISMATCH", "책 제목이 현재 세션과 일치하지 않습니다.")
        }
        if (!command.session.meetingDate.isEqual(target.meetingDate)) {
            issues += SessionImportIssue("MEETING_DATE_MISMATCH", "모임 날짜가 현재 세션과 일치하지 않습니다.")
        }
    }

    private fun validateImportContent(
        command: SessionImportCommand,
        issues: MutableList<SessionImportIssue>,
    ) {
        if (command.publication.summary.isBlank()) {
            issues += SessionImportIssue("SUMMARY_REQUIRED", "공개 요약을 입력해 주세요.")
        }
        if (command.highlights.isEmpty() || command.highlights.size > MAX_HIGHLIGHT_COUNT) {
            issues += SessionImportIssue("HIGHLIGHT_COUNT_INVALID", "하이라이트는 1개 이상 6개 이하로 입력해 주세요.")
        }
        if (command.oneLineReviews.isEmpty()) {
            issues += SessionImportIssue("ONE_LINE_REVIEW_REQUIRED", "한줄평을 1개 이상 입력해 주세요.")
        }
        if (!isSafeFeedbackFileName(command.feedbackDocument.fileName)) {
            issues += SessionImportIssue("INVALID_FEEDBACK_FILE_NAME", "피드백 문서 파일 이름은 .md 또는 .txt 파일이어야 합니다.")
        }
    }

    private fun validateOneLineReviewAuthors(
        command: SessionImportCommand,
        issues: MutableList<SessionImportIssue>,
    ) {
        command.oneLineReviews
            .groupBy { it.authorName.trim() }
            .filterValues { it.size > 1 }
            .keys
            .forEach { authorName ->
                issues += SessionImportIssue("DUPLICATE_ONE_LINE_AUTHOR", "한줄평 작성자 '$authorName'가 중복되었습니다.")
            }
    }

    private fun parseFeedbackDocument(
        markdown: String,
        issues: MutableList<SessionImportIssue>,
    ) = runCatching { parser.parse(markdown) }
        .getOrElse {
            issues += SessionImportIssue("INVALID_FEEDBACK_DOCUMENT", "피드백 문서가 ReadMates 피드백 템플릿 형식이 아닙니다.")
            null
        }

    private fun matchRecord(
        authorName: String,
        text: String,
        target: SessionImportTarget,
        issues: MutableList<SessionImportIssue>,
        issueCode: String,
    ): SessionImportRecordPreview {
        val trimmedAuthorName = authorName.trim()
        val trimmedText = text.trim()
        val attendee = target.attendees.firstOrNull { it.active && it.displayName == trimmedAuthorName }
        if (trimmedText.isBlank()) {
            issues += SessionImportIssue("RECORD_TEXT_REQUIRED", "기록 문구가 비어 있습니다.")
        }
        if (attendee == null) {
            issues += SessionImportIssue(issueCode, "작성자 '$trimmedAuthorName'를 이 회차 참석자에서 찾을 수 없습니다.")
        }
        return SessionImportRecordPreview(
            trimmedAuthorName,
            trimmedText,
            attendee != null,
            attendee?.membershipId?.toString(),
        )
    }

    private companion object {
        private const val FORMAT = "readmates-session-import:v1"
        private const val MAX_HIGHLIGHT_COUNT = 6
    }
}
