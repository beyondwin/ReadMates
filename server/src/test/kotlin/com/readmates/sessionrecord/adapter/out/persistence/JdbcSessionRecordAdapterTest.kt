package com.readmates.sessionrecord.adapter.out.persistence

import com.readmates.auth.domain.MembershipRole
import com.readmates.notification.domain.NotificationEventType
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.sessionrecord.application.model.ApplySessionRecordCommand
import com.readmates.sessionrecord.application.model.SaveSessionRecordDraftCommand
import com.readmates.sessionrecord.application.model.SessionRecordEntry
import com.readmates.sessionrecord.application.model.SessionRecordFeedbackDocument
import com.readmates.sessionrecord.application.model.SessionRecordSnapshot
import com.readmates.sessionrecord.application.service.SessionRecordSnapshotCodec
import com.readmates.shared.security.CurrentMember
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.dao.DuplicateKeyException
import org.springframework.jdbc.core.JdbcTemplate
import java.time.LocalDateTime
import java.util.UUID

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Tag("integration")
class JdbcSessionRecordAdapterTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val codec: SessionRecordSnapshotCodec,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val adapter = JdbcSessionRecordAdapter(jdbcTemplate, codec)

    @Test
    fun `draft rows are club scoped and round trip canonical JSON with one active draft`() {
        val first = fixture("first")
        val second = fixture("second")
        val live = requireNotNull(adapter.loadLive(first.host, first.sessionId))
        val persistedSessionUpdatedAt =
            jdbcTemplate.queryForObject(
                "select updated_at from sessions where id = ? and club_id = ?",
                LocalDateTime::class.java,
                first.sessionId.toString(),
                first.host.clubId.toString(),
            )

        assertThat(live.snapshot).isEqualTo(first.snapshot)
        assertThat(live.sessionUpdatedAt.toLocalDateTime()).isEqualTo(persistedSessionUpdatedAt)
        assertThat(adapter.loadLive(second.host, first.sessionId)).isNull()

        val command = SaveSessionRecordDraftCommand(first.sessionId, first.snapshot, null)
        val draft = adapter.insertDraft(first.host, live, command, codec.encode(first.snapshot))

        assertThat(adapter.loadDraft(first.host, first.sessionId)).isEqualTo(draft)
        assertThat(adapter.loadDraft(second.host, first.sessionId)).isNull()
        assertThatThrownBy { adapter.insertDraft(first.host, live, command, codec.encode(first.snapshot)) }
            .isInstanceOf(DuplicateKeyException::class.java)
    }

    @Test
    fun `session metadata changes make the persisted draft base stale`() {
        val fixture = fixture("metadata-stale")
        val live = requireNotNull(adapter.loadLive(fixture.host, fixture.sessionId))
        adapter.insertDraft(
            fixture.host,
            live,
            SaveSessionRecordDraftCommand(fixture.sessionId, fixture.snapshot, null),
            codec.encode(fixture.snapshot),
        )

        jdbcTemplate.update(
            """
            update sessions
            set book_title = '변경된 책',
                updated_at = timestampadd(microsecond, 1, updated_at)
            where id = ? and club_id = ?
            """.trimIndent(),
            fixture.sessionId.toString(),
            fixture.host.clubId.toString(),
        )

        assertThat(requireNotNull(adapter.lockEditor(fixture.host, fixture.sessionId)).draftLiveBaseStale).isTrue()
    }

    @Test
    @Suppress("LongMethod")
    fun `compare and set updates exactly once while revisions remain ordered and immutable`() {
        val fixture = fixture("cas")
        val live = requireNotNull(adapter.loadLive(fixture.host, fixture.sessionId))
        val firstDraft =
            adapter.insertDraft(
                fixture.host,
                live,
                SaveSessionRecordDraftCommand(fixture.sessionId, fixture.snapshot, null),
                codec.encode(fixture.snapshot),
            )
        val changed = fixture.snapshot.copy(publicationSummary = "수정 요약")

        val updated =
            adapter.compareAndSetDraft(
                fixture.host,
                SaveSessionRecordDraftCommand(
                    fixture.sessionId,
                    changed,
                    expectedDraftRevision = firstDraft.draftRevision,
                ),
                codec.encode(changed),
            )
        val stale =
            adapter.compareAndSetDraft(
                fixture.host,
                SaveSessionRecordDraftCommand(
                    fixture.sessionId,
                    fixture.snapshot,
                    expectedDraftRevision = firstDraft.draftRevision,
                ),
                codec.encode(fixture.snapshot),
            )

        assertThat(updated?.draftRevision).isEqualTo(2)
        assertThat(stale).isNull()
        assertThat(adapter.loadDraft(fixture.host, fixture.sessionId)?.snapshot).isEqualTo(changed)

        val older =
            insertRevision(
                fixture,
                version = 1,
                snapshot = fixture.snapshot,
                appliedAt = LocalDateTime.of(2026, 7, 20, 0, 0),
            )
        val newer =
            insertRevision(
                fixture,
                version = 2,
                snapshot = changed,
                appliedAt = LocalDateTime.of(2026, 7, 21, 0, 0),
            )
        val versions =
            jdbcTemplate.queryForList(
                """
                select version
                from session_record_revisions
                where club_id = ? and session_id = ?
                order by applied_at desc, id desc
                """.trimIndent(),
                Long::class.java,
                fixture.host.clubId.toString(),
                fixture.sessionId.toString(),
            )

        assertThat(versions).containsExactly(2, 1)
        assertThat(adapter.loadRevision(fixture.host, fixture.sessionId, older)?.snapshot).isEqualTo(fixture.snapshot)
        assertThat(adapter.loadRevision(fixture.host, fixture.sessionId, newer)?.snapshot).isEqualTo(changed)
        assertThat(
            adapter.loadRevision(
                fixture.host.copy(clubId = UUID.randomUUID()),
                fixture.sessionId,
                newer,
            ),
        ).isNull()
    }

    @Test
    fun `apply persistence writes baseline and immutable revision before deleting the draft`() {
        val fixture = fixture("apply")
        val live = requireNotNull(adapter.loadLive(fixture.host, fixture.sessionId))
        val draft =
            adapter.insertDraft(
                fixture.host,
                live,
                SaveSessionRecordDraftCommand(fixture.sessionId, fixture.snapshot, null),
                codec.encode(fixture.snapshot),
            )
        val editor = requireNotNull(adapter.lockEditor(fixture.host, fixture.sessionId))

        adapter.insertBaselineIfAbsent(fixture.host, live, codec.encode(live.snapshot))
        val applied = adapter.insertAppliedRevision(fixture.host, editor, codec.encode(draft.snapshot))

        assertThat(applied.version).isEqualTo(2)
        assertThat(adapter.deleteAppliedDraft(fixture.host, fixture.sessionId, draft.draftRevision)).isTrue()
        assertThat(adapter.loadDraft(fixture.host, fixture.sessionId)).isNull()
        assertThat(
            jdbcTemplate.queryForList(
                """
                select source
                from session_record_revisions
                where club_id = ? and session_id = ?
                order by version
                """.trimIndent(),
                String::class.java,
                fixture.host.clubId.toString(),
                fixture.sessionId.toString(),
            ),
        ).containsExactly("BASELINE", "MANUAL")
    }

    @Test
    fun `apply receipt replays the same revision and is scoped to its host`() {
        val fixture = fixture("receipt")
        val live = requireNotNull(adapter.loadLive(fixture.host, fixture.sessionId))
        val draft =
            adapter.insertDraft(
                fixture.host,
                live,
                SaveSessionRecordDraftCommand(fixture.sessionId, fixture.snapshot, null),
                codec.encode(fixture.snapshot),
            )
        val editor = requireNotNull(adapter.lockEditor(fixture.host, fixture.sessionId))
        adapter.insertBaselineIfAbsent(fixture.host, live, codec.encode(live.snapshot))
        val revision = adapter.insertAppliedRevision(fixture.host, editor, codec.encode(draft.snapshot))
        val requestId = UUID.randomUUID()
        val command =
            ApplySessionRecordCommand(
                sessionId = fixture.sessionId,
                applyRequestId = requestId,
                expectedDraftRevision = draft.draftRevision,
                expectedLiveRevision = live.revision,
                expectedDraftHash = codec.encode(draft.snapshot).sha256,
            )

        val inserted =
            adapter.insertApplyReceipt(
                fixture.host,
                command,
                command.expectedDraftHash,
                NotificationEventType.SESSION_RECORD_UPDATED,
                revision,
            )

        assertThat(adapter.findApplyReceipt(fixture.host, requestId)).isEqualTo(inserted)
        assertThat(
            adapter.findApplyReceipt(
                fixture.host.copy(membershipId = UUID.randomUUID()),
                requestId,
            ),
        ).isNull()
        assertThat(
            adapter.findApplyReceipt(
                fixture.host.copy(clubId = UUID.randomUUID()),
                requestId,
            ),
        ).isNull()
    }

    @Suppress("LongMethod")
    private fun fixture(label: String): Fixture {
        val clubId = UUID.randomUUID()
        val sessionId = UUID.randomUUID()
        val userId = UUID.randomUUID()
        val membershipId = UUID.randomUUID()
        jdbcTemplate.update(
            "insert into clubs (id, slug, name, tagline, about) values (?, ?, '테스트 클럽', '테스트', '테스트')",
            clubId.toString(),
            "session-record-$label-${clubId.toString().take(8)}",
        )
        jdbcTemplate.update(
            "insert into users (id, email, name, short_name, auth_provider) values (?, ?, '호스트', '호스트', 'PASSWORD')",
            userId.toString(),
            "host-$label-${userId.toString().take(8)}@example.com",
        )
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, short_name, joined_at)
            values (?, ?, ?, 'HOST', 'ACTIVE', '호스트', utc_timestamp(6))
            """.trimIndent(),
            membershipId.toString(),
            clubId.toString(),
            userId.toString(),
        )
        jdbcTemplate.update(
            """
            insert into sessions (id, club_id, number, title, book_title, book_author, session_date, start_time, end_time,
                                  location_label, question_deadline_at, state, visibility)
            values (?, ?, 1, '테스트 회차', '테스트 책', '테스트 저자', '2026-07-20', '19:00:00', '21:00:00',
                    '테스트 장소', '2026-07-19 00:00:00', 'CLOSED', 'MEMBER')
            """.trimIndent(),
            sessionId.toString(),
            clubId.toString(),
        )
        jdbcTemplate.update(
            """
            insert into public_session_publications (id, club_id, session_id, public_summary, is_public, visibility)
            values (?, ?, ?, '요약', false, 'MEMBER')
            """.trimIndent(),
            UUID.randomUUID().toString(),
            clubId.toString(),
            sessionId.toString(),
        )
        jdbcTemplate.update(
            """
            insert into highlights (id, club_id, session_id, membership_id, text, sort_order)
            values (?, ?, ?, ?, '하이라이트', 0)
            """.trimIndent(),
            UUID.randomUUID().toString(),
            clubId.toString(),
            sessionId.toString(),
            membershipId.toString(),
        )
        jdbcTemplate.update(
            """
            insert into one_line_reviews (id, club_id, session_id, membership_id, text, visibility)
            values (?, ?, ?, ?, '한줄평', 'SESSION')
            """.trimIndent(),
            UUID.randomUUID().toString(),
            clubId.toString(),
            sessionId.toString(),
            membershipId.toString(),
        )
        jdbcTemplate.update(
            """
            insert into session_feedback_documents (
              id, club_id, session_id, version, source_text, document_title, file_name, content_type, file_size
            ) values (?, ?, ?, 1, '# 피드백', '피드백', 'feedback.md', 'text/markdown', 12)
            """.trimIndent(),
            UUID.randomUUID().toString(),
            clubId.toString(),
            sessionId.toString(),
        )
        val host =
            CurrentMember(
                userId = userId,
                membershipId = membershipId,
                clubId = clubId,
                clubSlug = "session-record-$label",
                email = "host-$label@example.com",
                displayName = "호스트",
                accountName = "host",
                role = MembershipRole.HOST,
            )
        return Fixture(
            host = host,
            sessionId = sessionId,
            snapshot =
                SessionRecordSnapshot(
                    visibility = SessionRecordVisibility.MEMBER,
                    publicationSummary = "요약",
                    highlights = listOf(SessionRecordEntry(membershipId, "호스트", "하이라이트")),
                    oneLineReviews = listOf(SessionRecordEntry(membershipId, "호스트", "한줄평")),
                    feedbackDocument = SessionRecordFeedbackDocument("feedback.md", "피드백", "# 피드백"),
                ),
        )
    }

    private fun insertRevision(
        fixture: Fixture,
        version: Long,
        snapshot: SessionRecordSnapshot,
        appliedAt: LocalDateTime,
    ): UUID {
        val id = UUID.randomUUID()
        val encoded = codec.encode(snapshot)
        jdbcTemplate.update(
            """
            insert into session_record_revisions (
              id, session_id, club_id, version, source, restored_from_revision_id, snapshot_json, snapshot_sha256,
              applied_by_membership_id, applied_at
            ) values (?, ?, ?, ?, 'MANUAL', null, ?, ?, ?, ?)
            """.trimIndent(),
            id.toString(),
            fixture.sessionId.toString(),
            fixture.host.clubId.toString(),
            version,
            encoded.json,
            encoded.sha256,
            fixture.host.membershipId.toString(),
            appliedAt,
        )
        return id
    }

    private data class Fixture(
        val host: CurrentMember,
        val sessionId: UUID,
        val snapshot: SessionRecordSnapshot,
    )
}
