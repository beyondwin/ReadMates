package com.readmates.sessionrecord.application.service

import com.readmates.auth.domain.MembershipRole
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.sessionrecord.application.model.EncodedSessionRecordSnapshot
import com.readmates.sessionrecord.application.model.LiveSessionRecord
import com.readmates.sessionrecord.application.model.RestoreSessionRecordDraftCommand
import com.readmates.sessionrecord.application.model.SaveSessionRecordDraftCommand
import com.readmates.sessionrecord.application.model.SessionRecordDraft
import com.readmates.sessionrecord.application.model.SessionRecordDraftSource
import com.readmates.sessionrecord.application.model.SessionRecordEditor
import com.readmates.sessionrecord.application.model.SessionRecordError
import com.readmates.sessionrecord.application.model.SessionRecordException
import com.readmates.sessionrecord.application.model.SessionRecordFeedbackDocument
import com.readmates.sessionrecord.application.model.SessionRecordRevision
import com.readmates.sessionrecord.application.model.SessionRecordSnapshot
import com.readmates.sessionrecord.application.model.SessionRecordSource
import com.readmates.sessionrecord.application.port.out.SessionRecordStorePort
import com.readmates.shared.security.CurrentMember
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID
import tools.jackson.databind.json.JsonMapper

class SessionRecordDraftServiceTest {
    private val host = host()
    private val sessionId = UUID.randomUUID()
    private val codec = SessionRecordSnapshotCodec(JsonMapper.builder().findAndAddModules().build())

    @Test
    fun `first save copies live content into draft revision one without creating history`() {
        val store = FakeStore(live = live())
        val service = SessionRecordDraftService(store, codec)

        val saved =
            service.save(
                host,
                SaveSessionRecordDraftCommand(sessionId, snapshot(), expectedDraftRevision = null),
            )

        assertThat(saved.draftRevision).isEqualTo(1)
        assertThat(saved.baseLiveRevision).isEqualTo(4)
        assertThat(saved.snapshot).isEqualTo(snapshot())
        assertThat(store.revisions).isEmpty()
    }

    @Test
    fun `save rejects stale expected draft revision without overwriting`() {
        val store = FakeStore(live = live(), draft = draft(draftRevision = 2))
        val service = SessionRecordDraftService(store, codec)
        val before = store.state()

        assertThatThrownBy {
            service.save(host, SaveSessionRecordDraftCommand(sessionId, changedSnapshot(), expectedDraftRevision = 1))
        }.isInstanceOf(SessionRecordException::class.java)
            .extracting { (it as SessionRecordException).error }
            .isEqualTo(SessionRecordError.DRAFT_STALE)

        assertThat(store.state()).isEqualTo(before)
    }

    @Test
    fun `discard requires the current draft revision`() {
        val store = FakeStore(live = live(), draft = draft(draftRevision = 2))
        val service = SessionRecordDraftService(store, codec)
        val before = store.state()

        assertThatThrownBy { service.discard(host, sessionId, expectedDraftRevision = 1) }
            .isInstanceOf(SessionRecordException::class.java)
            .extracting { (it as SessionRecordException).error }
            .isEqualTo(SessionRecordError.DRAFT_STALE)

        assertThat(store.state()).isEqualTo(before)
    }

    @Test
    fun `restore copies immutable revision into a new draft and leaves live unchanged`() {
        val revision = revision()
        val store = FakeStore(live = live(), revision = revision)
        val service = SessionRecordDraftService(store, codec)
        val liveBefore = store.live

        val restored =
            service.restore(
                host,
                RestoreSessionRecordDraftCommand(
                    sessionId,
                    revision.id,
                    expectedDraftRevision = null,
                ),
            )

        assertThat(restored.source).isEqualTo(SessionRecordDraftSource.RESTORED)
        assertThat(restored.restoredFromRevisionId).isEqualTo(revision.id)
        assertThat(restored.snapshot).isEqualTo(revision.snapshot)
        assertThat(store.live).isEqualTo(liveBefore)
    }

    @Test
    fun `basic metadata drift marks draft live base stale`() {
        val store = FakeStore(live = live(revision = 5), draft = draft(baseLiveRevision = 4))
        val service = SessionRecordDraftService(store, codec)

        val editor: SessionRecordEditor = service.getEditor(host, sessionId)

        assertThat(editor.draftLiveBaseStale).isTrue()
    }

    private fun live(revision: Long = 4) = LiveSessionRecord(sessionId, host.clubId, revision, snapshot())

    private fun draft(
        baseLiveRevision: Long = 4,
        draftRevision: Long = 1,
    ) = SessionRecordDraft(
        sessionId = sessionId,
        clubId = host.clubId,
        baseLiveRevision = baseLiveRevision,
        draftRevision = draftRevision,
        source = SessionRecordDraftSource.MANUAL,
        restoredFromRevisionId = null,
        snapshot = snapshot(),
        updatedByMembershipId = host.membershipId,
        createdAt = NOW,
        updatedAt = NOW,
    )

    private fun revision() = SessionRecordRevision(
        id = UUID.randomUUID(),
        sessionId = sessionId,
        clubId = host.clubId,
        version = 3,
        source = SessionRecordSource.MANUAL,
        restoredFromRevisionId = null,
        snapshot = changedSnapshot(),
        appliedByMembershipId = host.membershipId,
        appliedAt = NOW,
    )

    private fun snapshot(summary: String = "요약") = SessionRecordSnapshot(
        visibility = SessionRecordVisibility.MEMBER,
        publicationSummary = summary,
        highlights = emptyList(),
        oneLineReviews = emptyList(),
        feedbackDocument = SessionRecordFeedbackDocument("feedback.md", "피드백", "# 피드백"),
    )

    private fun changedSnapshot() = snapshot("수정 요약")

    private fun host() = CurrentMember(
        userId = UUID.randomUUID(),
        membershipId = UUID.randomUUID(),
        clubId = UUID.randomUUID(),
        clubSlug = "test-club",
        email = "host@example.com",
        displayName = "호스트",
        accountName = "host",
        role = MembershipRole.HOST,
    )

    private inner class FakeStore(
        var live: LiveSessionRecord?,
        var draft: SessionRecordDraft? = null,
        revision: SessionRecordRevision? = null,
    ) : SessionRecordStorePort {
        val revisions = revision?.let(::listOf).orEmpty()

        override fun lockEditor(host: CurrentMember, sessionId: UUID): SessionRecordEditor? =
            live?.let { SessionRecordEditor(it, draft, draft?.baseLiveRevision != it.revision) }

        override fun findCompletedApply(
            host: CurrentMember,
            previewId: UUID,
        ): com.readmates.sessionrecord.application.model.CompletedSessionRecordApply? = null

        override fun insertBaselineIfAbsent(
            host: CurrentMember,
            live: LiveSessionRecord,
            encoded: EncodedSessionRecordSnapshot,
        ) = Unit

        override fun insertAppliedRevision(
            host: CurrentMember,
            editor: SessionRecordEditor,
            encoded: EncodedSessionRecordSnapshot,
        ): SessionRecordRevision = error("Not used by draft service tests")

        override fun deleteAppliedDraft(
            host: CurrentMember,
            sessionId: UUID,
            expectedDraftRevision: Long,
        ): Boolean = false

        override fun loadLive(host: CurrentMember, sessionId: UUID, forUpdate: Boolean) = live

        override fun loadDraft(host: CurrentMember, sessionId: UUID, forUpdate: Boolean) = draft

        override fun insertDraft(
            host: CurrentMember,
            live: LiveSessionRecord,
            encoded: EncodedSessionRecordSnapshot,
        ): SessionRecordDraft =
            draft(
                live = live,
                encoded = encoded,
                source = SessionRecordDraftSource.MANUAL,
                restoredFromRevisionId = null,
            ).also { draft = it }

        @Suppress("ReturnCount")
        override fun compareAndSetDraft(
            host: CurrentMember,
            command: SaveSessionRecordDraftCommand,
            encoded: EncodedSessionRecordSnapshot,
        ): SessionRecordDraft? {
            val current = draft ?: return null
            if (current.draftRevision != command.expectedDraftRevision) return null
            return current.copy(
                draftRevision = current.draftRevision + 1,
                source = command.source,
                restoredFromRevisionId = command.restoredFromRevisionId,
                snapshot = codec.decode(encoded.json),
                updatedAt = NOW,
            ).also { draft = it }
        }

        @Suppress("ReturnCount")
        override fun deleteDraft(host: CurrentMember, sessionId: UUID, expectedDraftRevision: Long): Boolean {
            val current = draft ?: return false
            if (current.draftRevision != expectedDraftRevision) return false
            draft = null
            return true
        }

        override fun loadRevision(host: CurrentMember, sessionId: UUID, revisionId: UUID) =
            revisions.singleOrNull { it.id == revisionId }

        override fun insertRestoredDraft(
            host: CurrentMember,
            live: LiveSessionRecord,
            revision: SessionRecordRevision,
            expectedDraftRevision: Long?,
            encoded: EncodedSessionRecordSnapshot,
        ): SessionRecordDraft? {
            if (draft?.draftRevision != expectedDraftRevision) return null
            return draft(
                live = live,
                encoded = encoded,
                source = SessionRecordDraftSource.RESTORED,
                restoredFromRevisionId = revision.id,
            ).also { draft = it }
        }

        fun state() = live to draft

        private fun draft(
            live: LiveSessionRecord,
            encoded: EncodedSessionRecordSnapshot,
            source: SessionRecordDraftSource,
            restoredFromRevisionId: UUID?,
        ) = SessionRecordDraft(
            sessionId = live.sessionId,
            clubId = live.clubId,
            baseLiveRevision = live.revision,
            draftRevision = (draft?.draftRevision ?: 0) + 1,
            source = source,
            restoredFromRevisionId = restoredFromRevisionId,
            snapshot = codec.decode(encoded.json),
            updatedByMembershipId = host.membershipId,
            createdAt = draft?.createdAt ?: NOW,
            updatedAt = NOW,
        )
    }

    private companion object {
        val NOW: OffsetDateTime = OffsetDateTime.of(2026, 7, 23, 0, 0, 0, 0, ZoneOffset.UTC)
    }
}
