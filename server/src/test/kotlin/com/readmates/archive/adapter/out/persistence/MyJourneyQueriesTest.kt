package com.readmates.archive.adapter.out.persistence

import com.readmates.archive.application.model.MyJourneyResult
import com.readmates.archive.application.model.MyJourneySummaryResult
import com.readmates.auth.domain.MembershipRole
import com.readmates.shared.paging.CursorCodec
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.jdbc.Sql
import java.util.UUID

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@Tag("integration")
@Sql(statements = [CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
class MyJourneyQueriesTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val queries = MyJourneyQueries()

    @BeforeEach
    fun seedJourneyFixtures() {
        insertFixtureClubs()
        insertFixtureMember()
        insertOtherCurrentClubMember()
        insertVisibleJourneySessions()
        insertExcludedJourneySessions()
        insertCurrentMemberActivity()
        insertOtherCurrentClubMemberActivity()
    }

    private fun insertVisibleJourneySessions() {
        insertSession(
            ATTENDED_CLOSED_SESSION_ID,
            910,
            "2026-07-20",
            "CLOSED",
            "MEMBER",
            "Attended Book",
            "Writer A",
            COVER_URL,
        )
        insertSession(
            QUESTION_ONLY_SESSION_ID,
            911,
            "2026-07-20",
            "PUBLISHED",
            "PUBLIC",
            "Question Book",
            "Writer B",
            null,
        )
        insertSession(
            LONG_REVIEW_ONLY_SESSION_ID,
            909,
            "2026-07-19",
            "PUBLISHED",
            "MEMBER",
            "Review Book",
            "Writer C",
            COVER_URL,
        )
        insertSession(
            FEEDBACK_ONLY_SESSION_ID,
            908,
            "2026-07-18",
            "CLOSED",
            "PUBLIC",
            "Feedback Book",
            "Writer D",
            COVER_URL,
        )
        insertSession(
            SECOND_ATTENDED_SESSION_ID,
            907,
            "2026-07-17",
            "PUBLISHED",
            "MEMBER",
            "Second Attendance",
            "Writer E",
            COVER_URL,
        )
    }

    private fun insertExcludedJourneySessions() {
        insertSession(
            HOST_ONLY_SESSION_ID,
            912,
            "2026-07-21",
            "CLOSED",
            "HOST_ONLY",
            "Hidden Book",
            "Writer F",
            COVER_URL,
        )
        insertSession(
            OTHER_CLUB_SESSION_ID,
            911,
            "2026-07-21",
            "PUBLISHED",
            "PUBLIC",
            "Other Club Book",
            "Writer G",
            COVER_URL,
            OTHER_CLUB_ID,
        )
        insertSession(
            OTHER_CURRENT_MEMBER_ONLY_SESSION_ID,
            913,
            "2026-07-22",
            "PUBLISHED",
            "MEMBER",
            "Other Member Book",
            "Writer H",
            COVER_URL,
        )
    }

    private fun insertCurrentMemberActivity() {
        insertAttendedParticipant(ATTENDED_CLOSED_SESSION_ID, MEMBERSHIP_ID, CLUB_ID, ATTENDED_PARTICIPANT_ID)
        insertAttendedParticipant(SECOND_ATTENDED_SESSION_ID, MEMBERSHIP_ID, CLUB_ID, SECOND_ATTENDED_PARTICIPANT_ID)
        insertAttendedParticipant(HOST_ONLY_SESSION_ID, MEMBERSHIP_ID, CLUB_ID, HOST_ONLY_PARTICIPANT_ID)
        insertAttendedParticipant(OTHER_CLUB_SESSION_ID, OTHER_MEMBERSHIP_ID, OTHER_CLUB_ID, OTHER_CLUB_PARTICIPANT_ID)

        insertReadingCheckin(ATTENDED_CLOSED_SESSION_ID, MEMBERSHIP_ID, CLUB_ID, COMPLETED_CHECKIN_ID, 100)
        insertReadingCheckin(FEEDBACK_ONLY_SESSION_ID, MEMBERSHIP_ID, CLUB_ID, UNATTENDED_COMPLETED_CHECKIN_ID, 100)
        insertReadingCheckin(HOST_ONLY_SESSION_ID, MEMBERSHIP_ID, CLUB_ID, HOST_ONLY_CHECKIN_ID, 100)
        insertReadingCheckin(OTHER_CLUB_SESSION_ID, OTHER_MEMBERSHIP_ID, OTHER_CLUB_ID, OTHER_CLUB_CHECKIN_ID, 100)

        repeat(3) { index ->
            insertQuestion(
                sessionId = QUESTION_ONLY_SESSION_ID,
                membershipId = MEMBERSHIP_ID,
                clubId = CLUB_ID,
                questionId = UUID.fromString("71000000-0000-0000-0000-00000000000${index + 1}"),
                priority = index + 1,
            )
        }
        insertQuestion(HOST_ONLY_SESSION_ID, MEMBERSHIP_ID, CLUB_ID, HOST_ONLY_QUESTION_ID, 1)
        insertQuestion(OTHER_CLUB_SESSION_ID, OTHER_MEMBERSHIP_ID, OTHER_CLUB_ID, OTHER_CLUB_QUESTION_ID, 1)

        insertLongReview(LONG_REVIEW_ONLY_SESSION_ID, MEMBERSHIP_ID, CLUB_ID, LONG_REVIEW_ID)
        insertLongReview(HOST_ONLY_SESSION_ID, MEMBERSHIP_ID, CLUB_ID, HOST_ONLY_REVIEW_ID)
        insertLongReview(OTHER_CLUB_SESSION_ID, OTHER_MEMBERSHIP_ID, OTHER_CLUB_ID, OTHER_CLUB_REVIEW_ID)

        insertFeedbackDocument(FEEDBACK_ONLY_SESSION_ID, CLUB_ID, FEEDBACK_DOCUMENT_ID)
        insertFeedbackDocument(HOST_ONLY_SESSION_ID, CLUB_ID, HOST_ONLY_FEEDBACK_DOCUMENT_ID)
        insertFeedbackDocument(OTHER_CLUB_SESSION_ID, OTHER_CLUB_ID, OTHER_CLUB_FEEDBACK_DOCUMENT_ID)
    }

    private fun insertOtherCurrentClubMemberActivity() {
        insertAttendedParticipant(
            OTHER_CURRENT_MEMBER_ONLY_SESSION_ID,
            OTHER_CURRENT_CLUB_MEMBERSHIP_ID,
            CLUB_ID,
            OTHER_CURRENT_CLUB_PARTICIPANT_ID,
        )
        insertReadingCheckin(
            OTHER_CURRENT_MEMBER_ONLY_SESSION_ID,
            OTHER_CURRENT_CLUB_MEMBERSHIP_ID,
            CLUB_ID,
            OTHER_CURRENT_CLUB_CHECKIN_ID,
            100,
        )
        insertQuestion(
            OTHER_CURRENT_MEMBER_ONLY_SESSION_ID,
            OTHER_CURRENT_CLUB_MEMBERSHIP_ID,
            CLUB_ID,
            OTHER_CURRENT_CLUB_QUESTION_ID,
            1,
        )
        insertLongReview(
            OTHER_CURRENT_MEMBER_ONLY_SESSION_ID,
            OTHER_CURRENT_CLUB_MEMBERSHIP_ID,
            CLUB_ID,
            OTHER_CURRENT_CLUB_REVIEW_ID,
        )
    }

    @Test
    fun `loads only the current member journey in stable order with continuous cursor pages`() {
        val firstPage =
            queries.loadMyJourney(
                jdbcTemplate,
                currentMember(),
                PageRequest.cursor(3, null, defaultLimit = 12, maxLimit = 100),
            )

        assertFirstJourneyPage(firstPage)

        val secondPage =
            queries.loadMyJourney(
                jdbcTemplate,
                currentMember(),
                PageRequest.cursor(3, firstPage.nextCursor, defaultLimit = 12, maxLimit = 100),
            )

        assertSecondJourneyPage(secondPage)

        val combinedSessionIds = (firstPage.items + secondPage.items).map { it.sessionId }
        assertThat(combinedSessionIds)
            .containsExactly(
                QUESTION_ONLY_SESSION_ID.toString(),
                ATTENDED_CLOSED_SESSION_ID.toString(),
                LONG_REVIEW_ONLY_SESSION_ID.toString(),
                FEEDBACK_ONLY_SESSION_ID.toString(),
                SECOND_ATTENDED_SESSION_ID.toString(),
            ).doesNotHaveDuplicates()
        assertThat(combinedSessionIds)
            .doesNotContain(
                HOST_ONLY_SESSION_ID.toString(),
                OTHER_CLUB_SESSION_ID.toString(),
                OTHER_CURRENT_MEMBER_ONLY_SESSION_ID.toString(),
            )

        val sameTupleCursor =
            CursorCodec.encode(
                mapOf(
                    "date" to "2026-07-20",
                    "sessionNumber" to "911",
                    "sessionId" to "ffffffff-ffff-ffff-ffff-ffffffffffff",
                ),
            )
        val idTieBreakerPage =
            queries.loadMyJourney(
                jdbcTemplate,
                currentMember(),
                PageRequest.cursor(1, sameTupleCursor, defaultLimit = 12, maxLimit = 100),
            )
        assertThat(idTieBreakerPage.items.single().sessionId).isEqualTo(QUESTION_ONLY_SESSION_ID.toString())
    }

    private fun assertFirstJourneyPage(firstPage: MyJourneyResult) {
        assertThat(firstPage.items.map { it.sessionId })
            .containsExactly(
                QUESTION_ONLY_SESSION_ID.toString(),
                ATTENDED_CLOSED_SESSION_ID.toString(),
                LONG_REVIEW_ONLY_SESSION_ID.toString(),
            )
        assertThat(firstPage.nextCursor).isNotBlank()
        assertThat(firstPage.items.first().bookImageUrl).isNull()
        assertThat(firstPage.items.first().readingProgress).isNull()
        assertThat(firstPage.items.first().questionCount).isEqualTo(3)
        assertThat(firstPage.items.first().reviewCount).isZero()
        val unavailableFeedback = firstPage.items.first().feedbackDocument
        assertThat(unavailableFeedback.available).isFalse()
        assertThat(unavailableFeedback.readable).isFalse()
        assertThat(unavailableFeedback.lockedReason).isEqualTo("NOT_AVAILABLE")
        assertThat(firstPage.items[1].readingProgress).isEqualTo(100)
    }

    private fun assertSecondJourneyPage(secondPage: MyJourneyResult) {
        assertThat(secondPage.items.map { it.sessionId })
            .containsExactly(
                FEEDBACK_ONLY_SESSION_ID.toString(),
                SECOND_ATTENDED_SESSION_ID.toString(),
            )
        assertThat(secondPage.nextCursor).isNull()
        val readableFeedback = secondPage.items.first().feedbackDocument
        assertThat(secondPage.items.first().readingProgress).isEqualTo(100)
        assertThat(readableFeedback.available).isTrue()
        assertThat(readableFeedback.readable).isTrue()
        assertThat(readableFeedback.lockedReason).isNull()
    }

    @Test
    fun `summary covers the whole eligible journey independently of page limit`() {
        val firstPage =
            queries.loadMyJourney(
                jdbcTemplate,
                currentMember(),
                PageRequest.cursor(1, null, defaultLimit = 12, maxLimit = 100),
            )

        assertThat(firstPage.items).hasSize(1)
        assertThat(firstPage.summary).isEqualTo(
            MyJourneySummaryResult(
                attendedSessionCount = 2,
                completedReadingCount = 1,
                questionCount = 3,
                reviewCount = 1,
                readableFeedbackDocumentCount = 1,
            ),
        )
    }

    private fun currentMember() =
        CurrentMember(
            userId = USER_ID,
            membershipId = MEMBERSHIP_ID,
            clubId = CLUB_ID,
            clubSlug = "journey-club",
            email = "journey-member@example.com",
            displayName = "Journey Member",
            accountName = "Journey Member",
            role = MembershipRole.MEMBER,
        )

    private fun insertFixtureClubs() {
        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about)
            values (?, 'journey-club', 'Journey Club', 'A public-safe journey fixture.', 'Journey fixture club.')
            """.trimIndent(),
            CLUB_ID.toString(),
        )
        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about)
            values (?, 'other-journey-club', 'Other Journey Club', 'A club-isolation fixture.', 'Other fixture club.')
            """.trimIndent(),
            OTHER_CLUB_ID.toString(),
        )
    }

    private fun insertFixtureMember() {
        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, auth_provider)
            values (?, 'readmates-test-journey-member', 'journey-member@example.com', 'Journey Member', 'Journey', 'GOOGLE')
            """.trimIndent(),
            USER_ID.toString(),
        )
        insertMembership(MEMBERSHIP_ID, CLUB_ID)
        insertMembership(OTHER_MEMBERSHIP_ID, OTHER_CLUB_ID)
    }

    private fun insertOtherCurrentClubMember() {
        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, auth_provider)
            values (?, 'readmates-test-other-journey-member', 'other-journey-member@example.com',
              'Other Journey Member', 'Other Journey', 'GOOGLE')
            """.trimIndent(),
            OTHER_CURRENT_CLUB_USER_ID.toString(),
        )
        insertMembership(
            OTHER_CURRENT_CLUB_MEMBERSHIP_ID,
            CLUB_ID,
            OTHER_CURRENT_CLUB_USER_ID,
            "Other Journey",
        )
    }

    private fun insertMembership(
        membershipId: UUID,
        clubId: UUID,
        userId: UUID = USER_ID,
        shortName: String = "Journey",
    ) {
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            values (?, ?, ?, 'MEMBER', 'ACTIVE', '2026-01-01 00:00:00', ?, 'globe-notebook')
            """.trimIndent(),
            membershipId.toString(),
            clubId.toString(),
            userId.toString(),
            shortName,
        )
    }

    private fun insertSession(
        sessionId: UUID,
        number: Int,
        date: String,
        state: String,
        visibility: String,
        bookTitle: String,
        bookAuthor: String,
        bookImageUrl: String?,
        clubId: UUID = CLUB_ID,
    ) {
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, book_image_url, session_date,
              start_time, end_time, question_deadline_at, location_label, state, visibility
            )
            values (?, ?, ?, ?, ?, ?, ?, ?, '19:00:00', '21:00:00', '2026-07-01 12:00:00', 'Online', ?, ?)
            """.trimIndent(),
            sessionId.toString(),
            clubId.toString(),
            number,
            "Session $number",
            bookTitle,
            bookAuthor,
            bookImageUrl,
            date,
            state,
            visibility,
        )
    }

    private fun insertAttendedParticipant(
        sessionId: UUID,
        membershipId: UUID,
        clubId: UUID,
        participantId: UUID,
    ) {
        jdbcTemplate.update(
            """
            insert into session_participants (
              id, club_id, session_id, membership_id, rsvp_status, attendance_status, participation_status
            )
            values (?, ?, ?, ?, 'GOING', 'ATTENDED', 'ACTIVE')
            """.trimIndent(),
            participantId.toString(),
            clubId.toString(),
            sessionId.toString(),
            membershipId.toString(),
        )
    }

    private fun insertReadingCheckin(
        sessionId: UUID,
        membershipId: UUID,
        clubId: UUID,
        checkinId: UUID,
        readingProgress: Int,
    ) {
        jdbcTemplate.update(
            """
            insert into reading_checkins (id, club_id, session_id, membership_id, reading_progress)
            values (?, ?, ?, ?, ?)
            """.trimIndent(),
            checkinId.toString(),
            clubId.toString(),
            sessionId.toString(),
            membershipId.toString(),
            readingProgress,
        )
    }

    private fun insertQuestion(
        sessionId: UUID,
        membershipId: UUID,
        clubId: UUID,
        questionId: UUID,
        priority: Int,
    ) {
        jdbcTemplate.update(
            """
            insert into questions (id, club_id, session_id, membership_id, priority, text)
            values (?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            questionId.toString(),
            clubId.toString(),
            sessionId.toString(),
            membershipId.toString(),
            priority,
            "Public-safe journey question $priority",
        )
    }

    private fun insertLongReview(
        sessionId: UUID,
        membershipId: UUID,
        clubId: UUID,
        reviewId: UUID,
    ) {
        jdbcTemplate.update(
            """
            insert into long_reviews (id, club_id, session_id, membership_id, body, visibility)
            values (?, ?, ?, ?, 'Public-safe journey review.', 'PUBLIC')
            """.trimIndent(),
            reviewId.toString(),
            clubId.toString(),
            sessionId.toString(),
            membershipId.toString(),
        )
    }

    private fun insertFeedbackDocument(
        sessionId: UUID,
        clubId: UUID,
        documentId: UUID,
    ) {
        jdbcTemplate.update(
            """
            insert into session_feedback_documents (
              id, club_id, session_id, version, source_text, file_name, content_type, file_size, document_title
            )
            values (?, ?, ?, 1, '<!-- readmates-feedback:v1 -->', 'journey-feedback.md', 'text/markdown', 32, 'Journey feedback')
            """.trimIndent(),
            documentId.toString(),
            clubId.toString(),
            sessionId.toString(),
        )
    }
}

private val CLUB_ID: UUID = UUID.fromString("70000000-0000-0000-0000-000000000011")
private val OTHER_CLUB_ID: UUID = UUID.fromString("70000000-0000-0000-0000-000000000012")
private val USER_ID: UUID = UUID.fromString("70000000-0000-0000-0000-000000000001")
private val MEMBERSHIP_ID: UUID = UUID.fromString("70000000-0000-0000-0000-000000000002")
private val OTHER_MEMBERSHIP_ID: UUID = UUID.fromString("70000000-0000-0000-0000-000000000003")
private val OTHER_CURRENT_CLUB_USER_ID: UUID = UUID.fromString("70000000-0000-0000-0000-000000000004")
private val OTHER_CURRENT_CLUB_MEMBERSHIP_ID: UUID = UUID.fromString("70000000-0000-0000-0000-000000000005")

private val ATTENDED_CLOSED_SESSION_ID: UUID = UUID.fromString("70000000-0000-0000-0000-000000000101")
private val QUESTION_ONLY_SESSION_ID: UUID = UUID.fromString("70000000-0000-0000-0000-000000000102")
private val LONG_REVIEW_ONLY_SESSION_ID: UUID = UUID.fromString("70000000-0000-0000-0000-000000000103")
private val FEEDBACK_ONLY_SESSION_ID: UUID = UUID.fromString("70000000-0000-0000-0000-000000000104")
private val SECOND_ATTENDED_SESSION_ID: UUID = UUID.fromString("70000000-0000-0000-0000-000000000105")
private val HOST_ONLY_SESSION_ID: UUID = UUID.fromString("70000000-0000-0000-0000-000000000106")
private val OTHER_CLUB_SESSION_ID: UUID = UUID.fromString("70000000-0000-0000-0000-000000000107")
private val OTHER_CURRENT_MEMBER_ONLY_SESSION_ID: UUID = UUID.fromString("70000000-0000-0000-0000-000000000108")

private val ATTENDED_PARTICIPANT_ID: UUID = UUID.fromString("70000000-0000-0000-0000-000000000201")
private val SECOND_ATTENDED_PARTICIPANT_ID: UUID = UUID.fromString("70000000-0000-0000-0000-000000000202")
private val HOST_ONLY_PARTICIPANT_ID: UUID = UUID.fromString("70000000-0000-0000-0000-000000000203")
private val OTHER_CLUB_PARTICIPANT_ID: UUID = UUID.fromString("70000000-0000-0000-0000-000000000204")
private val OTHER_CURRENT_CLUB_PARTICIPANT_ID: UUID = UUID.fromString("70000000-0000-0000-0000-000000000205")

private val COMPLETED_CHECKIN_ID: UUID = UUID.fromString("70000000-0000-0000-0000-000000000301")
private val HOST_ONLY_CHECKIN_ID: UUID = UUID.fromString("70000000-0000-0000-0000-000000000302")
private val OTHER_CLUB_CHECKIN_ID: UUID = UUID.fromString("70000000-0000-0000-0000-000000000303")
private val OTHER_CURRENT_CLUB_CHECKIN_ID: UUID = UUID.fromString("70000000-0000-0000-0000-000000000304")
private val UNATTENDED_COMPLETED_CHECKIN_ID: UUID = UUID.fromString("70000000-0000-0000-0000-000000000305")

private val LONG_REVIEW_ID: UUID = UUID.fromString("70000000-0000-0000-0000-000000000401")
private val HOST_ONLY_REVIEW_ID: UUID = UUID.fromString("70000000-0000-0000-0000-000000000402")
private val OTHER_CLUB_REVIEW_ID: UUID = UUID.fromString("70000000-0000-0000-0000-000000000403")
private val OTHER_CURRENT_CLUB_REVIEW_ID: UUID = UUID.fromString("70000000-0000-0000-0000-000000000404")

private val HOST_ONLY_QUESTION_ID: UUID = UUID.fromString("70000000-0000-0000-0000-000000000501")
private val OTHER_CLUB_QUESTION_ID: UUID = UUID.fromString("70000000-0000-0000-0000-000000000502")
private val OTHER_CURRENT_CLUB_QUESTION_ID: UUID = UUID.fromString("70000000-0000-0000-0000-000000000503")

private val FEEDBACK_DOCUMENT_ID: UUID = UUID.fromString("70000000-0000-0000-0000-000000000601")
private val HOST_ONLY_FEEDBACK_DOCUMENT_ID: UUID = UUID.fromString("70000000-0000-0000-0000-000000000602")
private val OTHER_CLUB_FEEDBACK_DOCUMENT_ID: UUID = UUID.fromString("70000000-0000-0000-0000-000000000603")

private const val COVER_URL = "https://example.com/journey-cover.jpg"

private const val CLEANUP_SQL = """
delete from session_feedback_documents where id like '70000000-0000-0000-0000-%';
delete from long_reviews where id like '70000000-0000-0000-0000-%';
delete from questions where id like '70000000-0000-0000-0000-%' or id like '71000000-0000-0000-0000-%';
delete from reading_checkins where id like '70000000-0000-0000-0000-%';
delete from session_participants where id like '70000000-0000-0000-0000-%';
delete from sessions where id like '70000000-0000-0000-0000-%';
delete from memberships where id like '70000000-0000-0000-0000-%';
delete from users where id like '70000000-0000-0000-0000-%';
delete from clubs where id like '70000000-0000-0000-0000-%';
"""
