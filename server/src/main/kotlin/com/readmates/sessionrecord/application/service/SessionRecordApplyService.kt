package com.readmates.sessionrecord.application.service

import com.readmates.notification.application.model.ManualNotificationContentRevision
import com.readmates.notification.domain.NotificationEventType
import com.readmates.sessionrecord.application.model.ApplySessionRecordCommand
import com.readmates.sessionrecord.application.model.HostNotificationComposerContext
import com.readmates.sessionrecord.application.model.LiveSessionRecord
import com.readmates.sessionrecord.application.model.PreviewSessionRecordApplyCommand
import com.readmates.sessionrecord.application.model.PublishSessionRecordCorrectionCommand
import com.readmates.sessionrecord.application.model.PublishSessionRecordCorrectionResult
import com.readmates.sessionrecord.application.model.SessionRecordApplyPreview
import com.readmates.sessionrecord.application.model.SessionRecordApplyReceipt
import com.readmates.sessionrecord.application.model.SessionRecordApplyResult
import com.readmates.sessionrecord.application.model.SessionRecordCorrectionEditor
import com.readmates.sessionrecord.application.model.SessionRecordCorrectionPreview
import com.readmates.sessionrecord.application.model.SessionRecordCorrectionVersions
import com.readmates.sessionrecord.application.model.SessionRecordDraft
import com.readmates.sessionrecord.application.model.SessionRecordEditor
import com.readmates.sessionrecord.application.model.SessionRecordError
import com.readmates.sessionrecord.application.model.SessionRecordException
import com.readmates.sessionrecord.application.model.toAudienceProjection
import com.readmates.sessionrecord.application.port.`in`.ApplySessionRecordUseCase
import com.readmates.sessionrecord.application.port.out.ReplaceSessionRecordContentPort
import com.readmates.sessionrecord.application.port.out.SessionRecordContentReplacement
import com.readmates.sessionrecord.application.port.out.SessionRecordContentReplacementResult
import com.readmates.sessionrecord.application.port.out.SessionRecordMutationReceiptPort
import com.readmates.sessionrecord.application.port.out.SessionRecordSnapshotCodec
import com.readmates.sessionrecord.application.port.out.SessionRecordStorePort
import com.readmates.shared.listing.application.model.HostListEpochKind
import com.readmates.shared.listing.application.port.out.HostListEpochPort
import com.readmates.shared.listing.application.port.out.bump
import com.readmates.shared.mutation.application.model.CanonicalMutationPayload
import com.readmates.shared.mutation.application.model.HostMutationOperation
import com.readmates.shared.mutation.application.model.MutationClaimResult
import com.readmates.shared.mutation.application.model.MutationIdentity
import com.readmates.shared.mutation.application.model.MutationPendingException
import com.readmates.shared.mutation.application.service.MutationIdempotencyService
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
@Suppress("TooManyFunctions")
class SessionRecordApplyService(
    private val store: SessionRecordStorePort,
    private val codec: SessionRecordSnapshotCodec,
    private val replacer: ReplaceSessionRecordContentPort,
    private val mutationReceipts: SessionRecordMutationReceiptPort,
    private val epochPort: HostListEpochPort = HostListEpochPort.Noop(),
    private val idempotency: MutationIdempotencyService? = null,
) : ApplySessionRecordUseCase {
    @Transactional(readOnly = true)
    override fun previewCorrection(
        host: CurrentMember,
        sessionId: UUID,
    ): SessionRecordCorrectionPreview? {
        requireHost(host)
        val correction = store.loadCorrectionEditor(host, sessionId) ?: throw notFound()
        if (correction.editor.draftLiveBaseStale) {
            throw liveStale()
        }
        val draft = correction.editor.draft
        return if (correction.state == "PUBLISHED" && draft != null) {
            SessionRecordCorrectionPreview(
                state = correction.state,
                versions = correction.versions,
                targetAudience = draft.snapshot.visibility.toAudienceProjection(correction.state),
            )
        } else {
            null
        }
    }

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
        val identity = applyIdentity(host, command)
        if (identity != null && idempotency != null) {
            when (
                val claim =
                    idempotency.claim(
                        identity,
                        CanonicalMutationPayload.RecordApply(
                            applyRequestId = command.applyRequestId,
                            entryKeys = listOf(command.expectedDraftHash),
                        ),
                    )
            ) {
                is MutationClaimResult.Replayed -> {
                    requireMutationReceipt(host, command, claim.receiptId)
                    val completed =
                        store.findApplyReceipt(host, command.sessionId, claim.receiptId)
                            ?: throw notFound()
                    return replay(host, command, completed)
                }
                is MutationClaimResult.InProgress -> throw MutationPendingException()
                is MutationClaimResult.Claimed -> Unit
            }
        }
        store.findApplyReceipt(host, command.sessionId, command.applyRequestId)?.let { completed ->
            if (identity != null) {
                requireMutationReceipt(host, command, command.applyRequestId)
                idempotency?.complete(identity, command.applyRequestId)
            }
            return replay(host, command, completed)
        }
        val editor =
            store.lockEditor(host, command.sessionId)
                ?: throw notFound()
        return applyLocked(host, command, editor, identity)
    }

    override fun publishCorrection(
        host: CurrentMember,
        command: PublishSessionRecordCorrectionCommand,
    ): PublishSessionRecordCorrectionResult = publishCorrectionLocked(host, command)

    private fun publishCorrectionLocked(
        host: CurrentMember,
        command: PublishSessionRecordCorrectionCommand,
    ): PublishSessionRecordCorrectionResult {
        requireHost(host)
        val correction = store.lockCorrectionEditor(host, command.sessionId) ?: throw notFound()
        val current = correction.versions
        return when {
            correction.state != "PUBLISHED" -> PublishSessionRecordCorrectionResult.NotPublished
            current.conflictsWith(command) -> PublishSessionRecordCorrectionResult.RevisionConflict(current)
            else -> applyCorrection(host, command, correction)
        }
    }

    private fun applyCorrection(
        host: CurrentMember,
        command: PublishSessionRecordCorrectionCommand,
        correction: SessionRecordCorrectionEditor,
    ): PublishSessionRecordCorrectionResult {
        val draft = correction.editor.draft ?: throw draftStale()
        val requestHash = codec.encode(draft.snapshot).sha256
        val targetAudience = draft.snapshot.visibility.toAudienceProjection(correction.state)
        val liveAudience =
            correction.editor.live.snapshot.visibility
                .toAudienceProjection(correction.state)
        val exposureChanged =
            targetAudience.accessScope != liveAudience.accessScope
        val receiptId = UUID.randomUUID()
        val result =
            applyLocked(
                host = host,
                command =
                    ApplySessionRecordCommand(
                        sessionId = command.sessionId,
                        applyRequestId = receiptId,
                        expectedDraftRevision = command.expectedDraftRevision,
                        expectedLiveRevision = command.expectedLiveRevision,
                        expectedDraftHash = requestHash,
                    ),
                editor = correction.editor,
                allowHostOnlyVisibility = true,
                afterReplacement = {
                    check(
                        store.bumpCorrectionProjectionRevisions(
                            host = host,
                            sessionId = command.sessionId,
                            expectedExposureRevision = command.expectedExposureRevision,
                            expectedPublicationRevision = command.expectedPublicationRevision,
                            exposureChanged = exposureChanged,
                        ),
                    ) { "Locked correction projection revisions changed unexpectedly" }
                },
            )
        return PublishSessionRecordCorrectionResult.Applied(receiptId, result)
    }

    @Suppress("LongMethod", "ThrowsCount")
    private fun applyLocked(
        host: CurrentMember,
        command: ApplySessionRecordCommand,
        editor: SessionRecordEditor,
        identity: MutationIdentity? = null,
        allowHostOnlyVisibility: Boolean = false,
        afterReplacement: () -> Unit = {},
    ): SessionRecordApplyResult {
        store.findApplyReceipt(host, command.sessionId, command.applyRequestId, forUpdate = true)?.let { completed ->
            if (identity != null) {
                requireMutationReceipt(host, command, command.applyRequestId)
                idempotency?.complete(identity, command.applyRequestId)
            }
            return replay(host, command, completed)
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
        val trustedAuthorBindings = draft.trustedAuthorBindings()
        val replacement =
            replacer.replace(
                SessionRecordContentReplacement(
                    host = host,
                    sessionId = draft.sessionId,
                    sessionNumber = editor.live.sessionNumber,
                    bookTitle = editor.live.bookTitle,
                    meetingDate = editor.live.meetingDate,
                    snapshot = draft.snapshot,
                    source = draft.source,
                    trustedAuthorBindings = trustedAuthorBindings,
                    historicalAuthorBindings = draft.historicalAuthorBindings(editor.live, trustedAuthorBindings),
                    allowHostOnlyVisibility = allowHostOnlyVisibility,
                ),
            )
        val canonicalSnapshot =
            when (replacement) {
                is SessionRecordContentReplacementResult.Applied -> replacement.canonicalSnapshot
                SessionRecordContentReplacementResult.Invalid ->
                    throw SessionRecordException(
                        SessionRecordError.INVALID_RECORD,
                        "Session record draft is invalid",
                    )
            }
        val encodedDraft = codec.encode(canonicalSnapshot)
        afterReplacement()
        val revision = store.insertAppliedRevision(host, editor, encodedDraft)
        store.insertApplyReceipt(host, command, requestHash, eventType, revision)
        if (!store.deleteAppliedDraft(host, command.sessionId, command.expectedDraftRevision)) {
            throw draftStale()
        }
        if (!allowHostOnlyVisibility) {
            mutationReceipts.recordCommitted(host, command.sessionId, command.applyRequestId)
        }
        if (identity != null) {
            idempotency?.complete(identity, command.applyRequestId)
        }
        epochPort.bump(host.clubId, HostListEpochKind.RECORD)
        return result(revision, eventType)
    }

    private fun requireMutationReceipt(
        host: CurrentMember,
        command: ApplySessionRecordCommand,
        receiptId: UUID,
    ) {
        if (!mutationReceipts.matchesCommitted(host, command.sessionId, receiptId)) {
            throw SessionRecordException(
                SessionRecordError.APPLY_REQUEST_ALREADY_USED,
                "Session record apply receipt is unavailable",
            )
        }
    }

    private fun replay(
        host: CurrentMember,
        command: ApplySessionRecordCommand,
        completed: SessionRecordApplyReceipt,
    ): SessionRecordApplyResult {
        val sameActor = completed.hostMembershipId == host.membershipId
        val sameExpectedRevisions =
            completed.expectedDraftRevision == command.expectedDraftRevision &&
                completed.expectedLiveRevision == command.expectedLiveRevision
        val sameApplyContract =
            sameExpectedRevisions &&
                completed.draftSha256 == command.expectedDraftHash &&
                completed.revision.sessionId == command.sessionId
        if (!sameActor || !sameApplyContract) {
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
        if (live.revision != expectedLiveRevision || draft.isStaleAgainst(live)) {
            throw SessionRecordException(SessionRecordError.LIVE_STALE, "Session record live revision is stale")
        }
    }

    private fun applyIdentity(
        host: CurrentMember,
        command: ApplySessionRecordCommand,
    ): MutationIdentity? {
        val key = command.idempotencyKey ?: return null
        return MutationIdentity(
            clubId = host.clubId,
            actorMembershipId = host.membershipId,
            operation = HostMutationOperation.SESSION_RECORD_APPLY.name,
            resourceSlot = command.sessionId.toString(),
            idempotencyKey = key,
        )
    }
}

private fun SessionRecordCorrectionVersions.conflictsWith(command: PublishSessionRecordCorrectionCommand): Boolean =
    sessionRevision != command.expectedSessionRevision ||
        recordDraftRevision != command.expectedDraftRevision ||
        liveRecordRevision != command.expectedLiveRevision ||
        exposureRevision != command.expectedExposureRevision ||
        publicationRevision != command.expectedPublicationRevision

private fun requireHost(host: CurrentMember) {
    if (!host.isHost) throw AccessDeniedException("Host role required")
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

private fun draftStale() = SessionRecordException(SessionRecordError.DRAFT_STALE, "Session record draft is stale")

private fun liveStale() = SessionRecordException(SessionRecordError.LIVE_STALE, "Session record live revision is stale")

private fun notFound() = SessionRecordException(SessionRecordError.SESSION_NOT_FOUND, "Session record not found")

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
