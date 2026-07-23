package com.readmates.sessionrecord.application.service

import com.readmates.auth.domain.MembershipRole
import com.readmates.notification.application.model.CompleteHostActionDecisionCommand
import com.readmates.notification.application.model.HostActionDecisionCommand
import com.readmates.notification.application.model.HostActionPreview
import com.readmates.notification.application.model.HostActionPreviewCommand
import com.readmates.notification.application.model.HostActionTargetCounts
import com.readmates.notification.application.model.HostConfirmedAction
import com.readmates.notification.application.model.NotificationDecision
import com.readmates.notification.application.model.PreparedHostActionDecision
import com.readmates.notification.application.model.RecordHostConfirmedNotificationEventCommand
import com.readmates.notification.application.port.`in`.ConfirmHostActionNotificationUseCase
import com.readmates.notification.application.port.`in`.RecordHostConfirmedNotificationEventUseCase
import com.readmates.notification.application.port.out.StoredHostActionDecision
import com.readmates.notification.domain.NotificationEventType
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.sessionimport.application.model.SessionImportCommitResult
import com.readmates.sessionimport.application.model.SessionImportCommittedFeedbackDocument
import com.readmates.sessionimport.application.model.SessionImportPreviewResult
import com.readmates.sessionimport.application.port.`in`.ReplaceValidatedSessionImportUseCase
import com.readmates.sessionimport.application.port.`in`.ValidateSessionImportUseCase
import com.readmates.sessionimport.application.port.`in`.ValidatedSessionImportReplacement
import com.readmates.sessionrecord.application.model.ApplySessionRecordCommand
import com.readmates.sessionrecord.application.model.CompletedSessionRecordApply
import com.readmates.sessionrecord.application.model.EncodedSessionRecordSnapshot
import com.readmates.sessionrecord.application.model.LiveSessionRecord
import com.readmates.sessionrecord.application.model.PreviewSessionRecordApplyCommand
import com.readmates.sessionrecord.application.model.RestoreSessionRecordDraftCommand
import com.readmates.sessionrecord.application.model.SaveSessionRecordDraftCommand
import com.readmates.sessionrecord.application.model.SessionRecordDraft
import com.readmates.sessionrecord.application.model.SessionRecordDraftSource
import com.readmates.sessionrecord.application.model.SessionRecordEditor
import com.readmates.sessionrecord.application.model.SessionRecordEntry
import com.readmates.sessionrecord.application.model.SessionRecordError
import com.readmates.sessionrecord.application.model.SessionRecordException
import com.readmates.sessionrecord.application.model.SessionRecordFeedbackDocument
import com.readmates.sessionrecord.application.model.SessionRecordRevision
import com.readmates.sessionrecord.application.model.SessionRecordSnapshot
import com.readmates.sessionrecord.application.model.SessionRecordSource
import com.readmates.sessionrecord.application.port.out.SessionRecordStorePort
import com.readmates.shared.security.AuthenticatedClubActor
import com.readmates.shared.security.CurrentMember
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import tools.jackson.databind.json.JsonMapper
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

@Tag("unit")
class SessionRecordApplyServiceTest {
    @Test
    fun `apply creates revision and receipt without notification decision or outbox`() {
        val fixture = Fixture(liveRevision = 3)

        val result = fixture.applyContentOnly()

        assertEquals(4L, result.liveRevision)
        assertEquals(fixture.sessionId, result.composer.sessionId)
        assertEquals(1, fixture.store.receipts.size)
        assertTrue(fixture.recorder.commands.isEmpty())
    }

    @Test
    fun `apply validates and replaces the full record package`() {
        val fixture = Fixture()

        fixture.apply()

        assertEquals(1, fixture.validator.calls)
        assertEquals(fixture.draft.snapshot, fixture.replacer.lastSnapshot)
        assertEquals(
            mapOf("Host" to fixture.host.membershipId),
            fixture.validator.lastTrustedBindings,
        )
        assertEquals(
            mapOf("Host" to fixture.host.membershipId),
            fixture.validator.lastHistoricalBindings,
        )
        assertTrue(fixture.replacer.committed)
    }

    @Test
    fun `apply uses one validation canonical snapshot for replacement and immutable revision`() {
        val fixture = Fixture(draftPublicationSummary = "  Summary  ")

        fixture.apply()

        assertEquals("Summary", fixture.replacer.lastSnapshot?.publicationSummary)
        assertEquals(
            "Summary",
            fixture.store.revisions
                .last()
                .snapshot.publicationSummary,
        )
    }

    @Test
    fun `first apply writes a baseline then a new immutable revision`() {
        val fixture = Fixture(liveRevision = 0)

        val result = fixture.apply()

        assertEquals(
            listOf(SessionRecordSource.BASELINE, SessionRecordSource.MANUAL),
            fixture.store.revisions.map { it.source },
        )
        assertEquals(listOf(1L, 2L), fixture.store.revisions.map { it.version })
        assertEquals(2L, result.liveRevision)
        assertNull(fixture.store.draft)
    }

    @Test
    fun `first visible feedback apply selects feedback published event`() {
        val fixture = Fixture(liveFeedback = "", liveRevision = 0)

        val preview = fixture.preview()

        assertEquals(NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED, preview.eventType)
    }

    @Test
    fun `later visible record apply selects session record updated event`() {
        val fixture = Fixture(liveFeedback = "Previously visible", liveRevision = 3)

        val preview = fixture.preview()

        assertEquals(NotificationEventType.SESSION_RECORD_UPDATED, preview.eventType)
    }

    @Test
    fun `stale live or draft revision leaves every store unchanged`() {
        val draftStale = Fixture(liveRevision = 3)
        val liveStale = Fixture(liveRevision = 3)

        assertThrows(SessionRecordException::class.java) {
            draftStale.apply(expectedDraftRevision = draftStale.draft.draftRevision - 1)
        }.also { assertEquals(SessionRecordError.DRAFT_STALE, it.error) }
        assertThrows(SessionRecordException::class.java) {
            liveStale.apply(expectedLiveRevision = 2)
        }.also { assertEquals(SessionRecordError.LIVE_STALE, it.error) }

        listOf(draftStale, liveStale).forEach {
            assertFalse(it.replacer.committed)
            assertTrue(it.store.revisions.isEmpty())
            assertNotNull(it.store.draft)
            assertTrue(it.gate.prepared.isEmpty())
        }
    }

    @Test
    fun `session metadata drift rejects preview and apply before notification preparation`() {
        val fixture =
            Fixture(
                liveSessionUpdatedAt = TEST_NOW.plusSeconds(1),
                draftBaseSessionUpdatedAt = TEST_NOW,
            )

        assertThrows(SessionRecordException::class.java) {
            fixture.preview()
        }.also { assertEquals(SessionRecordError.LIVE_STALE, it.error) }
        assertThrows(SessionRecordException::class.java) {
            fixture.apply()
        }.also { assertEquals(SessionRecordError.LIVE_STALE, it.error) }

        assertTrue(fixture.gate.prepared.isEmpty())
        assertFalse(fixture.replacer.committed)
        assertNotNull(fixture.store.draft)
    }

    @Test
    fun `restore apply records restored from revision`() {
        val restoredFrom = UUID.randomUUID()
        val fixture = Fixture(draftSource = SessionRecordDraftSource.RESTORED, restoredFromRevisionId = restoredFrom)

        fixture.apply()

        val applied = fixture.store.revisions.last()
        assertEquals(SessionRecordSource.RESTORED, applied.source)
        assertEquals(restoredFrom, applied.restoredFromRevisionId)
    }

}

private val TEST_NOW = OffsetDateTime.of(2026, 7, 23, 0, 0, 0, 0, ZoneOffset.UTC)

private class Fixture(
    liveRevision: Long = 0,
    liveFeedback: String = "",
    draftSource: SessionRecordDraftSource = SessionRecordDraftSource.MANUAL,
    restoredFromRevisionId: UUID? = null,
    draftPublicationSummary: String = "Summary",
    liveSessionUpdatedAt: OffsetDateTime = TEST_NOW,
    draftBaseSessionUpdatedAt: OffsetDateTime = liveSessionUpdatedAt,
) {
    val clubId: UUID = UUID.randomUUID()
    val sessionId: UUID = UUID.randomUUID()
    val previewId: UUID = UUID.randomUUID()
    val decisionId: UUID = UUID.randomUUID()
    val host: CurrentMember =
        CurrentMember(
            userId = UUID.randomUUID(),
            membershipId = UUID.randomUUID(),
            clubId = clubId,
            clubSlug = "apply-test",
            email = "host@example.test",
            displayName = "Host",
            accountName = "host",
            role = MembershipRole.HOST,
        )
    private val now = TEST_NOW
    private val live =
        LiveSessionRecord(
            sessionId = sessionId,
            clubId = clubId,
            revision = liveRevision,
            snapshot = snapshot(feedback = liveFeedback),
            sessionNumber = 28,
            bookTitle = "Apply Test Book",
            meetingDate = LocalDate.of(2026, 7, 23),
            sessionUpdatedAt = liveSessionUpdatedAt,
        )
    val draft =
        SessionRecordDraft(
            sessionId = sessionId,
            clubId = clubId,
            baseLiveRevision = liveRevision,
            draftRevision = 2,
            source = draftSource,
            restoredFromRevisionId = restoredFromRevisionId,
            snapshot =
                snapshot(feedback = "Draft feedback")
                    .copy(publicationSummary = draftPublicationSummary),
            updatedByMembershipId = host.membershipId,
            createdAt = now,
            updatedAt = now,
            baseSessionUpdatedAt = draftBaseSessionUpdatedAt,
        )
    private val codec = SessionRecordSnapshotCodec(JsonMapper.builder().findAndAddModules().build())
    val store = FakeApplyStore(live, draft, now, codec)
    val validator = FakeValidator()
    val replacer = FakeReplacer()
    val gate = FakeGate(previewId, decisionId, now)
    val recorder = FakeRecorder()
    private val service =
        SessionRecordApplyService(
            store = store,
            codec = codec,
            validator = validator,
            replacer = replacer,
        )

    init {
        store.onCommit = replacer::commit
    }

    fun preview() =
        service.preview(
            host,
            PreviewSessionRecordApplyCommand(sessionId, draft.draftRevision, live.revision),
        )

    fun apply(
        decision: NotificationDecision = NotificationDecision.SKIP,
        expectedDraftRevision: Long = draft.draftRevision,
        expectedLiveRevision: Long = live.revision,
    ) = service.apply(
        host,
        ApplySessionRecordCommand(
            sessionId,
            previewId,
            expectedDraftRevision,
            expectedLiveRevision,
            codec.encode(draft.snapshot).sha256,
        ),
    )

    fun applyContentOnly() =
        service.apply(
            host,
            ApplySessionRecordCommand(
                sessionId = sessionId,
                applyRequestId = UUID.randomUUID(),
                expectedDraftRevision = draft.draftRevision,
                expectedLiveRevision = live.revision,
                expectedDraftHash = codec.encode(draft.snapshot).sha256,
            ),
        )

    fun appliedRevision(version: Long) =
        SessionRecordRevision(
            id = UUID.randomUUID(),
            sessionId = sessionId,
            clubId = clubId,
            version = version,
            source = SessionRecordSource.MANUAL,
            restoredFromRevisionId = null,
            snapshot = draft.snapshot,
            appliedByMembershipId = host.membershipId,
            appliedAt = now,
        )

    private fun snapshot(feedback: String) =
        SessionRecordSnapshot(
            visibility = SessionRecordVisibility.MEMBER,
            publicationSummary = "Summary",
            highlights = listOf(SessionRecordEntry(host.membershipId, "Host", "Highlight")),
            oneLineReviews = listOf(SessionRecordEntry(host.membershipId, "Host", "One line")),
            feedbackDocument = SessionRecordFeedbackDocument("feedback.md", "Feedback", feedback),
        )
}

private class FakeApplyStore(
    private val live: LiveSessionRecord,
    initialDraft: SessionRecordDraft,
    private val now: OffsetDateTime,
    private val codec: SessionRecordSnapshotCodec,
) : SessionRecordStorePort {
    var draft: SessionRecordDraft? = initialDraft
    var completed: CompletedSessionRecordApply? = null
    var completedAfterLock: CompletedSessionRecordApply? = null
    val revisions = mutableListOf<SessionRecordRevision>()
    val receipts = mutableListOf<com.readmates.sessionrecord.application.model.SessionRecordApplyReceipt>()
    private val stagedRevisions = mutableListOf<SessionRecordRevision>()
    var onCommit: () -> Unit = {}

    override fun lockEditor(
        host: AuthenticatedClubActor,
        sessionId: UUID,
    ): SessionRecordEditor? {
        completed = completedAfterLock ?: completed
        return SessionRecordEditor(live, draft, draftLiveBaseStale = false)
    }

    override fun findCompletedApply(
        host: AuthenticatedClubActor,
        previewId: UUID,
    ): CompletedSessionRecordApply? = completed

    override fun findApplyReceipt(
        host: AuthenticatedClubActor,
        applyRequestId: UUID,
    ) = receipts.firstOrNull { it.applyRequestId == applyRequestId }

    override fun insertApplyReceipt(
        host: AuthenticatedClubActor,
        command: ApplySessionRecordCommand,
        draftSha256: String,
        composerEventType: NotificationEventType,
        revision: SessionRecordRevision,
    ) = com.readmates.sessionrecord.application.model.SessionRecordApplyReceipt(
        command.applyRequestId,
        command.expectedDraftRevision,
        command.expectedLiveRevision,
        draftSha256,
        composerEventType,
        revision,
    ).also(receipts::add)

    override fun insertBaselineIfAbsent(
        host: AuthenticatedClubActor,
        live: LiveSessionRecord,
        encoded: EncodedSessionRecordSnapshot,
    ) {
        if (live.revision == 0L) {
            stagedRevisions += revision(host, live.snapshot, 1, SessionRecordSource.BASELINE, null)
        }
    }

    override fun insertAppliedRevision(
        host: AuthenticatedClubActor,
        editor: SessionRecordEditor,
        encoded: EncodedSessionRecordSnapshot,
    ): SessionRecordRevision {
        val version = if (editor.live.revision == 0L) 2 else editor.live.revision + 1
        val source = SessionRecordSource.valueOf(requireNotNull(editor.draft).source.name)
        return revision(host, codec.decode(encoded.json), version, source, editor.draft.restoredFromRevisionId)
            .also(stagedRevisions::add)
    }

    override fun deleteAppliedDraft(
        host: AuthenticatedClubActor,
        sessionId: UUID,
        expectedDraftRevision: Long,
    ): Boolean {
        if (draft?.draftRevision != expectedDraftRevision) return false
        revisions += stagedRevisions
        stagedRevisions.clear()
        draft = null
        onCommit()
        return true
    }

    override fun loadLive(
        host: AuthenticatedClubActor,
        sessionId: UUID,
        forUpdate: Boolean,
    ) = live

    override fun loadDraft(
        host: AuthenticatedClubActor,
        sessionId: UUID,
        forUpdate: Boolean,
    ) = draft

    override fun insertDraft(
        host: AuthenticatedClubActor,
        live: LiveSessionRecord,
        command: SaveSessionRecordDraftCommand,
        encoded: EncodedSessionRecordSnapshot,
    ) = requireNotNull(draft)

    override fun compareAndSetDraft(
        host: AuthenticatedClubActor,
        command: SaveSessionRecordDraftCommand,
        encoded: EncodedSessionRecordSnapshot,
    ) = draft

    override fun deleteDraft(
        host: AuthenticatedClubActor,
        sessionId: UUID,
        expectedDraftRevision: Long,
    ) = false

    override fun loadRevision(
        host: AuthenticatedClubActor,
        sessionId: UUID,
        revisionId: UUID,
    ) = null

    override fun insertRestoredDraft(
        host: AuthenticatedClubActor,
        live: LiveSessionRecord,
        revision: SessionRecordRevision,
        expectedDraftRevision: Long?,
        encoded: EncodedSessionRecordSnapshot,
    ) = draft

    private fun revision(
        host: AuthenticatedClubActor,
        snapshot: SessionRecordSnapshot,
        version: Long,
        source: SessionRecordSource,
        restoredFrom: UUID?,
    ) = SessionRecordRevision(
        UUID.randomUUID(),
        live.sessionId,
        live.clubId,
        version,
        source,
        restoredFrom,
        snapshot,
        host.membershipId,
        now,
    )
}

private class FakeValidator : ValidateSessionImportUseCase {
    var calls = 0
    var lastTrustedBindings: Map<String, UUID> = emptyMap()
    var lastHistoricalBindings: Map<String, UUID> = emptyMap()

    override fun validate(
        command: com.readmates.sessionimport.application.model.SessionImportCommand,
        trustedAuthorBindings: Map<String, UUID>,
        historicalAuthorBindings: Map<String, UUID>,
        trustAuthorDisplayNames: Boolean,
    ): SessionImportPreviewResult {
        calls += 1
        lastTrustedBindings = trustedAuthorBindings
        lastHistoricalBindings = historicalAuthorBindings
        return command.validPreview(trustedAuthorBindings)
    }
}

private class FakeReplacer : ReplaceValidatedSessionImportUseCase {
    var lastSnapshot: SessionRecordSnapshot? = null
    var committed = false

    override fun replace(input: ValidatedSessionImportReplacement): SessionImportCommitResult {
        lastSnapshot = input.snapshot
        return input.preview.commitResult()
    }

    fun commit() {
        committed = true
    }
}

private class FakeGate(
    private val previewId: UUID,
    private val decisionId: UUID,
    private val now: OffsetDateTime,
) : ConfirmHostActionNotificationUseCase {
    var lastPreview: HostActionPreviewCommand? = null
    val prepared = mutableListOf<HostActionDecisionCommand>()
    val completed = mutableListOf<CompleteHostActionDecisionCommand>()

    override fun preview(
        host: CurrentMember,
        command: HostActionPreviewCommand,
    ): HostActionPreview {
        lastPreview = command
        return HostActionPreview(previewId, 2, 2, 1, 1, now.plusMinutes(5))
    }

    override fun prepare(
        host: CurrentMember,
        command: HostActionDecisionCommand,
    ): PreparedHostActionDecision {
        prepared += command
        return PreparedHostActionDecision(
            command.previewId,
            host.clubId,
            command.sessionId,
            host.membershipId,
            HostConfirmedAction.SESSION_RECORD_APPLY,
            command.eventType,
            command.decision,
            HostActionTargetCounts(2, 2, 1, 1),
        )
    }

    override fun complete(command: CompleteHostActionDecisionCommand): StoredHostActionDecision {
        completed += command
        return StoredHostActionDecision(
            decisionId,
            command.prepared.previewId,
            command.prepared.clubId,
            command.prepared.sessionId,
            command.prepared.hostMembershipId,
            command.prepared.action,
            command.prepared.eventType,
            command.liveRevision,
            command.prepared.decision,
            command.prepared.counts,
            command.eventId,
            now,
        )
    }
}

private class FakeRecorder : RecordHostConfirmedNotificationEventUseCase {
    val commands = mutableListOf<RecordHostConfirmedNotificationEventCommand>()
    var failure: RuntimeException? = null

    override fun record(command: RecordHostConfirmedNotificationEventCommand): UUID {
        failure?.let { throw it }
        commands += command
        return UUID.randomUUID()
    }
}

@Suppress("MaxLineLength")
private fun com.readmates.sessionimport.application.model.SessionImportCommand.validPreview(trustedAuthorBindings: Map<String, UUID>) =
    SessionImportPreviewResult(
        valid = true,
        session =
            com.readmates.sessionimport.application.model.SessionImportSessionPreview(
                session.number,
                session.bookTitle,
                session.meetingDate.toString(),
            ),
        publication =
            com.readmates.sessionimport.application.model.SessionImportPublicationPreview(
                publication.summary.trim(),
            ),
        highlights =
            highlights.map {
                com.readmates.sessionimport.application.model.SessionImportRecordPreview(
                    it.authorName,
                    it.text.trim(),
                    true,
                    trustedAuthorBindings.getValue(it.authorName).toString(),
                )
            },
        oneLineReviews =
            oneLineReviews.map {
                com.readmates.sessionimport.application.model.SessionImportRecordPreview(
                    it.authorName,
                    it.text.trim(),
                    true,
                    trustedAuthorBindings.getValue(it.authorName).toString(),
                )
            },
        feedbackDocument =
            com.readmates.sessionimport.application.model.SessionImportFeedbackDocumentPreview(
                feedbackDocument.fileName,
                "Feedback",
                true,
            ),
        issues = emptyList(),
    )

private fun SessionImportPreviewResult.commitResult() =
    SessionImportCommitResult(
        sessionId = UUID.randomUUID().toString(),
        publication = publication,
        highlights = highlights,
        oneLineReviews = oneLineReviews,
        feedbackDocument =
            SessionImportCommittedFeedbackDocument(
                uploaded = true,
                fileName = feedbackDocument.fileName,
                title = requireNotNull(feedbackDocument.title),
                uploadedAt = "2026-07-23T00:00:00Z",
            ),
    )
