package com.readmates.sessionimport.application.service

import com.readmates.auth.domain.MembershipRole
import com.readmates.sessionimport.application.model.SessionImportAttendee
import com.readmates.sessionimport.application.model.SessionImportCommand
import com.readmates.sessionimport.application.model.SessionImportFeedbackDocumentCommand
import com.readmates.sessionimport.application.model.SessionImportFeedbackDocumentPreview
import com.readmates.sessionimport.application.model.SessionImportPreviewResult
import com.readmates.sessionimport.application.model.SessionImportPublicationCommand
import com.readmates.sessionimport.application.model.SessionImportPublicationPreview
import com.readmates.sessionimport.application.model.SessionImportRecordCommand
import com.readmates.sessionimport.application.model.SessionImportRecordPreview
import com.readmates.sessionimport.application.model.SessionImportSessionCommand
import com.readmates.sessionimport.application.model.SessionImportSessionPreview
import com.readmates.sessionimport.application.model.SessionImportTarget
import com.readmates.sessionimport.application.port.`in`.SaveValidatedSessionRecordDraftUseCase
import com.readmates.sessionimport.application.port.`in`.ValidateSessionImportUseCase
import com.readmates.sessionimport.application.port.`in`.ValidatedSessionImportDraftInput
import com.readmates.sessionimport.application.port.out.SessionImportRecordReplacement
import com.readmates.sessionimport.application.port.out.SessionImportStoredFeedbackDocument
import com.readmates.sessionimport.application.port.out.SessionImportWritePort
import com.readmates.sessionrecord.application.model.RebaseSessionRecordDraftCommand
import com.readmates.sessionrecord.application.model.RestoreSessionRecordDraftCommand
import com.readmates.sessionrecord.application.model.SaveSessionRecordDraftCommand
import com.readmates.sessionrecord.application.model.SessionRecordDraft
import com.readmates.sessionrecord.application.model.SessionRecordDraftSource
import com.readmates.sessionrecord.application.model.SessionRecordEditor
import com.readmates.sessionrecord.application.model.SessionRecordVisibility
import com.readmates.sessionrecord.application.port.`in`.ManageSessionRecordDraftUseCase
import com.readmates.sessionrecord.application.port.out.ReplaceSessionRecordContentPort
import com.readmates.sessionrecord.application.port.out.SessionRecordContentReplacement
import com.readmates.sessionrecord.application.port.out.SessionRecordContentReplacementResult
import com.readmates.shared.cache.ReadCacheInvalidationPort
import com.readmates.shared.security.AuthenticatedClubActor
import com.readmates.shared.security.CurrentMember
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

class SessionImportDraftServiceTest {
    @Test
    fun `json commit saves a canonical JSON draft and never applies live`() {
        val fixture = Fixture()

        val result = fixture.service.commit(fixture.command)

        assertThat(result.draftRevision).isEqualTo(1)
        assertThat(result.baseLiveRevision).isEqualTo(0)
        assertThat(result.liveApplied).isFalse()
        assertThat(fixture.drafts.savedCommand?.source).isEqualTo(SessionRecordDraftSource.JSON_IMPORT)
        assertThat(
            fixture.drafts.savedCommand
                ?.snapshot
                ?.highlights
                ?.single()
                ?.membershipId,
        ).isEqualTo(fixture.authorMembershipId)
    }

    @Test
    fun `json commit forwards expected draft revision for optimistic replacement`() {
        val fixture = Fixture()

        fixture.service.commit(fixture.command.copy(expectedDraftRevision = 3))

        assertThat(fixture.drafts.savedCommand?.expectedDraftRevision).isEqualTo(3)
    }

    @Test
    fun `ai validated input keeps trusted membership attribution and saves AI draft`() {
        val fixture = Fixture()
        val useCase: SaveValidatedSessionRecordDraftUseCase = fixture.service

        val result =
            useCase.saveValidated(
                ValidatedSessionImportDraftInput(
                    command = fixture.command,
                    authorMembershipIdsByName = mapOf("Member" to fixture.authorMembershipId),
                    source = SessionRecordDraftSource.AI_GENERATED,
                ),
            )

        assertThat(result.liveApplied).isFalse()
        assertThat(fixture.validator.lastTrustedBindings)
            .containsExactlyEntriesOf(mapOf("Member" to fixture.authorMembershipId))
        assertThat(fixture.drafts.savedCommand?.source).isEqualTo(SessionRecordDraftSource.AI_GENERATED)
    }

    @Test
    fun `trusted draft attribution matches historical inactive participant by membership id after rename`() {
        val fixture = Fixture()
        val target =
            SessionImportTarget(
                sessionId = fixture.command.sessionId,
                clubId = fixture.host.clubId,
                sessionNumber = 1,
                bookTitle = "Book",
                meetingDate = LocalDate.of(2026, 7, 23),
                attendees =
                    listOf(
                        SessionImportAttendee(
                            membershipId = fixture.authorMembershipId,
                            displayName = "Renamed Member",
                            active = false,
                        ),
                    ),
            )
        val service = SessionImportService(TargetOnlyWritePort(target))

        val preview =
            service.validate(
                fixture.command,
                mapOf("Member" to fixture.authorMembershipId),
                mapOf("Member" to fixture.authorMembershipId),
            )

        assertThat(preview.highlights.single().authorMatched).isTrue()
        assertThat(preview.highlights.single().membershipId)
            .isEqualTo(fixture.authorMembershipId.toString())
    }

    @Test
    fun `inactive historical participant cannot author changed generated content`() {
        val fixture = Fixture()
        val target =
            SessionImportTarget(
                sessionId = fixture.command.sessionId,
                clubId = fixture.host.clubId,
                sessionNumber = 1,
                bookTitle = "Book",
                meetingDate = LocalDate.of(2026, 7, 23),
                attendees =
                    listOf(
                        SessionImportAttendee(
                            membershipId = fixture.authorMembershipId,
                            displayName = "Renamed Member",
                            active = false,
                        ),
                    ),
            )
        val service = SessionImportService(TargetOnlyWritePort(target))

        val preview =
            service.validate(
                fixture.command.copy(
                    highlights = listOf(SessionImportRecordCommand("Member", "Changed highlight")),
                ),
                mapOf("Member" to fixture.authorMembershipId),
                emptyMap(),
            )

        assertThat(preview.valid).isFalse()
        assertThat(preview.highlights.single().authorMatched).isFalse()
    }

    @Test
    fun `manual trusted binding rejects a membership id owned by another display name`() {
        val fixture = Fixture()
        val target =
            SessionImportTarget(
                sessionId = fixture.command.sessionId,
                clubId = fixture.host.clubId,
                sessionNumber = 1,
                bookTitle = "Book",
                meetingDate = LocalDate.of(2026, 7, 23),
                attendees =
                    listOf(
                        SessionImportAttendee(
                            membershipId = fixture.authorMembershipId,
                            displayName = "Authoritative Member",
                            active = true,
                        ),
                    ),
            )
        val service = SessionImportService(TargetOnlyWritePort(target))

        val preview =
            service.validate(
                fixture.command,
                mapOf("Member" to fixture.authorMembershipId),
                emptyMap(),
            )

        assertThat(preview.valid).isFalse()
        assertThat(preview.highlights.single().authorMatched).isFalse()
        assertThat(preview.oneLineReviews.single().authorMatched).isFalse()
    }

    @Test
    fun `record owned replacement validates and keeps normalized live write and cache invalidation contract`() {
        val fixture = Fixture()
        val preview = fixture.validator.validate(fixture.command)
        val writePort = RecordingWritePort(fixture.target())
        val cache = RecordingCacheInvalidation()
        val service: ReplaceSessionRecordContentPort = SessionImportService(writePort, cache)

        val result =
            service.replace(
                SessionRecordContentReplacement(
                    host = fixture.host,
                    sessionId = fixture.command.sessionId,
                    sessionNumber = fixture.command.session.number,
                    bookTitle = fixture.command.session.bookTitle,
                    meetingDate = fixture.command.session.meetingDate,
                    snapshot =
                        fixture.command
                            .toCanonicalSnapshot(preview)
                            .copy(publicationSummary = "  Summary  "),
                    source = SessionRecordDraftSource.JSON_IMPORT,
                    trustedAuthorBindings = mapOf("Member" to fixture.authorMembershipId),
                    historicalAuthorBindings = emptyMap(),
                ),
            )

        assertThat(writePort.replacement?.publicationSummary).isEqualTo("Summary")
        assertThat(result).isInstanceOf(SessionRecordContentReplacementResult.Applied::class.java)
        assertThat((result as SessionRecordContentReplacementResult.Applied).canonicalSnapshot.publicationSummary)
            .isEqualTo("Summary")
        assertThat(cache.evictedClubId).isEqualTo(fixture.host.clubId)
    }

    @Test
    fun `record owned replacement rejects invalid content without a live write`() {
        val fixture = Fixture()
        val writePort = RecordingWritePort(fixture.target())
        val service: ReplaceSessionRecordContentPort = SessionImportService(writePort)
        val invalidSnapshot =
            fixture.command.toCanonicalSnapshot(fixture.validator.validate(fixture.command)).copy(
                publicationSummary = " ",
            )

        val result =
            service.replace(
                SessionRecordContentReplacement(
                    host = fixture.host,
                    sessionId = fixture.command.sessionId,
                    sessionNumber = fixture.command.session.number,
                    bookTitle = fixture.command.session.bookTitle,
                    meetingDate = fixture.command.session.meetingDate,
                    snapshot = invalidSnapshot,
                    source = SessionRecordDraftSource.JSON_IMPORT,
                    trustedAuthorBindings = mapOf("Member" to fixture.authorMembershipId),
                    historicalAuthorBindings = emptyMap(),
                ),
            )

        assertThat(result).isEqualTo(SessionRecordContentReplacementResult.Invalid)
        assertThat(writePort.replacement).isNull()
    }

    private class Fixture {
        val authorMembershipId: UUID = UUID.randomUUID()
        val host =
            CurrentMember(
                userId = UUID.randomUUID(),
                membershipId = UUID.randomUUID(),
                clubId = UUID.randomUUID(),
                clubSlug = "test-club",
                email = "host@example.test",
                displayName = "Host",
                accountName = "host",
                role = MembershipRole.HOST,
            )
        val command =
            SessionImportCommand(
                host = host,
                sessionId = UUID.randomUUID(),
                recordVisibility = SessionRecordVisibility.MEMBER,
                format = "readmates-session-import:v1",
                session = SessionImportSessionCommand(1, "Book", LocalDate.of(2026, 7, 23)),
                publication = SessionImportPublicationCommand("Summary"),
                highlights = listOf(SessionImportRecordCommand("Member", "Highlight")),
                oneLineReviews = listOf(SessionImportRecordCommand("Member", "Review")),
                feedbackDocument =
                    SessionImportFeedbackDocumentCommand(
                        "feedback.md",
                        VALID_FEEDBACK_MARKDOWN,
                    ),
            )
        val validator = FakeValidator(authorMembershipId)
        val drafts = FakeDrafts(authorMembershipId)
        val service = SessionImportDraftService(validator, drafts)

        fun target() =
            SessionImportTarget(
                sessionId = command.sessionId,
                clubId = host.clubId,
                sessionNumber = command.session.number,
                bookTitle = command.session.bookTitle,
                meetingDate = command.session.meetingDate,
                attendees =
                    listOf(
                        SessionImportAttendee(
                            membershipId = authorMembershipId,
                            displayName = "Member",
                            active = true,
                        ),
                    ),
            )
    }

    private class FakeValidator(
        private val authorMembershipId: UUID,
    ) : ValidateSessionImportUseCase {
        var lastTrustedBindings: Map<String, UUID> = emptyMap()

        override fun validate(
            command: SessionImportCommand,
            trustedAuthorBindings: Map<String, UUID>,
            historicalAuthorBindings: Map<String, UUID>,
            trustAuthorDisplayNames: Boolean,
        ): SessionImportPreviewResult {
            lastTrustedBindings = trustedAuthorBindings
            val record = SessionImportRecordPreview("Member", "Text", true, authorMembershipId.toString())
            return SessionImportPreviewResult(
                valid = true,
                session = SessionImportSessionPreview(1, "Book", "2026-07-23"),
                publication = SessionImportPublicationPreview("Summary"),
                highlights = listOf(record.copy(text = "Highlight")),
                oneLineReviews = listOf(record.copy(text = "Review")),
                feedbackDocument = SessionImportFeedbackDocumentPreview("feedback.md", "Feedback", true),
                issues = emptyList(),
            )
        }
    }

    private class FakeDrafts(
        private val authorMembershipId: UUID,
    ) : ManageSessionRecordDraftUseCase {
        var savedCommand: SaveSessionRecordDraftCommand? = null

        override fun saveValidatedSnapshot(
            host: AuthenticatedClubActor,
            command: SaveSessionRecordDraftCommand,
        ): SessionRecordDraft {
            savedCommand = command
            return SessionRecordDraft(
                sessionId = command.sessionId,
                clubId = host.clubId,
                baseLiveRevision = 0,
                draftRevision = 1,
                source = command.source,
                restoredFromRevisionId = null,
                snapshot = command.snapshot,
                updatedByMembershipId = host.membershipId,
                createdAt = OffsetDateTime.of(2026, 7, 23, 0, 0, 0, 0, ZoneOffset.UTC),
                updatedAt = OffsetDateTime.of(2026, 7, 23, 0, 0, 0, 0, ZoneOffset.UTC),
            )
        }

        override fun getEditor(
            host: AuthenticatedClubActor,
            sessionId: UUID,
        ): SessionRecordEditor =
            SessionRecordEditor(
                live =
                    com.readmates.sessionrecord.application.model.LiveSessionRecord(
                        sessionId = sessionId,
                        clubId = host.clubId,
                        revision = 0,
                        snapshot =
                            com.readmates.sessionrecord.application.model.SessionRecordSnapshot(
                                visibility = SessionRecordVisibility.MEMBER,
                                publicationSummary = "Summary",
                                highlights =
                                    listOf(
                                        com.readmates.sessionrecord.application.model.SessionRecordEntry(
                                            authorMembershipId,
                                            "Member",
                                            "Highlight",
                                        ),
                                    ),
                                oneLineReviews =
                                    listOf(
                                        com.readmates.sessionrecord.application.model.SessionRecordEntry(
                                            authorMembershipId,
                                            "Member",
                                            "Review",
                                        ),
                                    ),
                                feedbackDocument =
                                    com.readmates.sessionrecord.application.model.SessionRecordFeedbackDocument(
                                        "feedback.md",
                                        "Feedback",
                                        "markdown",
                                    ),
                            ),
                    ),
                draft = null,
                draftLiveBaseStale = false,
            )

        override fun save(
            host: CurrentMember,
            command: SaveSessionRecordDraftCommand,
        ): SessionRecordDraft = error("Not used")

        override fun rebase(
            host: CurrentMember,
            command: RebaseSessionRecordDraftCommand,
        ): SessionRecordDraft = error("Not used")

        override fun discard(
            host: CurrentMember,
            sessionId: UUID,
            expectedDraftRevision: Long,
        ) = error("Not used")

        override fun restore(
            host: CurrentMember,
            command: RestoreSessionRecordDraftCommand,
        ): SessionRecordDraft = error("Not used")
    }

    private class TargetOnlyWritePort(
        private val target: SessionImportTarget,
    ) : SessionImportWritePort {
        override fun loadTarget(
            host: AuthenticatedClubActor,
            sessionId: UUID,
        ): SessionImportTarget = target

        override fun replaceRecords(command: SessionImportRecordReplacement): SessionImportStoredFeedbackDocument =
            error("Live replacement must not run")
    }

    private class RecordingWritePort(
        private val target: SessionImportTarget,
    ) : SessionImportWritePort {
        var replacement: SessionImportRecordReplacement? = null

        override fun loadTarget(
            host: AuthenticatedClubActor,
            sessionId: UUID,
        ): SessionImportTarget = target

        override fun replaceRecords(command: SessionImportRecordReplacement): SessionImportStoredFeedbackDocument {
            replacement = command
            return SessionImportStoredFeedbackDocument(
                fileName = command.feedbackDocument.fileName,
                title = command.feedbackTitle,
                uploadedAt = "2026-07-23T00:00:00Z",
                version = 1,
            )
        }
    }

    private class RecordingCacheInvalidation : ReadCacheInvalidationPort {
        var evictedClubId: UUID? = null

        override fun evictClubContent(clubId: UUID) {
            evictedClubId = clubId
        }
    }
}

private val VALID_FEEDBACK_MARKDOWN =
    """
    <!-- readmates-feedback:v1 -->

    # 독서모임 1차 피드백

    Book · 2026.07.23

    ## 메타

    - 책: Book

    ## 관찰자 노트

    Test note.

    ## 참여자별 피드백

    ### 01. Member

    역할: 참여자

    #### 참여 스타일

    Steady.

    #### 실질 기여

    - Shared a perspective.

    #### 문제점과 자기모순

    ##### 1. Scope

    - 핵심: Broad.
    - 근거: Several examples.
    - 해석: Narrow it.

    #### 실천 과제

    1. Lead with the conclusion.

    #### 드러난 한 문장

    > Keep it focused.

    맥락: Test

    주석: Test fixture.
    """.trimIndent()
