package com.readmates.sessionrecord.application.service

import com.readmates.auth.domain.MembershipRole
import com.readmates.notification.application.port.`in`.ConfirmHostActionNotificationUseCase
import com.readmates.notification.application.port.`in`.RecordHostConfirmedNotificationEventUseCase
import com.readmates.notification.domain.NotificationEventType
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.sessionrecord.adapter.out.codec.JacksonSessionRecordSnapshotCodec
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
import com.readmates.sessionrecord.application.port.out.ReplaceSessionRecordContentPort
import com.readmates.sessionrecord.application.port.out.SessionRecordContentReplacement
import com.readmates.sessionrecord.application.port.out.SessionRecordContentReplacementResult
import com.readmates.sessionrecord.application.port.out.SessionRecordSnapshotCodec
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
        assertApplyHasNoNotificationDispatchCollaborator()
    }

    @Test
    fun `apply validates and replaces the full record package`() {
        val fixture = Fixture()

        fixture.apply()

        assertEquals(fixture.draft.snapshot, fixture.replacer.lastInput?.snapshot)
        assertEquals(fixture.host, fixture.replacer.lastInput?.host)
        assertEquals(fixture.sessionId, fixture.replacer.lastInput?.sessionId)
        assertEquals(28, fixture.replacer.lastInput?.sessionNumber)
        assertEquals("Apply Test Book", fixture.replacer.lastInput?.bookTitle)
        assertEquals(LocalDate.of(2026, 7, 23), fixture.replacer.lastInput?.meetingDate)
        assertEquals(fixture.draft.source, fixture.replacer.lastInput?.source)
        assertEquals(
            mapOf("Host" to fixture.host.membershipId),
            fixture.replacer.lastInput?.trustedAuthorBindings,
        )
        assertEquals(
            mapOf("Host" to fixture.host.membershipId),
            fixture.replacer.lastInput?.historicalAuthorBindings,
        )
        assertTrue(fixture.replacer.committed)
    }

    @Test
    fun `apply uses one validation canonical snapshot for replacement and immutable revision`() {
        val fixture = Fixture(draftPublicationSummary = "  Summary  ")

        fixture.apply()

        assertEquals(
            "  Summary  ",
            fixture.replacer.lastInput
                ?.snapshot
                ?.publicationSummary,
        )
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
            assertTrue(it.store.receipts.isEmpty())
            assertNotNull(it.store.draft)
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

        assertTrue(fixture.store.receipts.isEmpty())
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

    @Test
    fun `exact apply request replay returns the original revision`() {
        val fixture = Fixture(liveRevision = 3)
        val command = fixture.command()

        val first = fixture.apply(command)
        val replay = fixture.apply(command)

        assertEquals(first, replay)
        assertEquals(1, fixture.store.receipts.size)
        assertEquals(1, fixture.replacer.calls)
    }

    @Test
    fun `same session apply request with a different contract returns conflict`() {
        val fixture = Fixture(liveRevision = 3)
        val command = fixture.command()
        fixture.apply(command)

        val error =
            assertThrows(SessionRecordException::class.java) {
                fixture.apply(command.copy(expectedDraftHash = "f".repeat(64)))
            }

        assertEquals(SessionRecordError.APPLY_REQUEST_ALREADY_USED, error.error)
        assertEquals(1, fixture.store.receipts.size)
    }

    @Test
    fun `same session apply request replay by another host returns conflict`() {
        val fixture = Fixture(liveRevision = 3)
        val command = fixture.command()
        fixture.apply(command)
        val anotherHost = fixture.host.copy(membershipId = UUID.randomUUID())

        val error =
            assertThrows(SessionRecordException::class.java) {
                fixture.apply(command, anotherHost)
            }

        assertEquals(SessionRecordError.APPLY_REQUEST_ALREADY_USED, error.error)
        assertEquals(1, fixture.store.receipts.size)
    }

    @Test
    fun `applied revision failure happens after live replacement and before receipt or draft deletion`() {
        val fixture = Fixture()
        fixture.store.failOnAppliedRevisionInsert = true

        assertThrows(IllegalStateException::class.java) {
            fixture.apply()
        }

        assertEquals(
            listOf("baseline", "live replacement", "applied revision"),
            fixture.store.operations,
        )
        assertNotNull(fixture.replacer.lastInput)
        assertTrue(fixture.store.receipts.isEmpty())
        assertNotNull(fixture.store.draft)
    }

    @Test
    fun `invalid replacement leaves record store unchanged`() {
        val fixture = Fixture(liveRevision = 3)
        fixture.replacer.invalid = true

        assertThrows(SessionRecordException::class.java) {
            fixture.apply()
        }.also { assertEquals(SessionRecordError.INVALID_RECORD, it.error) }

        assertEquals(emptyList<String>(), fixture.store.operations)
        assertTrue(fixture.store.revisions.isEmpty())
        assertTrue(fixture.store.receipts.isEmpty())
        assertNotNull(fixture.store.draft)
    }
}

private val TEST_NOW = OffsetDateTime.of(2026, 7, 23, 0, 0, 0, 0, ZoneOffset.UTC)

private fun assertApplyHasNoNotificationDispatchCollaborator() {
    val constructorParameterTypes =
        SessionRecordApplyService::class.java.declaredConstructors
            .flatMap { it.parameterTypes.asIterable() }

    assertFalse(
        constructorParameterTypes.contains(ConfirmHostActionNotificationUseCase::class.java) ||
            constructorParameterTypes.contains(RecordHostConfirmedNotificationEventUseCase::class.java),
    )
}

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
    private val codec = JacksonSessionRecordSnapshotCodec(JsonMapper.builder().findAndAddModules().build())
    val store = FakeApplyStore(live, draft, now, codec)
    val replacer = FakeReplacer { store.operations += "live replacement" }
    private val service =
        SessionRecordApplyService(
            store = store,
            codec = codec,
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

    fun command(applyRequestId: UUID = previewId) =
        ApplySessionRecordCommand(
            sessionId = sessionId,
            applyRequestId = applyRequestId,
            expectedDraftRevision = draft.draftRevision,
            expectedLiveRevision = live.revision,
            expectedDraftHash = codec.encode(draft.snapshot).sha256,
        )

    fun apply(
        command: ApplySessionRecordCommand,
        actor: CurrentMember = host,
    ) = service.apply(actor, command)

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
    val operations = mutableListOf<String>()
    var failOnAppliedRevisionInsert = false
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
        sessionId: UUID,
        applyRequestId: UUID,
        forUpdate: Boolean,
    ) = receipts.firstOrNull {
        it.revision.sessionId == sessionId &&
            it.revision.clubId == host.clubId &&
            it.applyRequestId == applyRequestId
    }

    override fun insertApplyReceipt(
        host: AuthenticatedClubActor,
        command: ApplySessionRecordCommand,
        draftSha256: String,
        composerEventType: NotificationEventType,
        revision: SessionRecordRevision,
    ) = com.readmates.sessionrecord.application.model
        .SessionRecordApplyReceipt(
            command.applyRequestId,
            host.membershipId,
            command.expectedDraftRevision,
            command.expectedLiveRevision,
            draftSha256,
            composerEventType,
            revision,
        ).also {
            operations += "receipt"
            receipts += it
        }

    override fun insertBaselineIfAbsent(
        host: AuthenticatedClubActor,
        live: LiveSessionRecord,
        encoded: EncodedSessionRecordSnapshot,
    ) {
        if (live.revision == 0L) {
            operations += "baseline"
            stagedRevisions += revision(host, live.snapshot, 1, SessionRecordSource.BASELINE, null)
        }
    }

    override fun insertAppliedRevision(
        host: AuthenticatedClubActor,
        editor: SessionRecordEditor,
        encoded: EncodedSessionRecordSnapshot,
    ): SessionRecordRevision {
        operations += "applied revision"
        if (failOnAppliedRevisionInsert) {
            throw IllegalStateException("test-only applied revision failure")
        }
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
        operations += "draft deletion"
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

    override fun rebaseDraft(
        host: AuthenticatedClubActor,
        live: LiveSessionRecord,
        expectedDraftRevision: Long,
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

private class FakeReplacer(
    private val onReplace: () -> Unit = {},
) : ReplaceSessionRecordContentPort {
    var calls = 0
    var lastInput: SessionRecordContentReplacement? = null
    var committed = false
    var invalid = false

    override fun replace(input: SessionRecordContentReplacement): SessionRecordContentReplacementResult {
        calls += 1
        lastInput = input
        if (invalid) return SessionRecordContentReplacementResult.Invalid
        onReplace()
        return SessionRecordContentReplacementResult.Applied(
            input.snapshot.copy(publicationSummary = input.snapshot.publicationSummary.trim()),
        )
    }

    fun commit() {
        committed = true
    }
}
