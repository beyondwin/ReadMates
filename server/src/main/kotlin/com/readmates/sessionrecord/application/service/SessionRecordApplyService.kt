package com.readmates.sessionrecord.application.service

import com.readmates.notification.application.model.ManualNotificationContentRevision
import com.readmates.notification.domain.NotificationEventType
import com.readmates.sessionimport.application.model.SESSION_IMPORT_FORMAT
import com.readmates.sessionimport.application.model.SessionImportCommand
import com.readmates.sessionimport.application.model.SessionImportFeedbackDocumentCommand
import com.readmates.sessionimport.application.model.SessionImportPublicationCommand
import com.readmates.sessionimport.application.model.SessionImportRecordCommand
import com.readmates.sessionimport.application.model.SessionImportSessionCommand
import com.readmates.sessionimport.application.port.`in`.ReplaceValidatedSessionImportUseCase
import com.readmates.sessionimport.application.port.`in`.ValidateSessionImportUseCase
import com.readmates.sessionimport.application.port.`in`.ValidatedSessionImportReplacement
import com.readmates.sessionimport.application.service.toCanonicalSnapshot
import com.readmates.sessionrecord.application.model.ApplySessionRecordCommand
import com.readmates.sessionrecord.application.model.HostNotificationComposerContext
import com.readmates.sessionrecord.application.model.LiveSessionRecord
import com.readmates.sessionrecord.application.model.PreviewSessionRecordApplyCommand
import com.readmates.sessionrecord.application.model.SessionRecordApplyPreview
import com.readmates.sessionrecord.application.model.SessionRecordApplyReceipt
import com.readmates.sessionrecord.application.model.SessionRecordApplyResult
import com.readmates.sessionrecord.application.model.SessionRecordDraft
import com.readmates.sessionrecord.application.model.SessionRecordEditor
import com.readmates.sessionrecord.application.model.SessionRecordError
import com.readmates.sessionrecord.application.model.SessionRecordException
import com.readmates.sessionrecord.application.port.`in`.ApplySessionRecordUseCase
import com.readmates.sessionrecord.application.port.out.SessionRecordStorePort
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class SessionRecordApplyService(
    private val store: SessionRecordStorePort,
    private val codec: SessionRecordSnapshotCodec,
    private val validator: ValidateSessionImportUseCase,
    private val replacer: ReplaceValidatedSessionImportUseCase,
) : ApplySessionRecordUseCase {
    override fun preview(
        host: CurrentMember,
        command: PreviewSessionRecordApplyCommand,
    ): SessionRecordApplyPreview {
        requireHost(host)
        val live =
            store.loadLive(host, command.sessionId)
                ?: throw notFound()
        val draft =
            store.loadDraft(host, command.sessionId)
                ?: throw draftStale()
        requireRevisions(live, draft, command.expectedLiveRevision, command.expectedDraftRevision)
        return SessionRecordApplyPreview(
            eventType = composerEventType(live, draft),
            expectedDraftHash = codec.encode(draft.snapshot).sha256,
        )
    }

    @Transactional
    override fun apply(
        host: CurrentMember,
        command: ApplySessionRecordCommand,
    ): SessionRecordApplyResult {
        requireHost(host)
        store.findApplyReceipt(host, command.applyRequestId)?.let { completed ->
            return replay(command, completed)
        }
        val editor =
            store.lockEditor(host, command.sessionId)
                ?: throw notFound()
        return applyLocked(host, command, editor)
    }

    @Suppress("LongMethod", "ThrowsCount")
    private fun applyLocked(
        host: CurrentMember,
        command: ApplySessionRecordCommand,
        editor: SessionRecordEditor,
    ): SessionRecordApplyResult {
        store.findApplyReceipt(host, command.applyRequestId)?.let { completed ->
            return replay(command, completed)
        }
        val draft = editor.draft ?: throw draftStale()
        requireRevisions(editor.live, draft, command.expectedLiveRevision, command.expectedDraftRevision)
        val eventType = composerEventType(editor.live, draft)
        val requestHash = codec.encode(draft.snapshot).sha256
        val requestHashMatches =
            java.security.MessageDigest.isEqual(
                requestHash.toByteArray(),
                command.expectedDraftHash.toByteArray(),
            )
        if (!requestHashMatches) {
            throw SessionRecordException(
                SessionRecordError.INVALID_APPLY_CONTRACT,
                "Session record draft hash is invalid",
            )
        }
        val importCommand = draft.toImportCommand(host, editor.live)
        val validated =
            validator.validate(
                importCommand,
                draft.trustedAuthorBindings(),
                draft.historicalAuthorBindings(editor.live, draft.trustedAuthorBindings()),
                trustAuthorDisplayNames =
                    draft.source == com.readmates.sessionrecord.application.model.SessionRecordDraftSource.AI_GENERATED,
            )
        if (!validated.valid) {
            throw SessionRecordException(
                SessionRecordError.INVALID_RECORD,
                "Session record draft is invalid",
            )
        }
        val encodedLive = codec.encode(editor.live.snapshot)
        val canonicalSnapshot = importCommand.toCanonicalSnapshot(validated)
        val encodedDraft = codec.encode(canonicalSnapshot)
        store.insertBaselineIfAbsent(host, editor.live, encodedLive)
        replacer.replace(ValidatedSessionImportReplacement(importCommand, validated, canonicalSnapshot))
        val revision = store.insertAppliedRevision(host, editor, encodedDraft)
        store.insertApplyReceipt(host, command, requestHash, eventType, revision)
        if (!store.deleteAppliedDraft(host, command.sessionId, command.expectedDraftRevision)) {
            throw draftStale()
        }
        return result(revision, eventType)
    }

    private fun replay(
        command: ApplySessionRecordCommand,
        completed: SessionRecordApplyReceipt,
    ): SessionRecordApplyResult {
        if (completed.expectedDraftRevision != command.expectedDraftRevision ||
            completed.expectedLiveRevision != command.expectedLiveRevision ||
            completed.draftSha256 != command.expectedDraftHash ||
            completed.revision.sessionId != command.sessionId
        ) {
            throw SessionRecordException(
                SessionRecordError.APPLY_REQUEST_ALREADY_USED,
                "Session record apply request was already used",
            )
        }
        return result(completed.revision, completed.composerEventType)
    }

    private fun result(
        revision: com.readmates.sessionrecord.application.model.SessionRecordRevision,
        eventType: NotificationEventType,
    ) = SessionRecordApplyResult(
        revisionId = revision.id,
        liveRevision = revision.version,
        composer =
            HostNotificationComposerContext(
                sessionId = revision.sessionId,
                eventType = eventType,
                contentRevision =
                    ManualNotificationContentRevision.sessionRecord(
                        codec.encode(revision.snapshot).sha256,
                    ),
            ),
    )

    private fun requireRevisions(
        live: LiveSessionRecord,
        draft: SessionRecordDraft,
        expectedLiveRevision: Long,
        expectedDraftRevision: Long,
    ) {
        if (draft.draftRevision != expectedDraftRevision) throw draftStale()
        if (live.revision != expectedLiveRevision ||
            draft.baseLiveRevision != live.revision ||
            draft.baseSessionUpdatedAt != live.sessionUpdatedAt
        ) {
            throw SessionRecordException(SessionRecordError.LIVE_STALE, "Session record live revision is stale")
        }
    }

    private fun SessionRecordDraft.trustedAuthorBindings(): Map<String, UUID> =
        (snapshot.highlights + snapshot.oneLineReviews)
            .groupBy { it.authorDisplayName }
            .mapValues { (name, entries) ->
                entries
                    .map { it.membershipId }
                    .distinct()
                    .singleOrNull()
                    ?: throw SessionRecordException(
                        SessionRecordError.INVALID_RECORD,
                        "Session record author attribution is ambiguous for $name",
                    )
            }

    private fun SessionRecordDraft.toImportCommand(
        host: CurrentMember,
        live: LiveSessionRecord,
    ) = SessionImportCommand(
        host = host,
        sessionId = sessionId,
        recordVisibility = snapshot.visibility,
        format = SESSION_IMPORT_FORMAT,
        session = SessionImportSessionCommand(live.sessionNumber, live.bookTitle, live.meetingDate),
        publication = SessionImportPublicationCommand(snapshot.publicationSummary),
        highlights = snapshot.highlights.map { SessionImportRecordCommand(it.authorDisplayName, it.text) },
        oneLineReviews = snapshot.oneLineReviews.map { SessionImportRecordCommand(it.authorDisplayName, it.text) },
        feedbackDocument =
            SessionImportFeedbackDocumentCommand(
                snapshot.feedbackDocument.fileName,
                snapshot.feedbackDocument.markdown,
            ),
    )

    private fun requireHost(host: CurrentMember) {
        if (!host.isHost) throw AccessDeniedException("Host role required")
    }

    private fun draftStale() = SessionRecordException(SessionRecordError.DRAFT_STALE, "Session record draft is stale")

    private fun notFound() = SessionRecordException(SessionRecordError.SESSION_NOT_FOUND, "Session record not found")
}

private fun SessionRecordDraft.historicalAuthorBindings(
    live: LiveSessionRecord,
    trusted: Map<String, UUID>,
): Map<String, UUID> {
    if (source == com.readmates.sessionrecord.application.model.SessionRecordDraftSource.RESTORED) return trusted
    val liveRecords = live.snapshot.highlights + live.snapshot.oneLineReviews
    val draftRecords = snapshot.highlights + snapshot.oneLineReviews
    return trusted.filter { (name, membershipId) ->
        draftRecords
            .filter { it.authorDisplayName == name }
            .all { draftRecord ->
                liveRecords.any {
                    it.membershipId == membershipId &&
                        it.authorDisplayName == name &&
                        it.text == draftRecord.text
                }
            }
    }
}

private fun composerEventType(
    live: LiveSessionRecord,
    draft: SessionRecordDraft,
): NotificationEventType =
    if (live.snapshot.feedbackDocument.markdown
            .isBlank() &&
        draft.snapshot.feedbackDocument.markdown
            .isNotBlank()
    ) {
        NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED
    } else {
        NotificationEventType.SESSION_RECORD_UPDATED
    }
